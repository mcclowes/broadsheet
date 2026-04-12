# Code review: Broadsheet

**Reviewer:** (Principal engineer, fresh eyes on the codebase)
**Date:** 2026-04-12
**Scope:** Full codebase audit — security, correctness, performance, architecture, edge cases

---

## Executive summary

This is a well-documented pre-production codebase with thoughtful security hardening (SSRF, XSS, CSRF) and clear architectural boundaries. The problems below are the kind that bite you in production when real users do real things. Most are not obvious from reading any single file — they emerge from how the pieces interact.

---

## 1. Race conditions in article save (data loss risk)

**File:** `src/lib/articles.ts:110-138`

```typescript
const existing = await volume.get(id);
if (existing) {
  return { id, ...existing.frontmatter };
}
// ... build frontmatter ...
await volume.set(id, { frontmatter, body: parsed.markdown });
```

This is a classic check-then-act race. Two concurrent requests for the same URL (e.g. user clicks "Save" twice quickly, or the extension fires alongside a share-target save) both see `existing === null`, both proceed to `volume.set`, and the second write silently overwrites the first.

With Folio on Vercel Blob, this is last-write-wins with no conflict detection. The risk isn't just duplicate work — if the two requests parsed slightly different HTML (page changed between requests), you lose the first version with no record.

**Why this matters for junior engineers:** "Check if it exists, then create it" is only safe if the underlying store guarantees atomicity — a database row with a unique constraint, or a file created with `O_EXCL`. Folio's `set` is an unconditional upsert. The idempotent ID scheme gives the _illusion_ of safety but doesn't enforce it.

**Fix:** Either add a `setIfAbsent` / `putIfAbsent` primitive to Folio (log it in `FOLIO-TRACKER.md`), or accept the last-write-wins behaviour and document it. Don't pretend the check-then-act is atomic.

---

## 2. PATCH route applies partial updates non-atomically

**File:** `src/app/api/articles/[id]/route.ts:68-79`

```typescript
if (updates.read !== undefined) await markRead(userId, id, updates.read);
if (updates.archived !== undefined)
  await setArchived(userId, id, updates.archived);
if (updates.tags !== undefined) tags = await setTags(userId, id, updates.tags);
```

Three separate `volume.patch` calls for a single PATCH request. If the second call fails (Blob timeout, quota exceeded), you've applied `read` but not `archived` — the article is now in a state the client never requested. There's no rollback.

**Why this matters:** Partial application of a multi-field update violates the user's intent. If I send `{ read: true, archived: true }`, I expect either both or neither. This is the kind of bug that makes users distrust the UI — "I archived it but it still shows as unread."

**Fix:** Build a single merged frontmatter patch and call `volume.patch` once:

```typescript
const patch: Partial<ArticleFrontmatter> = {};
if (updates.read !== undefined)
  patch.readAt = updates.read ? new Date().toISOString() : null;
if (updates.archived !== undefined)
  patch.archivedAt = updates.archived ? new Date().toISOString() : null;
if (updates.tags !== undefined) patch.tags = cleanTags(updates.tags);
await userVolume(userId).patch(id, { frontmatter: patch });
```

---

## 3. `listArticles` loads the entire library into memory

**File:** `src/lib/articles.ts:168-177`

```typescript
export async function listArticles(userId, filters) {
  const pages = await userVolume(userId).list();
  const all = pages
    .map((p) => ({ id: p.slug, ...p.frontmatter }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return filterArticles(all, filters);
}
```

Every call to `listArticles` loads every article's frontmatter. The library page calls it _twice_ in parallel — once with filters and once with `{}` for tag counting:

**File:** `src/app/library/page.tsx:78-81`

```typescript
const [articles, allArticles] = await Promise.all([
  listArticles(userId, current),
  listArticles(userId, {}),
]);
```

That's two full Blob listing operations per page load. At 500 articles, you're pulling ~500 Blob metadata reads twice per navigation. At 2,000 articles, this becomes a meaningful latency and cost problem.

**Why this matters:** This is O(n) on the entire library for every page load. It works fine with 20 articles in development. It becomes noticeably slow around 200. The user who saves 5 articles/day hits 1,800 in a year. There's no pagination, no cursor, no limit.

