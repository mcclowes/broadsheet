# Broadsheet — holistic code review

> Reviewer persona: principal engineer onboarding to the codebase, with a bias against cleverness and a low tolerance for silent failure. Written to give junior engineers concrete patterns to repeat and to avoid.

## TL;DR — the top things to fix first

| #   | Finding                                                                                                                                                      | Severity     | Where                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------- |
| 1   | `deleteAllUserData` never deletes the `annotations` volume — highlights survive account deletion (GDPR leak)                                                 | **Critical** | `src/lib/user-deletion.ts:10`                                                                 |
| 2   | Cron idempotency is broken on failure: `markDigestSent` runs _after_ `resend.emails.send`, so a crash between the two re-sends the email on retry            | **High**     | `src/app/api/digest/send/route.ts:78–97`                                                      |
| 3   | `/api/digest/unsubscribe` mutates state on `GET`, which Gmail's "link safety" prefetcher and user-side AV proxies will follow, silently unsubscribing people | **High**     | `src/app/api/digest/unsubscribe/route.ts:12–39`                                               |
| 4   | `/library` loads every article for every request and filters in memory (no `force-dynamic` cap, no server-side pagination)                                   | **High**     | `src/app/library/page.tsx:111`                                                                |
| 5   | `auth()` is called per route — there is no `middleware.ts` at all. A new route that forgets it silently exposes data                                         | **High**     | Absent: `src/middleware.ts`                                                                   |
| 6   | `patchArticle` does a full `get` before the patch on every progress tick (every ~3s while scrolling), which means N× the blob reads                          | **Medium**   | `src/lib/articles.ts:473` + `read-tracker.tsx:104`                                            |
| 7   | SSRF check is TOCTOU: we resolve DNS to a public address, then `fetch()` resolves it _again_. DNS rebinding can flip the second resolution                   | **Medium**   | `src/lib/ingest.ts:347`                                                                       |
| 8   | Rate limit buckets are in-process — on Vercel each serverless instance has its own bucket, so the advertised "60/min" is actually "60/min per instance"      | **Medium**   | `src/lib/rate-limit.ts:31`                                                                    |
| 9   | Dozens of `as unknown as z.ZodType<X>` casts because hand-written types don't match zod's inferred ones. Pick one source of truth                            | **Medium**   | `articles.ts:104`, `digest.ts:30`, `sources.ts:32`, `annotations.ts:65`, `auto-archive.ts:64` |
| 10  | Reader page runs ingest synchronously inside the SSR render for `pendingIngest` articles — user waits 15 s for a slow upstream before the page appears       | **Medium**   | `src/app/read/[id]/page.tsx:45`                                                               |

Everything below expands these, adds more, and calls out anti-patterns worth _not_ repeating.

---

## 1. Architecture and invariants

### 1.1 The auth boundary is load-bearing but unenforced

The codebase has a very deliberate pattern: `auth()` is only called at request-entry boundaries, and `src/lib/**` functions take a branded `AuthedUserId`. This is well-designed — `auth-types.ts` even has a great comment explaining it. I like it.

What's missing is the _enforcement_ side. Because there is **no `src/middleware.ts`**, every new route handler must remember to:

1. Call `auth()`
2. Branch on `!rawUserId → 401`
3. Brand the id with `authedUserId(...)`
4. On mutating verbs: call `checkOrigin(req)` first
5. On mutating verbs that are expensive: call `<someLimiter>.consume(userId)`

That's a five-step ritual. Clerk ships `clerkMiddleware()` for exactly this reason — put the session check once, centrally, and let route handlers focus on business logic. If somebody adds `src/app/api/admin/export/route.ts` tomorrow and forgets step 1 or 4, nothing fails loudly. Lint doesn't catch it. Types don't catch it. Tests don't catch it unless they're explicitly written for the new route.

**For juniors:** when a security check depends on developer discipline at N call sites, assume it will be forgotten at call site N+1. Push it up the stack until there's exactly one place to forget.

### 1.2 "Folio is our storage layer" is doing a lot of work

`folio-db-next` is first-party code, but from a broadsheet-codebase perspective it's a third-party dep whose behaviour the rest of the code trusts implicitly. That trust shows up in load-bearing places:

- `setIfAbsent` is the whole story for deduplication (`articles.ts:167`). If it ever has a bug where two concurrent calls both succeed, we get duplicate articles.
- The list cache invalidation ("invalidated by Folio on writes via tag expiry" — `folio.ts:19`) is not tested here; we just trust it.
- `volume.patch` is advertised as doing "3 retries with jittered backoff" — but we wrap it in `retryOnConflict` for another 6 attempts. If Folio's contract ever changes, our retry budget silently doubles or doesn't.

