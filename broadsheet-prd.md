# Broadsheet — Product Requirements Document

**Status:** Draft v0.1  
**Owner:** Max Clayton Clowes  
**Last updated:** April 2026

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

### 1. Mobile App (iOS + Android) — Primary Surface

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

**Structured data** (users, article metadata, tags, read state): standard relational DB — Postgres via Supabase or similar.

**Article content** (Markdown): **Folio** — the markdown-native database tool noted as a candidate. This is the right fit: content is document-shaped, not row-shaped. Folio handles versioning and retrieval natively.

One concern worth flagging: Folio is relatively new tooling. Assess maturity before committing article storage to it. Define a fallback (S3 + flat files keyed by article ID) in case it proves unsuitable at scale or lacks operational tooling.

---

## Technical Architecture (Sketch)

```
User (mobile/web/extension)
        │
        ▼
   Clerk Auth Layer
        │
        ▼
   Broadsheet API (Node/TypeScript or Go)
        │
        ├── Ingestion Service
        │     ├── Open: fetch → parse → Markdown
        │     └── Paywall: receive client-extracted Markdown
        │
        ├── Article Store → Folio (Markdown content)
        │
        └── Metadata Store → Postgres (articles, users, tags, read state)
```

Mobile and web clients share the same API. The Chrome extension calls the same save endpoint.

---

## MVP Scope

The minimum viable product needs to answer one question convincingly: *can someone save an article from their phone and read it cleanly later?*

**In scope for MVP:**
- iOS app with share sheet integration
- Chrome extension (save only)
- Web app (library + reader, PWA)
- Open article ingestion (server-side fetch + parse to Markdown)
- Clerk auth
- Basic tagging and read/unread state
- Folio for article content storage

**Out of scope for MVP:**
- Paywalled article extraction (design the hook; implement post-MVP)
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