**Fix (short-term):** Call `listArticles` once with no filters, then apply `filterArticles` in the page component. This halves the Blob reads. Add a `limit` parameter for the home page which only needs 17 articles.

**Fix (medium-term):** Add pagination support (cursor-based, keyed on `savedAt`). Log the need for filtered listing in `FOLIO-TRACKER.md` if Folio doesn't support it yet.

---

## 4. Digest cron sends emails sequentially with no concurrency control

**File:** `src/app/api/digest/send/route.ts:39-77`

```typescript
for (const sub of subscribers) {
  const articles = await listArticles(sub.userId, { view: "inbox", state: "unread" });
  // ...
  await resend.emails.send({ ... });
}
```

Each subscriber is processed sequentially: list articles (full Blob scan), build HTML, send email, wait for Resend response. With 50 subscribers, this is 50 sequential Blob scans + 50 sequential HTTP calls to Resend. On a Vercel Function with a 300s timeout, you'll hit the wall around 30-60 subscribers depending on library sizes.

There's also no deduplication — if the cron fires twice (Vercel cron is at-least-once), every subscriber gets two emails.

**Fix:** Process subscribers in batches of 5-10 with `Promise.all`. Add an idempotency key per subscriber per day (e.g. store `lastDigestSentAt` in the digest registry and skip if already sent today).

---

## 5. The Turndown instance is a shared mutable singleton

**File:** `src/lib/ingest.ts:19-70`

```typescript
const turndown = new TurndownService({ ... });
turndown.addRule("stripScripts", { ... });
turndown.addRule("preWithoutCode", { ... });
turndown.addRule("imgWithDataSrc", { ... });
turndown.use(tables);
```

This is a module-level singleton. In Vercel's Fluid Compute model, multiple concurrent requests share the same function instance and therefore the same `turndown` object. TurndownService is not documented as thread-safe — if `turndown.turndown()` mutates internal state during conversion (and it does — it walks and modifies a clone of the DOM), concurrent calls could produce corrupted output.

**Why this matters for junior engineers:** Module-level singletons are fine for _stateless_ configuration. They're dangerous for objects that maintain internal state during method calls. Even if it works today, you're relying on an implementation detail of a third-party library. The safe pattern is to create a fresh instance per call, or at least verify the library's concurrency guarantees.

**Fix:** Create the `TurndownService` inside `parseArticleFromHtml` rather than at module scope. The setup cost is trivial compared to the DOM parsing.

---

## 6. CSRF check allows _any_ Chrome extension origin

**File:** `src/lib/csrf.ts:43`

```typescript
if (origin.startsWith("chrome-extension://")) return null;
```

This allows any installed Chrome extension to make authenticated cross-origin requests to every mutating endpoint. A malicious or compromised extension can save arbitrary URLs, modify article metadata, toggle digest subscriptions, and delete sources — all authenticated as the user via their Clerk cookie.

The comment says "Chrome extensions get a unique origin per install" — true, but that's _per-extension_, not per-user. A malicious extension installed by the user has full API access.

**Why this matters:** The attack surface is: any Chrome extension with `host_permissions` for your domain (or `<all_urls>`) gets a free pass through CSRF protection. This is a real attack vector — see the various browser extension supply-chain attacks in the wild.

**Fix:** Pin the allowlist to your own extension's ID. In development, the ID is generated at install time, but for a published extension it's stable. At minimum, log the extension ID when you see a `chrome-extension://` origin so you can audit.

---

## 7. Article ID validation is inconsistent across routes

The `[id]` parameter is only validated in one place:

**File:** `src/app/api/sources/[id]/route.ts:16`

```typescript
if (!/^[a-f0-9]{32}$/.test(id)) {
  return Response.json({ error: "Invalid source id" }, { status: 400 });
}
```

But `src/app/api/articles/[id]/route.ts` does _no_ validation of the `id` parameter. Whatever the user sends as `id` is passed directly to `volume.get(id)`. With Folio, this means the slug is used to construct a file path or Blob key. If Folio doesn't sanitise slugs internally, path traversal payloads like `../other-volume/secret` could read across volume boundaries.

Even if Folio does sanitise, the inconsistency is a code smell — one route validates, the other doesn't. Either all routes validate, or you push validation into the data layer and none of them need to.