None of this is wrong. But there's no integration test that stresses Folio's concurrency guarantees from broadsheet's side — the closest thing is `articles-crud.test.ts` running sequential operations. If the whole app's correctness rests on one dependency's contract, I'd want an "angry concurrent writers" test pinned to that contract.

### 1.3 Per-user volume suffix registry is implicit and unenforced

`folio.ts` has `volumeNameForUser(userId, suffix)` where `suffix` is an arbitrary ad-hoc string (`"sources"`, `"annotations"`, …). There is no central list of suffixes. The result is exactly the GDPR bug in §2.1 — `user-deletion.ts` had to hardcode the suffixes it knows about, and no-one updated it when `annotations` got added.

**Fix shape:** export a `PER_USER_VOLUME_SUFFIXES` tuple from `folio.ts`, pass it through `volumeNameForUser`, and have `deleteAllUserData` iterate that list. Then adding a new per-user volume is a single-file change, impossible to forget.

### 1.4 Next.js App Router defaults — mostly good, a couple of smells

Good: Server components by default, Clerk via `auth()` at request boundaries, parallelised `Promise.all` in `read/[id]/page.tsx:36`, `revalidatePath` after mutating routes. No `getServerSideProps` ghosts. Minimal `"use client"` surface.

Smells:

- `ClerkProvider` wraps the entire tree in `layout.tsx`, including `/privacy` and other public pages. That's fine for Clerk — it's a thin provider — but the pattern where you can't lint "which pages are public?" means you can't cheaply audit the auth surface.
- `force-dynamic` is set on `/library` and `/read/[id]`. That's correct given per-user content, but the two places are not the only auth-gated pages. `/settings`, `/sources`, `/import/pocket` all read per-user data too — do they have the same caching properties? (They don't have `force-dynamic`, which in Next 16 should still be fine for auth-gated pages, but it's worth a read-through to confirm none of them are caching personal data.)

---

## 2. Correctness bugs — ordered by how angry a user would be

### 2.1 **[Critical]** GDPR: highlights are not deleted on account deletion

```ts
// src/lib/user-deletion.ts
const PER_USER_VOLUME_SUFFIXES = [undefined, "sources"] as const;
```

`annotations` is conspicuously missing. `src/lib/annotations.ts:62` writes to `volumeNameForUser(userId, "annotations")`. A deleted user's highlights — text they quoted from articles, with their notes — live on forever in blob storage.

The test (`user-deletion.test.ts`) never seeds an annotation, so it's invisible.

**Fix:** add `"annotations"` to the tuple. **Better fix:** restructure so suffix registry is the single source of truth (§1.3).

**For juniors:** whenever you have a delete-all-of-X operation, write a test that creates one of _every type of thing X owns_ and asserts none survive. "Delete" tests are defensive — they catch exactly this class of "I forgot to update the list" bug. The diff to add the suffix is five keystrokes; the diff to add the test that would have caught it is the point of the exercise.

### 2.2 **[High]** Digest cron: duplicate sends on mid-batch failure

```ts
// src/app/api/digest/send/route.ts
const result = await resend.emails.send({ ... });       // ← (A) email sent
if (result.error) { throw new Error("Resend error"); }
await markDigestSent(sub.userId);                        // ← (B)
```

Vercel Cron retries on non-2xx. If the function crashes, times out, or the instance is killed between (A) and (B), user got the email but `lastDigestSentAt` isn't set. Next cron invocation (today — the filter uses `todayStr`) re-sends the digest because the filter at line 47 still thinks they haven't been sent today.

**Two fixes, pick one:**

- **Fix the order:** mark `lastDigestSentAt` _before_ `resend.emails.send`. Accept the opposite failure mode (email not sent but marked sent) — users can request a re-send if it really matters. Simpler, and the failure mode is less embarrassing.
- **Make it truly idempotent:** use a deterministic message-id (e.g. `sha256(userId + todayStr)`) as Resend's `idempotency_key` or custom header. Resend will drop the dupe.

The "mark before send" order is what most daily-digest products do in practice.

### 2.3 **[High]** Unsubscribe on GET is a classic email footgun

```ts
// src/app/api/digest/unsubscribe/route.ts
export async function GET(req: Request) {
  return handleUnsubscribe(req);
}
export async function POST(req: Request) {
  return handleUnsubscribe(req);
}
```

Mutating state on `GET` via a link in an email is a known-bad pattern. Google Mail's link-safety scanner, some corporate proxies, several password managers, and iOS Messages' link-preview fetcher will pre-fetch the URL. Each of those counts as "click". Users will be silently unsubscribed they didn't ask to be.

