# Broadsheet — Product Requirements Document

**Status:** Draft v0.1 (aspirational — see "Implementation status" below)
**Owner:** Max Clayton Clowes
**Last updated:** April 2026

> **Implementation status note (April 2026):** This PRD predates the MVP build and documents the full target product. What currently exists in the repo is a subset: a Next.js web app (library + reader), a Chrome extension save trigger, Clerk auth, and open-article ingestion. There is no iOS app, no Postgres/Supabase, and no separate API service — metadata and article bodies both live in Folio (`folio-db-next`), backed by Vercel Blob in production. Sections below marked **[aspirational]** describe intended product surface that does not yet exist.

---

## Overview

Broadsheet is a read-it-later application. It does what Pocket did, and what Mozilla quietly buried: let people save articles from anywhere, read them cleanly, and not lose them.

The market gap is real. Pocket's decline and eventual wind-down leaves a significant user base with institutional memory of what a good reading tool feels like. This isn't a reinvention — it's a careful reconstruction with a few decisions made better from the start.

---

## Core Principles

- **Save friction is the enemy.** Every tap between "I want to read this" and "it's saved" is a conversion killer.
- **Reading is the product.** The app exists to surface articles cleanly, not to compete with the articles themselves.
- **Parse at ingestion, not at read time.** Convert articles to Markdown when they're saved. Faster rendering, offline support, lower compute at scale.
- **Open articles and paywalled articles are different problems.** Treat them as such from the start.

---

## Product Surface

### 1. Mobile App (iOS + Android) — Primary Surface [aspirational]

The highest-value surface. Most save intent happens on mobile: reading in Safari, following a link in a newsletter, skimming Twitter.

**Share Sheet Integration**  
The core save mechanism. Users share a URL to Broadsheet from any app — Safari, Chrome, Mail, Slack, etc. The app must appear as a share target.

On share:
- URL is captured
- Article is fetched and parsed to Markdown in the background (see Article Ingestion below)
- Success/failure is communicated without blocking the user's current context

**Reading Experience**  
- Markdown-rendered article view: clean typography, configurable font size/theme
- Estimated read time
- Tagging and archive
- Offline support (Markdown is already stored; no re-fetch needed)

**Library View**  
- Feed of saved articles (title, source, estimated read time, tag)
- Filter by tag, source, read/unread
- Search

---

### 2. Web App — Secondary Surface (PWA)

No dedicated desktop app. A well-built PWA covers the use case and ships faster.

- Full reading and library management
- PWA manifest and service worker for installability and offline support
- Responsive: works on desktop browsers, installable to home screen on mobile
- Auth-gated on load

The web app should feel native, not like a fallback.

---

### 3. Chrome Extension — Save Trigger

A browser extension for desktop saving. Minimal scope: one click to save the current tab.

- Toolbar button: click to save current URL
- Keyboard shortcut support
- Visual confirmation (badge or toast)
- No reading UI — that's the web app's job

Firefox extension is a v2 consideration.

---

## Article Ingestion

This is where most of the engineering complexity lives.

### Class 1: Open Articles

Standard articles accessible without authentication.