**Fix:** Validate article IDs at the route level with the same `^[a-f0-9]{32}$` check, or add slug validation in the Folio volume methods (and log it in `FOLIO-TRACKER.md`).

---

## 8. No pagination or limits on the GET /api/articles response

**File:** `src/app/api/articles/route.ts:18-23`

```typescript
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const articles = await listArticles(userId);
  return Response.json({ articles });
}
```

This returns every article the user has ever saved, in a single JSON response. At 1,000 articles with excerpts, that's easily 2-5 MB of JSON. The client (extension, mobile app, PWA) has to parse all of it.

The `GET /api/articles` endpoint accepts no query parameters for filtering, pagination, or limiting — even though the library page _does_ filter via `listArticles(userId, current)`. The API just ignores the query string.

**Fix:** Pass `req.nextUrl.searchParams` through to `listArticles` as filters, and add a `limit` / `offset` or cursor parameter.

---

## 9. Feed discovery makes up to 10 outbound HTTP requests in a single API call

**File:** `src/lib/feeds.ts:265-319`

```typescript
export async function discoverFeed(inputUrl: string): Promise<DiscoveredFeed> {
  // Attempt 1: try as feed directly (1 fetch)
  // Attempt 2: fetch as HTML, then try each <link> candidate (1 + N fetches)
  // Attempt 3: try 7 well-known paths (up to 7 fetches)
```

In the worst case, `addSource` triggers: 1 feed fetch (fails) + 1 HTML fetch + N candidate fetches (all fail) + 7 well-known path fetches = potentially 10+ outbound HTTP requests, each with a 15-second timeout. That's a maximum wall-clock time of 150+ seconds for a single `POST /api/sources` request.

There's no rate limiting on source addition (unlike article ingestion), so a user can trigger unlimited concurrent discovery cascades.

**Fix:** Add rate limiting to `POST /api/sources`. Consider running discovery with a shorter per-request timeout (e.g. 5s for discovery probes vs. 15s for the final fetch). Cap the number of candidate URLs tried.

---

## 10. Sanitisation config drift between server and client

**File:** `src/lib/markdown.ts` vs `src/lib/markdown-client.ts`

The server-side config includes:

```typescript
ALLOWED_ATTR: ["href", "title", "src", "alt", "srcset", "sizes", "loading",
  "align", "colspan", "rowspan", "scope"],
ADD_URI_SAFE_ATTR: ["align", "colspan", "rowspan", "scope"],
```

The client-side config is missing `align`, `colspan`, `rowspan`, `scope`, and `ADD_URI_SAFE_ATTR` entirely.