Worth knowing: `List-Unsubscribe-Post` headers (which this code does set — good) tell Gmail/Yahoo to use `POST`. But you're still offering the `GET` path and including the raw URL in the footer as a user-facing "Unsubscribe" link. That footer link is what the link-fetcher will follow.

**Fix:** GET returns a confirmation page with a single form that `POST`s back. The current behaviour of doing the mutation inline on GET does not meet RFC 8058.

**For juniors:** idempotent ≠ safe. `GET` should have no side effect beyond logging. Something that flips a user's `digest.enabled` is a side effect. The first rule of HTTP semantics is the one most often broken.

### 2.4 **[High]** The library loads everything every time

```ts
// src/app/library/page.tsx:111
const allArticles = await listArticles(userId, {});
const filteredArticles = filterArticles(allArticles, current);
```

Every render of `/library` pulls _every_ article's frontmatter (no filter pushed down, no limit), then filters and paginates in memory. Pocket CSV imports cap at 5,000 items (`pocket-import-service.ts:69`). A user with a full import hits 5,000 frontmatter reads per page view.

The cached comment on line 110 ("Single fetch — filter in-memory to avoid duplicate Blob scans") acknowledges this is intentional, but it's the wrong tradeoff. Reasons:

- The list cache in Folio caches the whole list; that's a single key per user. On invalidation (every save, read, archive, tag change), the cache is blown and the next visitor pays for the full rebuild.
- The summary object (`summariesForCache`) is serialised into the client bundle via `<CacheLibrary articles={summariesForCache} />`. For 5,000 articles × ~400 bytes each = ~2 MB of JSON shipped to the client on every library view, parsed, stored in IndexedDB. Not every visit needs that.
- `popularTags` is computed from the full list on every render. 5,000-article `for` loop runs on every GET.

**Fix shape:** push `view` and `state` into the volume-list call (Folio supports filtered listing); keep a separate small call for the "cache everything for offline" path and wire it to happen on service-worker activation, not on every page render. Or: gate `CacheLibrary` behind an explicit "sync to device" action.

### 2.5 **[Medium]** `patchArticle` does a full page read on every progress tick

```ts
// src/lib/articles.ts:473 — inside patchArticle
if (clamped >= READ_COMPLETE_THRESHOLD && frontmatter.readAt === undefined) {
  const existing = await userVolume(userId).get(id);  // ← extra read
  if (existing && !existing.frontmatter.readAt) { ... }
}
```

and the client throttles to one patch per 3 s (`read-tracker.tsx:PROGRESS_PATCH_INTERVAL_MS`). For a 20-minute read-through that's ~400 progress patches. Each one that crosses 90% does a `get(id)` + `patch(id)`.

Even below threshold it's not free: the patch goes through Folio's read-modify-write loop. Blob reads cost real money at Vercel's rates, and serverless cold starts on patches add latency.

**Better:** accept that `readAt` may be set slightly late. Set it only when progress _transitions_ from <0.9 to ≥0.9 on the client, and send a one-off explicit "mark read" PATCH then. The server `patchArticle` doesn't need the `get` at all.

### 2.6 **[Medium]** SSRF check is TOCTOU — DNS rebinding

`assertPublicHost` resolves the hostname via `dns.lookup`, checks all addresses, then `fetch(current)` resolves the hostname again. An attacker controlling their authoritative DNS server can return `8.8.8.8` (public, passes the check) and then `127.0.0.1` 10 ms later (for the actual fetch).

The standard mitigations in Node are:

- Use a custom `Agent` with a `lookup` callback that returns a pre-resolved public IP, and set `Host` header manually so TLS SNI / virtual-hosting still works.
- Or use a well-hardened library (`node-fetch-safe`, `ssrf-req-filter`).

Given the rest of the SSRF work is careful (v6 coverage, redirect re-check, content-type allowlist), this is the obvious remaining hole.

### 2.7 **[Medium]** Rate limiter is per-instance, not per-user

The comment "Per-instance leaky bucket — moving to Upstash Redis for a true multi-instance limit is a scale-up item" (in CLAUDE.md) is correctly scoped as a known limitation, so I'll only mention the _practical_ implications:

- A single user sending 10 saves in the same TCP-connection-reuse window will likely all hit one instance and get throttled. Good.
- A single user sending 10 saves with some delay or parallel fetches will fan out across instances. Each instance has capacity 10. Effective limit: 10 × (number of warm instances).
- Attack impact: an attacker with authenticated accounts (which is the bar for POST) gets effectively unbounded ingest by pushing concurrency up. This matters for `articleIngestLimiter` (each save runs `fetchAndParse` → outbound HTTP, JSDOM parse, blob write).

