# Feature research: read-it-later apps (April 2026)

Research into what users want from read-it-later apps, what competitors offer, and what Broadsheet should consider. Compiled from web research, competitive analysis, and mapping against Broadsheet's current state and open issues.

## Market context

The read-it-later space shifted dramatically in 2024-2025:

- **Pocket shut down** July 2025 (Mozilla), displacing 20M+ users. All data permanently deleted by November 2025.
- **Omnivore shut down** November 2024 after acqui-hire by ElevenLabs.
- **Matter** pivoted/scaled back social features, focusing on newsletters + reading.

Survivors and new entrants: Readwise Reader ($8-13/mo, power users), Instapaper (free tier, simplicity), Wallabag (self-hosted OSS), Karakeep/Hoarder (AI + self-hosted), GoodLinks ($5 one-time, Apple-only), Raindrop.io (visual bookmarking).

**Key takeaway:** Users now distrust services that might disappear. Data portability, self-hosting options, and transparent architecture build trust. There's a genuine gap for a reliable, well-architected, open-source-friendly read-it-later app.

---

## Feature landscape

### 1. Saving and capture

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| One-click browser extension | All major apps | Table stakes | Chrome extension shipped |
| Mobile share sheet (iOS/Android) | Readwise, Matter, Instapaper | Critical | iOS share extension shipped |
| Keyboard shortcut to save | Readwise, Instapaper | High | Shipped (Ctrl+Shift+S) |
| Save from web UI (paste URL) | Most | Medium | Shipped (library save form) |
| Newsletter ingestion (dedicated email) | Readwise Reader, Omnivore (was), Feedbin | Very high | Not built |
| RSS feed subscriptions | Readwise Reader, Feedbin | High (power users) | Not built |
| Save YouTube videos (transcript) | Readwise Reader, Matter | Growing | Not built |
| Save PDFs | Readwise Reader | High (researchers) | Not built |
| Bulk import from Pocket/Omnivore/Instapaper | All major apps post-2025 | Critical (given shutdowns) | Not built |
| Firefox extension | Readwise, Instapaper | Medium | PRD mentions as v2 |
| Android app | Readwise, Instapaper | High | PRD defers to post-iOS |

**Insight:** Every additional tap between "I want to save this" and "it's saved" is a conversion killer. Broadsheet already handles the core save paths well. Newsletter ingestion (dedicated email address per user) is the highest-value save path not yet built.

### 2. Reading experience

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| Clean distraction-free reader | All | Table stakes | Shipped |
| Dark mode / multiple themes | Readwise, Instapaper, Matter | Table stakes | Not shipped |
| Font customization (family, size, spacing, width) | Readwise, Instapaper | High | Not shipped |
| Estimated read time | Instapaper, most apps | High | Shipped |
| Reading progress indicator | Readwise, Instapaper | Moderate | Not shipped |
| Text-to-speech / audio playback | Instapaper, Matter, Readwise (beta) | Very high | Not built |
| Keyboard-driven navigation | Readwise Reader | High (power users) | Not built |

**Insight:** TTS is consistently one of the most-requested features across all forums and reviews. Users want to listen to saved articles during commutes, exercise, and chores. Matter's "HD voices" and Instapaper's long-standing TTS are cited as killer features. Dark mode and font controls are table-stakes UX that users expect from any reading app.

### 3. Highlighting and annotation

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| Text highlighting (multi-color) | Readwise, Matter, Instapaper | Very high | Not built (PRD mentions) |
| Inline notes on highlights | Readwise, Instapaper | High | Not built |
| Export highlights to Obsidian/Notion/Logseq | Readwise (best-in-class) | Very high (knowledge workers) | Not built |
| Spaced repetition / daily review | Readwise | High (unique differentiator) | Not built |
| Highlight search | Readwise | Moderate | Not built |

**Insight:** The Readwise-to-Obsidian pipeline is frequently cited as the reason people pay $13/month. Highlight export to a PKM system is a power-user magnet. This is also where the highest willingness-to-pay lives.