This means articles rendered offline (via `renderMarkdownClient`) will have their table attributes stripped, silently breaking table layout. More importantly, if these configs ever diverge in the _other_ direction (client allows something the server doesn't), you have an XSS vector in offline mode.

**Why this matters for junior engineers:** When you have two copies of a security-critical configuration, they _will_ drift. This is why you extract shared config into a module — not for DRY aesthetics, but because the cost of divergence is a security vulnerability.

**Fix:** Extract `SANITIZE_CONFIG` into a shared module (e.g. `src/lib/sanitize-config.ts`) imported by both `markdown.ts` and `markdown-client.ts`.

---

## 11. `marked.setOptions` is a global mutation called at import time

**Files:** `src/lib/markdown.ts:7-9`, `src/lib/markdown-client.ts:11-13`

```typescript
marked.setOptions({ gfm: true, breaks: false });
```

`marked.setOptions` mutates the global `marked` singleton. If any other code in the bundle (a dependency, a test helper) also calls `marked.setOptions` with different values, the last import wins. In a Fluid Compute environment where multiple requests share the module cache, this is a silent configuration race.

**Fix:** Pass options to `marked.parse()` directly:

```typescript
marked.parse(md, { gfm: true, breaks: false, async: false });
```

---

## 12. The home page is `force-dynamic` but doesn't need to be for unauthenticated users

**File:** `src/app/page.tsx:7`

```typescript
export const dynamic = "force-dynamic";
```

The landing page for unauthenticated users is fully static — just a title and a sign-in button. But `force-dynamic` means Vercel generates it on every request, never caching it at the edge. Every bot, crawler, and first-time visitor hits your function.

**Why this matters:** This is wasted compute and increased TTFB for the most important page — the one new users see first. The authenticated version genuinely needs dynamic rendering, but the unauthenticated shell doesn't.

**Fix:** Remove `force-dynamic` from the home page. Use `auth()` in a way that allows the static shell to be cached, or split into a static landing page and a dynamic dashboard route.

---

## 13. `ReadTracker` fires on every scroll event without debouncing

**File:** `src/app/read/[id]/read-tracker.tsx:38-42`

```typescript
function handleScroll() {
  if (window.scrollY > SCROLL_THRESHOLD) {
    markRead();
  }
}
window.addEventListener("scroll", handleScroll, { passive: true });
```

After the user scrolls past 150px, every subsequent scroll event calls `markRead()`. The `fired` ref prevents duplicate API calls, but only after the first call resolves. During the network round-trip, rapid scrolling can queue multiple concurrent PATCH requests.

Additionally, the scroll listener is never removed after the article is marked as read — it continues firing (and checking `fired.current`) for the entire session.

**Fix:** Remove the scroll listener after `markRead` succeeds. Add a simple early return at the top of `handleScroll`:

```typescript
function handleScroll() {
  if (fired.current) return;
  if (window.scrollY > SCROLL_THRESHOLD) markRead();
}
```

---

## 14. `OfflineSync` replay has no conflict resolution

**File:** `src/app/components/offline-sync.tsx:15-32`

```typescript
const entries = await getAllSyncEntries();
for (const entry of entries) {
  const res = await fetch(`/api/articles/${entry.articleId}`, {
    method: "PATCH",
    body: JSON.stringify(entry.payload),
  });
}
```

If the user goes offline, marks an article as read, then goes back online and the article has been deleted server-side, the sync entry just gets a 404 and is discarded. Fine.

But if the user was offline and toggled read/unread multiple times, every toggle is queued as a separate sync entry. They replay in order, but the final state might not match what the user last saw — especially if they also made changes on another device while online.

There's also no coalescing: 10 rapid toggles of "read" produce 10 sync entries, all of which replay sequentially.

**Fix:** Coalesce sync entries by `articleId` before replaying — only the latest entry per article per action matters. This also reduces the number of API calls on reconnection.

---

## 15. `digest-email.ts` has no unsubscribe mechanism that works

**File:** `src/lib/digest-email.ts:153`

```html
<a href="${esc(baseUrl)}/library" style="...">Unsubscribe</a>
```

The "Unsubscribe" link just goes to `/library`. There is no one-click unsubscribe, no `List-Unsubscribe` header, and no token-based unsubscribe endpoint. Under CAN-SPAM and GDPR, marketing emails must have a working unsubscribe mechanism. Major email providers (Gmail, Outlook) will increasingly route emails without `List-Unsubscribe` to spam.

**Fix:** Add a `List-Unsubscribe` header to the email with a one-click unsubscribe URL. Create a `/api/digest/unsubscribe?token=...` endpoint that accepts a signed, user-specific token.

---

## 16. `buildAllowlist()` in `csrf.ts` runs once at module load time

**File:** `src/lib/csrf.ts:4-20`

```typescript
function buildAllowlist(): Set<string> { ... }
const allowedOrigins = buildAllowlist();
```

`VERCEL_URL` and `VERCEL_BRANCH_URL` are read once when the module is first imported. In Fluid Compute, the same function instance handles many requests across potentially different preview deployments if Vercel reuses the instance. In practice this is fine today, but the pattern is fragile — any env var that changes between deploys won't be picked up.

More critically, if `VERCEL_URL` isn't set at cold-start time (e.g. the env var is added after deployment), the allowlist won't include it until the next cold start.

**Why this matters for junior engineers:** Reading environment variables at module load time is a common pattern, but it creates invisible coupling to the deployment lifecycle. Prefer reading env vars at request time for values that could change, or document why cold-start-only is acceptable.

---

## 17. No input length limit on tag values

**File:** `src/lib/articles.ts:217-224`

```typescript
const clean = Array.from(
  new Set(tags.map(normalizeTag).filter((t) => t.length > 0 && t.length <= 32)),
).sort();
```

Individual tags are capped at 32 characters, but the _number_ of tags is unlimited. A client can send an array of 10,000 unique 32-character tags. They'll all be stored. This bloats the frontmatter, slows down listing (every article's tags are loaded into memory), and could exceed Folio's per-document size limit.