**Fix:** if you don't want Redis right now, at minimum move to a shared store like `@vercel/kv` (one more dep, no config needed on Vercel). Or set `maxDuration: 1` on `/api/articles` POST to keep individual save cost bounded.

### 2.8 **[Medium]** The read/[id] page can stall on a slow upstream

```ts
// src/app/read/[id]/page.tsx:45
if (article.pendingIngest) {
  try {
    const { parsed } = await fetchAndParse(article.url);
    await rehydrateArticle(userId, article.id, parsed);
    ...
```

Opening a pending-ingest article (from Pocket import, for instance) blocks the page render on `fetchAndParse`. Timeout is 15 s. That means a user clicking on an old import can wait up to 15 s for the reader to appear. On Vercel, if `maxDuration` expires, they see a 504. The catch block handles `IngestError` and shows a soft error — good — but they still paid the latency.

**Better:** render the page immediately with a placeholder and a client component that `useEffect`s a refresh call. Or trigger rehydration on save (in the background after `saveArticleStub`) and treat `pendingIngest` as always non-blocking.

### 2.9 **[Medium]** Highlight anchoring is character-offset into rendered plaintext

The comment at `annotations.ts:7` acknowledges this. In practice:

- If the article is re-ingested (diff-replace, future content-update), offsets desync. The code doesn't detect this — highlights silently anchor to wrong text.
- Even with stable content, `nodeOffsetToPlain` counts `textContent` of nodes in tree order. If the rendered HTML changes structurally (e.g. we add a figure caption), offsets shift.
- `wrapCrossNode` silently skips ranges it can't surround. Users won't know why their highlight "disappeared".

**Fix shape:** store a text snippet + N-context-chars as the primary anchor, with offset as a hint. CFI (EPUB Canonical Fragment Identifier)-style is the robust choice but overkill here — "find substring within a 200-char window around the hint offset" is 20 lines of code and handles 95% of drift.

### 2.10 **[Medium]** `canonicalizeUrl` dedup is fragile

The canonicalisation strips `www.`, a hardcoded list of tracking params, and port-80/443. What it misses:

- `m.example.com` (mobile subdomain) vs `example.com` — different canonical, but often the same article.
- `amp.example.com` / `example.com/amp/foo` vs `example.com/foo` — same article from user's POV.
- `http` vs `https` (if port is absent) — preserved separately.
- Trailing slash: `/foo` and `/foo/` are canonicalised to `/foo` (good), but `/foo?a=1` and `/foo/?a=1` behave differently because the slash-strip path looks only at `pathname`.
- Fragments: stripped (good).
- Percent-case: `%2F` vs `%2f` — both are the same URL but the hash differs.

Whether any of these matter depends on product intent. If "save the same article twice" is acceptable, fine. If not, the canonicaliser needs to lowercase `http→https` for known-HTTPS domains, drop `m.`/`amp.`, and normalise percent-encoding.

This one is a product decision masquerading as a library function — flag it explicitly.

---

## 3. Concurrency and data-race subtleties

### 3.1 Two retry loops doing almost the same thing, with different budgets

```ts
// articles.ts — 6 attempts, 50ms→1.6s backoff
const CONFLICT_RETRY_ATTEMPTS = 6;
const CONFLICT_RETRY_BASE_MS = 50;

// annotations.ts — 3 attempts, 10ms backoff
const CONFLICT_RETRY_ATTEMPTS = 3;
```

And both wrap `volume.patch` which Folio says already retries 3 times internally (per `articles.ts:375` comment).

So a worst-case patch conflict on articles retries 6 × 3 = 18 times over ~3 s. For annotations, 3 × 3 = 9 times. Different budgets, same primitive. Pick one policy and put it in a shared helper — `retryOnConflict` has two implementations in two files right now, drifting slowly.

### 3.2 `articleStateMatches` is almost-but-not-quite correct for tags

```ts
// articles.ts:422
} else if (Array.isArray(v)) {
  const sortedV = [...v].sort();
  const sortedC = [...currentArr].sort();
  if (sortedV.some((x, i) => x !== sortedC[i])) return false;
}
```

Consider: user A sets tags = `["foo"]`, user B (same user in another tab) sets tags = `["bar"]`. Both land together. A's patch conflicts, `articleStateMatches` sees `["bar"]` ≠ `["foo"]`, returns false, throws the conflict back. Fine.