### 4. Organization and search

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| Tags / labels | All major apps | Table stakes | Shipped |
| Filter by read/unread, source, archive | Most | High | Shipped |
| Tag cloud / tag browsing | Some | Moderate | Shipped (top 12 tags) |
| Full-text search | Readwise, Instapaper Premium, Wallabag | Very high | PRD planned, not built |
| Smart filters / saved searches | Readwise, Omnivore (was) | High | Not built |
| Folders / nested collections | Raindrop.io | Moderate | Not built |
| Bulk actions (tag, archive, delete multiple) | Inconsistent across apps | High (commonly missing) | Not built |
| AI auto-tagging / categorization | Karakeep, Slax Reader | Emerging, high interest | Not built |
| Sort by read time / date / source | Instapaper, most | Moderate | Partial (filter, not sort) |

**Insight:** Full-text search is gated behind paid tiers in most apps but is one of the top-requested features. Bulk actions are a surprisingly common complaint. AI auto-categorization is the next frontier — Karakeep is gaining traction specifically because of this feature.

### 5. AI and smart features

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| Article summarization | Readwise (Ghostreader), Karakeep, Readless | Very high | Not built |
| Ask questions about a document (RAG) | Readwise Reader | High (researchers) | Not built |
| AI auto-tagging | Karakeep, Stash | High | Not built |
| AI-generated daily digests | Readless | Emerging | Not built |
| Define words / simplify language | Readwise (Ghostreader) | Moderate | Not built |
| Custom AI prompts on content | Readwise (Ghostreader) | Moderate (power users) | Not built |

**Insight:** AI is described as "the dividing line between tools that simply store links and tools that actually help you use what you save." However, a vocal segment on Hacker News explicitly says they do NOT want AI cluttering simple reading workflows. The winning approach: AI that's present but non-intrusive (opt-in, not default).

### 6. Content preservation and reliability

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| Permanent article backup (survives link rot) | Instapaper, Pinboard, Raindrop Pro | Very high | Shipped (parse at save) |
| Data export (JSON, HTML, EPUB, Markdown) | Wallabag, Readwise, Raindrop | Critical post-shutdowns | Not built |
| Open source / self-hostable | Wallabag, Karakeep | High and growing | Not applicable yet |
| Image caching for offline | Wallabag, GoodLinks | Moderate | Not built |
| Offline reading (PWA / service worker) | Instapaper, GoodLinks, Wallabag | Very high | PRD planned, not built |

**Insight:** Broadsheet's parse-at-ingest approach (converting to Markdown at save time) is a genuine differentiator for content preservation. The article exists independently of the original source. Data export is now a trust signal — users want insurance that their library is portable.

### 7. Cross-platform and sync

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| Web app | All | Table stakes | Shipped |
| iOS app with share sheet | Readwise, Instapaper, GoodLinks | High | Shipped |
| Android app | Readwise, Instapaper, Wallabag | High | PRD defers |
| PWA / installable web app | Some newer entrants | Moderate | PRD planned |
| Send to Kindle / e-reader | Instapaper, Wallabag | High | Not built |

**Insight:** Send-to-Kindle is frequently requested. Kobo has native Instapaper integration; Kindle users rely on email-to-device workflows. E-ink is a strong use case for long-form reading.

### 8. Queue management and reading habits

| Feature | Competitors | Demand | Broadsheet status |
|---------|------------|--------|-------------------|
| Snooze articles (resurface later) | Quiche Reader | High | Not built |
| Reading stats (articles/week, time spent) | Limited across apps | Often requested, rarely implemented | Not built |
| Reading streaks / gamification | Book trackers, some apps | Emerging | Not built |
| "Inbox zero" queue management | Linkflare, Quiche Reader | Moderate | Not built |
| Daily digest email of saved articles | Readless | Moderate | Not built |
| Estimated read time filtering | Instapaper | Moderate | Partial (shown, not filterable) |

**Insight:** The "infinite backlog" problem is the most common complaint about read-it-later apps. Users save 10x more than they read. Apps that help manage this (snooze, digest, forced queues) are praised but rare.