**Process:**
1. URL received (via share sheet or extension)
2. Server fetches page HTML
3. Parses article body using a readability library (e.g. Mozilla's `@mozilla/readability`, or a maintained fork)
4. Converts to Markdown
5. Stores Markdown + metadata (title, author, source domain, date, word count, original URL)

This keeps the reading experience consistent regardless of what happens to the original source — paywalls go up, pages move, sites die.

### Class 2: Paywalled / Auth-Required Articles

These cannot be fetched server-side. Two possible approaches:

**Option A: Browser-side extraction (preferred for MVP)**  
The Chrome extension (or a share sheet companion in the mobile app) extracts the rendered DOM from within the user's authenticated browser session, parses it client-side, and sends Markdown to the server. The user's credentials never leave their browser.

Limitations: requires extension or in-app browser; doesn't work for pure share-sheet saves from Safari.

**Option B: Deferred / manual**  
Save the URL as-is, flag it as potentially paywalled, and surface a prompt to the user to open-and-extract when they next have access. Less elegant but honest about the constraint.

**Recommendation:** Implement Option A in the extension from the start. On mobile, initially accept graceful degradation (save metadata only, prompt user to open in-app browser to extract). Revisit with a proper mobile in-app browser approach in v2.

---

## Authentication

Use **Clerk** for auth from day one. No custom auth. Clerk handles:
- Email/password + social providers (Google, Apple minimum)
- Session management
- JWT issuance for API calls
- Mobile SDK and web SDK

This is a non-negotiable early decision. Auth added later is auth added wrong.

---

## Data Storage

**Current implementation:** both structured metadata (title, URL, tags, read/archive state) and article body Markdown live in a single **Folio** store (`folio-db-next`), with metadata held in per-page frontmatter. Clerk user IDs are hashed to form per-user volume names. The production adapter is Vercel Blob; dev falls back to `FsAdapter` writing to `.broadsheet-data` on disk.

**Original plan (still on the table if Folio doesn't scale):** split structured data into a relational DB (Postgres via Supabase or similar) and keep Folio — or S3 + flat files — for article content only. This would unlock SQL-level filtering, indexing, and search that frontmatter scans can't.

The "assess Folio maturity" open question has been answered pragmatically — we've committed to it for MVP. The fallback (extracting metadata into Postgres) remains feasible because the volume layout is simple and the body is already addressable by content hash.

---

## Technical Architecture

**As built (MVP):**

```
User (web / Chrome extension)
        │
        ▼
   Clerk Auth
        │
        ▼
   Next.js App Router (Vercel Functions / Fluid Compute)
        │
        ├── /api/articles           → ingest (fetch → Readability → Turndown → save)
        ├── /api/articles/[id]      → mark read, archive, tag
        ├── /library                → list view (server component)
        └── /read/[id]              → reader (marked → DOMPurify → HTML)
                  │
                  ▼
        Folio (folio-db-next)
        per-user volume, page.frontmatter holds metadata,
        page.body holds article Markdown
                  │
                  ▼
        Vercel Blob (prod) | FsAdapter (dev) | MemoryAdapter (tests)
```

There is no separate backend service: everything runs as route handlers in the same Next.js app. Web and Chrome extension both POST to `/api/articles`.

---

## MVP Scope

The minimum viable product needs to answer one question convincingly: *can someone save an article from their phone and read it cleanly later?*

**Built and shipped:**
- Web app (library + reader) on Next.js App Router
- Chrome extension (save only) — see `apps/extension/`
- Open article ingestion (server-side fetch + Readability + Turndown → Markdown)
- Clerk auth
- Tagging, read/unread state, archive
- URL canonicalisation + dedup on save
- Folio (`folio-db-next`) for both content and metadata

**MVP scope, still unbuilt:**
- iOS app with share sheet integration (the original "primary surface" — deferred)
- PWA manifest / service worker for the web app
- Full-text search

**Explicitly out of scope (post-MVP):**
- Paywalled article extraction (design the hook; implement later)
- Android app (follows iOS)
- Firefox extension
- Social / sharing features
- Highlights and annotations
- Recommendations / discovery

---

## Open Questions

1. **Folio maturity**: What's the operational story for Folio at scale? Backup, indexing, search?
2. **Paywall extraction on mobile**: Is an in-app browser approach viable for iOS given WKWebView limitations?
3. **Markdown fidelity**: How do we handle articles with heavy image content, embedded video, interactive elements? Define acceptable degradation.
4. **Legal exposure**: Storing full article content (even for personal use) sits in a grey area. What's the ToS posture? Do we store content server-side or keep it on-device?
5. **Search**: Full-text search over Markdown at scale — does Folio support this natively, or do we need a separate search index (e.g. Meilisearch)?

---

## Next Steps

1. Validate Folio for production article storage — spike with 10k documents
2. Set up Clerk + basic API skeleton
3. Build share sheet extension (iOS) and Chrome extension in parallel
4. Define ingestion service interface and error handling for parse failures
5. First internal build: save an article, read it in the web app