Now: user A sets tags = `["foo", "bar"]`, user B sets tags = `["bar", "foo"]` (same intent, different order — e.g. because clients normalise at different times). A's patch conflicts but intent _is_ the same. `articleStateMatches` sorts both sides and compares — returns true, no conflict. Good.

The edge case: `cleanTags` already sorts and dedupes in `articles.ts:532`. So the frontmatter always holds a sorted unique list. The "array of tags" case is the only mutation that sets an array, and both writer and reader go through `cleanTags`. So the manual sort in `articleStateMatches` is belt-and-braces but not incorrect.

**What _is_ a bug:** `articleStateMatches` treats any timestamped field as "set-to-now" with `wantSet !== haveSet` logic. But `patch.archived === true` sets `archivedAt = now`; if a concurrent user cleared the archive (`archived = false` → `archivedAt = null`), our retry sees `haveSet === false`, mismatches intent, throws. That's correct — we _should_ retry or fail. No bug. Just fragile code that would benefit from enumerating the intent types explicitly (a state machine, not generic field comparison).

### 3.3 `annotations.mutate` uses `volume.set` not `volume.patch`

```ts
// annotations.ts:124
await volume.set(articleId, { frontmatter, body: "" });
```

`set` is a full overwrite. It's wrapped in read-then-write with retry, which is correct in principle, but it's less robust than Folio's optimistic patch (which uses `setIfAbsent`-style conditional writes, per the folio-improvements.md doc I saw referenced). Why the inconsistency between articles (which uses `patch`) and annotations (which uses `set`)?

If there's a reason (e.g. `patch` doesn't support full-array replacement), leave a comment. Otherwise, switch to `patch` so we get Folio's internal conditional-write logic for free.

### 3.4 Feed cache is a tri-state-plus-negative-cache and nobody tests it

```ts
// sources.ts:211 — on fetch failure, if cached, serve cached with an error
if (cached) {
  feedCache.set(key, { ...cached, error: message });
  ...
```

Serving stale items with an error field — good UX pattern. But `cached` can itself be stale (>15 min), and we don't check. We'll serve arbitrarily-old cache if the upstream is down for hours. For a source that goes permanently 404, we'll serve the pre-404 items forever until the instance recycles.

Tests in `sources.test.ts` don't cover the "cached + error" branch. Any test doing `fetchSourceItems` twice, where the second call fails, would catch a regression here.

---

## 4. Security

### 4.1 DOMPurify config — solid, with two minor gaps

`sanitize-config.ts` is well-thought-through. The shared config between `markdown.ts` and `markdown-client.ts` is exactly the right pattern. Defence-in-depth via both `ALLOWED_TAGS` and `FORBID_TAGS` is correct; the comment at line 109 explaining why `data:image/` only is good.

Gaps:

- `id` is not in `ALLOWED_ATTR`. Fine, but that means markdown heading anchors (`## Foo {#foo}`) don't yield navigable anchors. If TOC / in-page navigation matters, add `id` and explicitly strip `javascript:` from it. Worth explicitly noting this is a deliberate omission (none of the files indicate it is).
- The `afterSanitizeAttributes` hook mutates the external-link `target`/`rel`. DOMPurify hooks are module-global — `addHook` in `markdown.ts:9` registers once at module load. For the client variant, `markdown-client.ts:13` also registers unconditionally on every module import. If HMR or multiple bundles run through the same `DOMPurify` instance, hooks can stack. In practice unlikely, but `DOMPurify.removeHook('afterSanitizeAttributes', hook)` before `addHook` would be safer.
- No test for `<a href="javascript:alert(1)">` surviving the pipeline. There's a whole `markdown.test.ts`; I'd add an explicit "javascript: URIs are stripped" expectation for every link-bearing pattern. DOMPurify handles it via `ALLOWED_URI_REGEXP`, but the test is cheap and future-proofs against config drift.

### 4.2 CSRF: `checkOrigin` behaviour when `Origin` is missing

```ts
// csrf.ts:70
if (!origin) return null; // allowed
```

Modern browsers send `Origin` on all cross-origin fetches and most same-origin fetches. A missing `Origin` header means either:

- Same-origin classical form post (browsers historically skipped it, though current Chromium always sends it)
- Non-browser client (curl, another server, something you own)
- An attacker stripping the header via a proxy they control

Combined with Clerk's session cookie (`SameSite=Lax` by default), the practical CSRF risk is: attacker tricks user into navigating to an attacker URL that submits a form to `POST /api/articles`. Browser sends cookies. Browser _does_ send `Origin` for forms, _does not_ for link clicks. So the lax-same-site cookie blocks link-click CSRF but not form-submit CSRF, and the missing-Origin bypass here allows form-submit CSRF if `Origin` got stripped.