**Fix:** Cap the array length (e.g. `tags.slice(0, 20)` after deduplication).

---

## 18. `estimateReadMinutes` doesn't account for markdown syntax

**File:** `src/lib/ingest.ts:410-416`

```typescript
function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter(Boolean).length;
}
```

This counts markdown syntax tokens as words. A link like `[click here](https://example.com/very/long/path)` counts as 2+ words. A table with pipe separators inflates the count. Code blocks with variable names add to the count. The result: read-time estimates for code-heavy articles are inflated by 30-50%.

**Fix:** Strip markdown syntax before counting, or count words from the rendered text (after DOMPurify, extract `textContent`).

---

## 19. The diff endpoint re-fetches the original URL with no caching or rate limiting

**File:** `src/app/api/articles/[id]/diff/route.ts:24-28`

```typescript
const parsed = await fetchAndParse(article.url);
currentMarkdown = parsed.markdown;
```

Every time a user clicks "Check for changes", the server makes a full HTTP request to the original article URL, parses the HTML, converts to markdown, and diffs it. There's no caching of the fetched result, no rate limiting, and no indication to the user that this is an expensive operation.

A user refreshing the diff page repeatedly, or a script hitting this endpoint, generates unbounded outbound HTTP traffic from your servers — effectively turning your app into an HTTP proxy.

**Fix:** Rate-limit this endpoint per user. Cache the fetched result for a few minutes. Consider making this an async operation that the user polls for, rather than a synchronous GET.

---

## 20. The Chrome extension stores and sends full page HTML

**File:** `apps/extension/background.js:14-28`

```javascript
async function extractPageHtml(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement?.outerHTML ?? null,
  });
  const html = result?.result;
  if (typeof html !== "string" || !html) return null;
  if (html.length > MAX_HTML_LENGTH) return null;
  return html;
}
```

The extension captures the full DOM (up to 4MB) and sends it in the POST body. This HTML includes:

- Inline scripts and event handlers (stripped server-side, but transmitted over the network)
- Any sensitive content visible on the page (e.g. if the user is saving from an authenticated page)
- Ads, tracking pixels, and third-party content embedded in the page

The 4MB cap is higher than the server's 5MB `MAX_BODY_BYTES`, so the server will accept it, but the mismatch is confusing. The server-side `saveSchema` also has `z.string().max(MAX_BODY_BYTES)` which is 5MB — matching the server, not the extension.

**Why this matters:** You're transmitting potentially sensitive page content (could include PII, auth tokens in the DOM, etc.) to your server. The server strips it during parsing, but it's in your access logs and error reports (`console.error` in the catch block logs the full request context).

---

## 21. `new Date().toISOString()` used inconsistently for timestamps

Throughout the codebase, timestamps are generated at the moment of execution:

- `savedAt` is set when the article is written to Folio
- `readAt` is set when the PATCH handler processes the request
- Offline sync entries have `createdAt` set on the client

When a user marks an article as read while offline, `readAt` will be set to the replay time (when they come back online), not the actual time they read it. The offline sync payload contains `{ read: true }`, not `{ readAt: "2026-04-12T..." }` — the timestamp is always generated server-side.