---

## What Broadsheet already does well

1. **Parse at ingest** — articles are stored as Markdown, surviving link rot. This is a real differentiator.
2. **URL deduplication** — canonical URL hashing prevents duplicates.
3. **Security-first ingestion** — SSRF protection, timeout/body caps, error message separation.
4. **Multi-platform save** — Chrome extension + iOS share sheet + web paste.
5. **Clean reading experience** — Readability extraction + sanitized Markdown rendering.
6. **Tags + filtering** — basic organization with tag cloud, source/status filters.

## What's already tracked in open issues

| Issue | Feature area |
|-------|-------------|
| #5 Rate limiting | Security (pre-production blocker) |
| #6 Store HTML instead of Markdown round-trip | Reading fidelity |
| #7 IDOR protection | Security |
| #8 DOMPurify config | Reading fidelity |
| #9 Paginate /library | Performance |
| #10 Pin marked version | Stability |
| #11 CSRF origin allowlist | Security |
| #12 CI pipeline | DevOps (shipped) |
| #13 Test coverage | Quality |
| #14 Async ingest (202 + queue) | Save reliability |
| #15 Sentry / structured logging | Observability |
| #16 GDPR user deletion webhook | Compliance |
| #17 Ingest edge cases | Robustness |
| #18 Shared Clerk auth | Platform |
| #22 Preserve HTML tables | Reading fidelity |

---

## Recommended feature priorities

Based on competitive research, user demand signals, and Broadsheet's architecture.

### Tier 1 — high impact, aligns with current architecture

These features would meaningfully improve the product and are feasible within the current stack.

1. **Dark mode + reader typography controls** — Table stakes UX. SCSS modules make theming straightforward. Font size, line height, content width, and a dark/light/sepia toggle. Low effort, high perceived quality.

2. **Full-text search** — One of the most-requested features across all read-it-later apps. Options given Folio's blob storage: (a) client-side search with FlexSearch/Lunr for smaller libraries, (b) build a search index blob that rebuilds on save, (c) add MeiliSearch/TypeSense for scale. Start with client-side for MVP.

3. **Data export** — Critical trust signal post-Pocket/Omnivore shutdowns. Export library as JSON (full metadata), Markdown files (already the storage format), or HTML. Low effort since articles are already stored as Markdown with frontmatter.

4. **Bulk import from Pocket/Instapaper/Omnivore** — Massive acquisition opportunity given displaced users. Pocket exported as HTML bookmarks; Instapaper as CSV; Omnivore as JSON. Parse each format and batch-save.

5. **Bulk actions in library** — Select multiple articles, then tag/archive/delete. Commonly missing in competitors, frequently complained about.

6. **Reading progress indicator** — Simple scroll-based progress bar on the reader page. Low effort, noticeable UX improvement.

### Tier 2 — significant value, moderate effort

7. **Text-to-speech** — Top differentiator. Web Speech API for MVP (free, no server cost, decent quality). Upgrade path: ElevenLabs or OpenAI TTS API for premium voices. Articles are already stored as clean Markdown — easy to extract plain text for TTS.

8. **Highlighting and annotations** — Select text in reader, save highlights with optional notes. Store as metadata alongside article. This is where willingness-to-pay lives (Readwise charges $13/mo largely for this).

9. **Highlight export to Obsidian/Notion** — Once highlighting exists, export as Markdown (Obsidian) or via API (Notion). The Readwise-to-Obsidian pipeline is the single most cited reason for paying for a read-it-later app.

10. **Newsletter ingestion** — Dedicated email address per user (e.g., `user123@save.broadsheet.dev`). Requires an email receiving service (Cloudflare Email Workers, Mailgun inbound, or similar). High value, moderate infrastructure cost.

11. **Offline reading (PWA)** — Service worker to cache the app shell + saved articles. Articles are already stored server-side as Markdown; cache them in IndexedDB on read. Add to home screen support. Broadsheet's web-first approach makes PWA a natural fit.