In practice, for the scenarios the app actually exposes (authenticated POSTs to `/api/articles`, etc.), the `Origin` header is always present from a real browser. The bypass exists in theory more than practice.

**For juniors:** "in theory not in practice" is how real CVEs start. If the null-Origin branch is there because of same-origin compat, write a test that proves what it's compat-ing. Otherwise default-deny.

### 4.3 `/api/articles/[id]/diff` is an auth'd HTTP proxy

This route fetches an arbitrary URL from the auth'd user and returns the body diff. Rate-limited (`diffLimiter` — 5 burst, 1 per 10 s = 360/hour). Still:

- Authenticated users can use it to probe internal HTTP infra (SSRF is gated at `assertPublicHost` — good — so the exposure is the same as `/api/articles` POST).
- Response body can be large (body cap is 5 MB on fetch). Diff itself is unbounded. A 5 MB body split into diff chunks could produce a much larger JSON response. There's no output cap.

Minor, but worth tightening: cap the diff JSON size.

### 4.4 `CRON_SECRET` does double duty

The same `CRON_SECRET` signs unsubscribe tokens (`digest.ts:100`) and authenticates cron calls (`cron-auth.ts:11`). Rotating it — which you'd want to do periodically, or immediately on any incident — invalidates _every_ outstanding unsubscribe token. Users clicking old unsubscribe links post-rotation will see "Invalid token", panic, and email support.

Separate `CRON_SECRET` from `UNSUBSCRIBE_SIGNING_KEY`.

### 4.5 Extension: captured HTML may contain auth tokens

`extension/background.js:17` notes the privacy concern ("the captured HTML may contain sensitive page content"). The comment claims "the server error handler logs URL and error messages only, never the HTML body". Let me verify:

- `/api/articles/route.ts:89` — on `IngestError`, logs `{url, message, cause}`. `cause` could include raw HTML depending on where the error came from.
- `/api/articles/route.ts:97` — on unexpected error, logs `{url, errorName, code, name, message}`. No body. Good.
- `parseArticleFromHtml` throws `IngestError("Could not extract readable content from page")` — no HTML in the message. Good.
- `readBoundedBody` throws with no HTML. Good.

So the comment is _currently_ true. But `cause` can leak. If `IngestError` wraps a JSDOM parse error that includes a snippet, it goes to server logs (and then potentially to log aggregation / Datadog / whatever). Recommend: strip `cause` from logged payloads, or stringify at the catch site with a length cap.

### 4.6 Extension allows unknown `chrome-extension://` IDs in local dev

```ts
// csrf.ts:84
if (!isLocalDevEnvironment()) {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
// No allowlist configured. Only permitted in local development
```

The `isLocalDevEnvironment` check is `!VERCEL_ENV && NODE_ENV !== "production"`. That's safe on Vercel. What about a self-hosted deployment (future)? If `VERCEL_ENV` is unset and `NODE_ENV` is `development` (mistyped in a Kubernetes env), we accept any extension origin with valid Clerk cookies. Unlikely, but the check is "is this Vercel?" when we mean "is this production?". Make the check positive (`process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV`) so the default-deny is actually the default.

---

## 5. Type system — where we're fighting the compiler

### 5.1 The `as unknown as z.ZodType<X>` pattern is a smell

Across the codebase:

- `articles.ts:104`
- `sources.ts:32`
- `annotations.ts:65`
- `auto-archive.ts:64`
- `digest.ts:30`

Every one of them is because the author wrote a hand-rolled `interface` first, then a zod schema, and then had to convince TypeScript the schema produces the interface. The zod schema's inferred type differs subtly — usually `.optional()` becoming `T | undefined` vs the interface's missing property, or `.default(…)` not narrowing.

The standard fix is to pick one source of truth:

```ts
const articleFrontmatterSchema = z.object({ ... });
export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;
```

…and never hand-write the interface. Or the other way around: write the interface and use `z.object(...) satisfies z.ZodType<ArticleFrontmatter>` (a real assertion, not a cast). Casts via `as unknown as` defeat the compiler; `satisfies` keeps the check.

**For juniors:** `as X` is the type-system equivalent of `// TODO: trust me`. Every one of them is a place the compiler was trying to tell you something. Write the code so the cast isn't needed.

### 5.2 `ArticleFrontmatter` has `[key: string]: unknown`

```ts
// articles.ts:77
  [key: string]: unknown;
```

This index signature is there so Folio can carry extra fields through without the type narrowing them out. But it also means any typo in a property name compiles — `frontmatter.readPrgoress = 0.5` is valid TypeScript against this interface. That's an easy hour-long bug to miss.