**Fix:** For offline operations, include the client-side timestamp in the sync entry payload and respect it server-side (with a sanity check that it's not in the future).

---

## 22. `volumeNameForUser` uses a 24-character hex prefix — collision risk

**File:** `src/lib/folio.ts:46`

```typescript
const hex = createHash("sha256").update(userId).digest("hex").slice(0, 24);
```

A 24-character hex string is 96 bits of entropy. By the birthday paradox, you'd need ~2^48 users (~280 trillion) before a 50% collision probability. This is fine for a consumer app.

However, `articleIdForUrl` uses 32 hex characters (128 bits), while `volumeNameForUser` uses 24 (96 bits). The inconsistency suggests these were chosen independently rather than from a shared policy. Document the collision budget or unify the truncation length.

---

## 23. No `Cache-Control` headers on API responses

None of the API route handlers set `Cache-Control` headers. The GET endpoints (`/api/articles`, `/api/articles/[id]`, `/api/sources`, `/api/digest/preferences`) return user-specific data that should never be cached by CDNs or shared caches.

Next.js sets `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` on dynamic routes by default, but this isn't guaranteed for API routes, and it's worth being explicit when the data is user-specific and auth-gated.

**Fix:** Add `Cache-Control: private, no-store` to GET responses, or verify that Next.js's default behaviour covers API routes in your deployment configuration.

---

## 24. The service worker caches authenticated page responses

**File:** `public/sw.js:98-116`

```javascript
async function navigationFetch(request) {
  const response = await fetch(request);
  if (response.ok && !response.redirected) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
```

When an authenticated user visits `/library`, the service worker caches the full HTML response (including the user's article list). If the user signs out and a different user signs in on the same browser, the second user could see the first user's cached library page until the cache expires or the service worker updates.

The `!response.redirected` check prevents caching auth redirects, but doesn't prevent caching auth-gated content that was successfully rendered.

**Fix:** Don't cache navigation responses for auth-gated routes (`/library`, `/read/*`). Only cache truly public pages.

---

## Summary table

| #   | Severity | Category    | Summary                                                        |
| --- | -------- | ----------- | -------------------------------------------------------------- |
| 1   | High     | Correctness | Race condition in article save (check-then-act)                |
| 2   | Medium   | Correctness | Non-atomic multi-field PATCH updates                           |
| 3   | High     | Performance | Full library loaded into memory on every page load, twice      |
| 4   | Medium   | Scalability | Sequential digest sending, no idempotency                      |
| 5   | Low      | Correctness | Shared mutable Turndown singleton                              |
| 6   | High     | Security    | CSRF allows any Chrome extension origin                        |
| 7   | Medium   | Security    | Missing article ID validation (potential path traversal)       |
| 8   | Medium   | Performance | No pagination on GET /api/articles                             |
| 9   | Medium   | Performance | Feed discovery cascade (10+ outbound fetches)                  |
| 10  | High     | Security    | Sanitisation config drift between server and client            |
| 11  | Low      | Correctness | Global `marked.setOptions` mutation                            |
| 12  | Low      | Performance | Home page force-dynamic for static content                     |
| 13  | Low      | Correctness | ReadTracker scroll listener never cleaned up                   |
| 14  | Low      | Correctness | Offline sync has no entry coalescing                           |
| 15  | Medium   | Compliance  | No working email unsubscribe mechanism                         |
| 16  | Low      | Correctness | CSRF allowlist built once at module load                       |
| 17  | Low      | Security    | No limit on tag array length                                   |
| 18  | Low      | UX          | Read-time estimate inflated by markdown syntax                 |
| 19  | Medium   | Security    | Diff endpoint is an unbounded HTTP proxy                       |
| 20  | Low      | Privacy     | Extension transmits full page HTML including sensitive content |
| 21  | Low      | Correctness | Offline timestamps set at replay time, not action time         |
| 22  | Info     | Design      | Inconsistent hash truncation lengths                           |
| 23  | Low      | Security    | No explicit Cache-Control on API responses                     |
| 24  | Medium   | Security    | Service worker caches authenticated content                    |

---

## What's done well

Credit where it's due — these are patterns worth keeping:

- **Auth boundary discipline.** `auth()` only at route boundaries, `userId` threaded as a parameter. This makes the lib layer testable and prevents accidental auth-context leaks.
- **SSRF hardening.** DNS resolution with private-IP blocking, redirect re-checking, body caps, timeout. This is better than most production apps.
- **DOMPurify with strict allowlist.** The default-deny approach to HTML sanitisation is correct. The URI regexp is tight.
- **IngestError with separate public/private messages.** This prevents internal hostname leakage without sacrificing debuggability.
- **Idempotent article IDs from URL hashing.** Dedup without a database unique constraint is clever and works well for this use case.
- **Co-located tests.** Every lib file has a test file next to it. The test infrastructure is simple and fast.
- **Honest documentation.** `CODE_REVIEW.md` and `CLAUDE.md` don't hide problems — they track them. This is rarer than it should be.