12. **Snooze / resurface articles** — "Remind me about this article in 3 days." Simple: store a `snoozeUntil` timestamp in article metadata, filter from default library view, show when date arrives.

### Tier 3 — differentiators, higher effort or dependency

13. **AI summarization** — Generate a 2-3 sentence summary at ingest time. Store alongside article. Show in library view to help users triage their queue. Use Claude API. Make it opt-in to respect users who don't want AI.

14. **AI auto-tagging** — Suggest tags based on article content at save time. Reduces manual tagging friction. Can run alongside summarization.

15. **RSS feed subscriptions** — Subscribe to feeds, auto-save new articles. OPML import for migrating from other readers. Requires a polling mechanism (cron job or Vercel cron).

16. **Send to Kindle** — Convert article to EPUB/MOBI, email to user's Kindle address. High demand from long-form readers. Moderate effort (EPUB generation + email sending).

17. **Reading statistics** — Articles read per week, total reading time, topics read. Simple analytics dashboard. Often requested but rarely well-implemented — opportunity to do it right.

18. **Smart filters / saved searches** — Save filter combinations as named views (e.g., "unread tech articles from this week"). Power-user feature that reduces friction for heavy users.

### Explicitly not recommended (for now)

- **Social features / public reading lists** — Matter tried and pulled back. Users want a quiet, personal reading space. Low demand, high complexity.
- **Collaborative annotations** — Niche academic use case. Not aligned with personal read-it-later.
- **Algorithmic recommendations** — Requires large user base for signal. Pocket had this but it was polarizing.
- **Podcast transcription** — Interesting but tangential to core reading use case.
- **Bionic reading / speed reading** — Niche novelty features with questionable utility.

---

## Architecture considerations for new features

**Full-text search without a database:** Broadsheet stores articles as Markdown blobs in Folio. Options: (a) build a lightweight search index as a separate blob per user, rebuilt on save/delete; (b) client-side search using FlexSearch with article metadata loaded in the browser; (c) add a search service. For MVP, option (b) is simplest — load titles + excerpts client-side, search there. Full content search needs (a) or (c).

**AI features without a separate backend:** The Claude API or OpenAI API can be called directly from Next.js route handlers. Summarization and auto-tagging at ingest time add ~2-5s to the save flow, which aligns well with the async ingest pipeline (#14). Store AI outputs in article frontmatter.

**Highlighting storage:** Highlights are metadata — store as a JSON array in article frontmatter or as a separate Folio document per article. Schema: `{ id, startOffset, endOffset, text, note?, color?, createdAt }`. Rendering: inject highlight spans into the sanitized HTML at read time.

**Newsletter ingestion:** Requires receiving inbound email. Cloudflare Email Workers (free tier available) or Mailgun inbound routing can forward to a webhook. The webhook parses the email, extracts the HTML body, runs it through the existing ingest pipeline (Readability + Turndown), and saves like any other article.

**TTS:** Web Speech API is free and works in all modern browsers. For better quality, call ElevenLabs or OpenAI TTS API server-side, return audio stream. Articles are clean Markdown — strip formatting, split into paragraphs, synthesize sequentially. Consider caching generated audio in blob storage.

---

## Summary

The read-it-later market is in flux. Pocket and Omnivore's shutdowns created a trust crisis and a user migration wave. The features that matter most right now are:

1. **Reliability and data portability** (export, backup, parse-at-save) — Broadsheet already does this well
2. **Reading quality of life** (dark mode, typography, TTS) — low-hanging fruit
3. **Organization at scale** (search, bulk actions, smart filters) — necessary as libraries grow
4. **Knowledge work pipeline** (highlights, notes, PKM export) — where willingness-to-pay lives
5. **AI as assistant, not gimmick** (summarize, auto-tag, surface what matters) — the 2025-2026 differentiator

Broadsheet's architecture (Markdown-at-ingest, blob storage, Next.js API routes) is well-suited for most of these. The main constraint is the lack of a relational database for efficient querying at scale — but the PRD explicitly defers that decision, and it's not a blocker for any tier 1-2 feature at current scale.