If Folio's API needs extensibility, use a generic: `type ArticleFrontmatter<Extra = {}> = { title: ... } & Extra`. Don't poison the base type with a string index.

### 5.3 `Promise<{ kind: "err"; res: Response } | { kind: "ok"; userId: ... }>` in annotations route

```ts
// annotations/route.ts:16
async function authed(...): Promise<
  | { kind: "err"; res: Response }
  | { kind: "ok"; userId: ReturnType<typeof authedUserId> }
> {
```

This is a nice tagged union. But in the other routes, the pattern is `if (!rawUserId) return 401`. Pick one and share it. Having two styles of the same thing in the same repo makes code review harder for reviewers who haven't read all of it.

Side note: `ReturnType<typeof authedUserId>` is just `AuthedUserId`. Use the name directly.

---

## 6. Testing — generally very good, with blind spots

The test suite is serious: 5,400 lines, SSRF fuzzing, a 763-line `ingest.test.ts`, and an e2e Playwright setup. This is above-average for an app of this size. Points to call out:

**What's good:**

- `ingest-security.test.ts` table-tests every IPv4/IPv6 edge case. This is the right pattern for security primitives.
- `markdown.test.ts` tests sanitisation outcomes (that's what matters), not internals.
- `cron-auth.test.ts` verifies constant-time equality behavioural properties.
- Integration tests against the memory Folio adapter (`BROADSHEET_FOLIO_ADAPTER = "memory"` in tests) mean you test the real code path.

**What's missing:**

1. **Delete-all-of-X test for annotations** — directly causes the §2.1 bug.
2. **Concurrency tests** against Folio's conflict semantics. `articles-crud.test.ts` runs patches sequentially.
3. **XSS regression tests** for each DOMPurify config change. The config is security-critical. A test file of "scary input → sanitised output" fixtures, updated on every config edit, is table stakes.
4. **Rate-limit integration** — `rate-limit.test.ts` tests the bucket, but not "two requests through the actual route handler with the limiter applied".
5. **E2E** currently covers auth setup and articles. Digest send, unsubscribe, pocket import — all absent. These are the highest-blast-radius flows.
6. **No load test / budget test** — `/library` with 5,000 articles: does it return in <1 s? No test. Easy to regress.
7. **`route.ts` handlers** mostly untested directly. `patch-route.test.ts` tests one; the rest rely on lib tests + e2e.

---

## 7. Code quality grumbles (by topic)

### 7.1 Magic numbers scattered

`150` scroll threshold, `0.9` read-complete, `0.02` progress delta, `3000` progress interval, `8000` toast timeout — all defined near their use, most unlabelled at the call site. Most are fine; some are pretending to be constants. The `200 wpm` reading speed hardcoded in `estimateReadMinutes` (`ingest.ts:811`) is the kind of thing a user would want to configure.

### 7.2 Function length and file length

`ingest.ts` is 813 lines. `annotator.tsx` is 438 lines. `command-palette.tsx` is 772 lines. All three have a mix of "this is the public API" and "this is the ten internal helpers nobody outside the file needs". Extracting the helpers into `ingest-html-normalise.ts`, `annotator-offsets.ts`, etc. would reduce cognitive load for a first-time reader. None of these are wrong, all of them would be better split.

The `ingest.ts` file in particular is conceptually four modules: SSRF primitives, HTTP fetch wrapper, HTML parsing, markdown emphasis promotion. Splitting would let SSRF primitives be tested in isolation (already effectively the case in `ingest-security.test.ts`) and would make the file tree tell the truth about the design.

### 7.3 `truncate` in `ingest.ts` and `truncate` in `feeds.ts`

```ts
// ingest.ts:230
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// feeds.ts:83
function truncate(text: string, max = 280): string | null {
  const clean = stripHtml(text);
  if (!clean) return null;
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}
```

Different semantics (one strips HTML, one doesn't) behind the same name. Not a bug, but confusing. At minimum, different names (`truncateMarkdown` / `truncatePlain`).

### 7.4 Email template HTML-escaping is hand-rolled

```ts
// digest-email.ts:21
function esc(s: string): string {
  return s.replace(/&/g, "&amp;")... // misses ' -> &#x27;
```

`'` isn't escaped. In attribute values inside single-quoted contexts this would be an XSS. This code outputs double-quoted attributes only, so it's safe today — but the function is named `esc`, which implies general-purpose escaping. Either fix it to be safe in all attribute contexts or rename it `escForDoubleQuotedAttr`.

Also: the email template uses `esc(a.id)` — article IDs are hex so escaping is unnecessary, but it's defence in depth and probably the right default. No complaint there.

### 7.5 Error messages in the UI leak stack-frame details

```tsx
// command-palette.tsx:312
setSaveError(payload.error ?? `Save failed (${res.status})`);
```

`payload.error` is the `publicMessage` — good. But several routes fall through to `"Internal error"`, which after a minute of clicking "retry" is as informative as a wall. At least correlate with a request id surfaced in headers so user-provided bug reports can find the log. Sentry / log id + a `X-Request-Id` response header would cost a day of work and save forever.

### 7.6 `'use client'` at top of files that don't need all of it

`annotator.tsx` is one big client component. Fine. But the file also contains `rangeToOffsets`, `nodeOffsetToPlain`, `paintHighlights`, `wrapRange`, `wrapCrossNode` — pure functions over DOM. They could live in a separate file without `"use client"`, and be unit-testable with JSDOM. Right now they're untestable except through the React component.

Same pattern: `command-palette.tsx` has `fuzzyScore`, `looksLikeUrl`, `loadRecents`, `pushRecent`, `flatten`, `coalesce` etc. Extract the pure helpers, test them.

### 7.7 `Math.random()` for jitter, `crypto.randomUUID()` for IDs

`articles.ts:391` uses `Math.random()` for retry jitter. Fine — it's a jitter, not security. `annotations.ts:203` uses `randomUUID()` for highlight IDs. Also fine. Good discipline on which PRNG goes where.

### 7.8 The `charsetFromContentType` regex accepts quoted and unquoted values

Good — that's what the RFC allows. But the function silently falls back to `"utf-8"` for anything the caller doesn't recognise. A page that claims `charset=windows-1251` (Cyrillic) decoded as UTF-8 will get mojibake'd article text. Worth logging (not failing) when the declared charset isn't one TextDecoder supports.

---

## 8. What junior engineers should take from this review

In decreasing order of leverage:

1. **"Where is the single source of truth for X?" is always a legitimate question.** When it's "a convention developers have to remember" (auth boundary, volume-suffix registry, two retry implementations), you have tech debt accruing interest. Push things up the stack until there's one.

2. **Idempotency in distributed systems is a design property, not a runtime hope.** The digest-send bug comes from "what happens if this `await` throws between the side effect and the bookkeeping?" That's the question to ask on every cron/webhook/PATCH.

3. **`as X` casts are bug magnets.** The TypeScript compiler is almost always right. When you find yourself reaching for `as unknown as`, the correct move is to align the shapes, not lie to the compiler.

4. **GET should not mutate.** Every mailbox-prefetcher in existence will click your link. Every AV will click your link. Every workplace DLP will click your link. State changes go in POST. Always.

5. **SSRF defence requires both layers: host allowlist AND bound-address check.** Resolving twice is not resolving once twice-safely.

6. **Testing the happy path is the easy half.** The hard half is "what exactly does my delete-all function delete?" and "what happens when upstream is slow?" and "what's in my cache when I fail?". Those tests are the ones that prevent incidents, so they're the ones worth writing first, not last.

7. **Observability is cheap, incidents are expensive.** Log request IDs, correlate them in error responses, keep a single structured logger. The current `console.error("[foo] failed", {...})` scattering is fine to start; it needs to become a single `log.error({requestId, module, err})` before the first production incident, not after.

8. **Comments explain _why_, code explains _what_.** This codebase is generally good at that — lots of "we do X because Y". Keep that up, and when you find a comment saying "for performance" or "for correctness" with no elaboration, ask.

9. **File length is a design signal.** If a file is a thousand lines, it's doing too much. The fix isn't always to split; sometimes the fix is to rewrite. But "this file scares me" is a real observation that should be acted on.

10. **Every security property that matters should have a test that fails if it regresses.** DOMPurify config, SSRF, CSRF, cron-bearer, Clerk webhook signature — one hostile-input test per property, kept alive forever, keeps tomorrow's change from silently undoing today's hardening.

---

## 9. What this review is NOT saying

- The codebase is bad. It isn't. It's above the median app in careful hardening (SSRF, rate-limit, sanitisation, auth branding, atomic writes). The critique tone is because the brief is "criticise as much as you can" — not "this is a dumpster fire".
- Everything here should be fixed. Several items are product decisions (canonicalisation aggressiveness, which pages get offline cache) and need a PM call. Flag them, don't silently fix.
- The architecture should change. The file-DB-via-Folio choice is defensible for the stated product scale. The "split into Postgres" line in the PRD is the right deferred item. None of my critiques force that call to be made sooner.

The bugs to fix this week are §2.1, §2.2, §2.3. Everything else is prioritised backlog.
