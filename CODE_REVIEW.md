# Broadsheet — holistic code review

**Reviewer:** Incoming principal eng, first pass over the repo.
**Scope:** Everything under `src/`, `apps/extension/`, build config, tests, repo hygiene.
**Tone:** Direct. The goal is to make the next commits _obviously_ better, not to be nice about the current ones.

---

## Resolved since this review was written

The review below is preserved verbatim as a snapshot. The following findings have been addressed in subsequent commits and should be considered closed:

- **#1 SSRF in the ingest pipeline** — Resolved in commit `5b05e5e`. `src/lib/ingest.ts` now resolves the hostname via `dns.lookup`, rejects any address in RFC1918, loopback, link-local, ULA, CGNAT, multicast, or IPv4-mapped IPv6 ranges via `assertPublicHost`, uses `redirect: "manual"`, re-runs the address check on every hop, and caps at `MAX_REDIRECTS = 5`.
- **#2 No timeout / size cap on the fetched body** — Resolved in commit `5b05e5e`. `fetchAndParse` uses `AbortSignal.timeout(FETCH_TIMEOUT_MS)` (15 s), a streaming `readBoundedBody` with `MAX_BODY_BYTES = 5 MB`, and `isHtmlContentType` as a content-type allowlist.
- **#5 `FsAdapter` silent fallback in production** — Resolved in commit `5b05e5e`. `resolveAdapter` in `src/lib/folio.ts` throws when `NODE_ENV === "production" && !BLOB_READ_WRITE_TOKEN`.
- **#7 `markRead` is dead code** — Resolved. `markRead`, `setArchived`, and `setTags` are now wired through `src/app/api/articles/[id]/route.ts` and consumed from `src/app/read/[id]/article-actions.tsx`.
- **#11 No dedup on save** — Resolved. `src/lib/articles.ts` now implements `canonicalizeUrl` (strips tracking params, normalises host/path) and `articleIdForUrl` (sha256 of canonical URL → 32 hex chars), and `saveArticle` short-circuits when an entry already exists.
- **#13 Error messages leak internal details** — Resolved in commit `5b05e5e`. `IngestError.publicMessage` separates user-facing text from the raw message; `src/app/api/articles/route.ts` logs the raw error server-side and returns only `publicMessage` in the 422 response.
- **#16 `folioblob-next: file:...` workaround** — Resolved in commit `635ecf9`. `package.json` now depends on the published `folio-db-next@^0.1.0`.
- **#16 Committed `default.profraw` / `tsconfig.tsbuildinfo`** — Resolved. `.gitignore` now excludes `*.profraw` and `*.tsbuildinfo`; files are untracked.
- **#16 Dirty `.gitignore`** — Resolved; working tree clean.

Findings #3, #4, #6, #8–#10, #12, #14–#15, #17–#20 remain open as written. **#3 (rate limiting on `POST /api/articles`) is the only remaining pre-production blocker from the §20 "this week" list.**

---

The MVP is small and the architecture is basically sound — Next.js App Router, Clerk for auth, a pluggable blob storage layer, Readability + Turndown for ingestion. That's the good news. The bad news is that a handful of these files ship behaviour that would get flagged in any half-decent security review, and the test coverage stops exactly where the interesting bugs live.

I've ordered findings by blast radius, not by file. Read top-to-bottom.

---

## 1. Critical: server-side request forgery in the ingest pipeline

**File:** `src/lib/ingest.ts:55` (`fetchAndParse`), called from `src/app/api/articles/route.ts:35`.

```ts
res = await fetch(url, { ... redirect: "follow" });
```

Any authenticated user — i.e. anyone who can sign up — can POST a URL and the server will fetch it. There is:

- No allowlist of schemes (so `file://`? actually `fetch` rejects it, but…).
- No blocklist of hosts. `http://169.254.169.254/latest/meta-data/` on AWS, `http://metadata.google.internal` on GCP, `http://localhost:5432`, `http://10.0.0.1/admin`, `http://[::1]/`, your internal Grafana — all fetchable.
- `redirect: "follow"` means an attacker can point at a benign public URL that 302s to `http://169.254.169.254/`. Blocklisting won't save you unless you also re-check after every redirect.
- No DNS pinning, so even an allowlist/blocklist is vulnerable to DNS-rebinding if you later cache the record.

**Why this matters:** on Vercel (Fluid Compute) the function runs inside Vercel's network. The AWS metadata endpoint specifically is less exposed than on raw EC2, but the class of attack — internal services, self-hosted DBs reachable via connected Postgres/Redis integrations, webhooks pointing at localhost — is very real.

**How to fix, in order of reliability:**

1. Resolve the hostname yourself (`dns.lookup`), reject anything in `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`, metadata IPs.
2. `redirect: "manual"`, handle 3xx yourself, re-run the IP check on every hop, cap at ~5 hops.
3. Connect to the _resolved IP_ with a `Host:` header (or use an HTTP agent with a DNS lookup hook) so a later DNS flip can't change the destination.
4. Or — much simpler — route ingestion through **Vercel Sandbox** or an isolated fetch worker that has no network access to anything interesting. This is the boring-but-correct answer if you don't want to own an SSRF filter forever.

**Teaching moment:** "we only fetch URLs the user gave us" is _exactly_ the mindset that ships SSRF. The rule is: if the server makes a network call to a host it didn't compile in, treat it like untrusted code until proven otherwise.

---

## 2. Critical: no timeout, no size cap on the fetched body

Same function, same lines.

- No `AbortSignal.timeout(...)`. A slow-loris upstream keeps the serverless function alive to the platform ceiling (300s on Vercel now). One user, a handful of tabs, and your bill gets interesting.
- `await res.text()` consumes whatever the upstream sends. A 2 GB response — or an infinite stream — will happily try to buffer into memory. JSDOM then tries to parse it.
- No `Content-Type` check. Point it at a 500 MB `.iso`, the server dutifully downloads and hands to JSDOM.

**Fix:**

```ts
const res = await fetch(url, {
  signal: AbortSignal.timeout(15_000),
  headers: { ... },
  redirect: "manual",
});
const ct = res.headers.get("content-type") ?? "";
if (!/^text\/html|application\/xhtml\+xml/.test(ct)) {
  throw new IngestError(`Unsupported content-type: ${ct}`);
}
// Read with a byte cap
const reader = res.body!.getReader();
const MAX = 5 * 1024 * 1024; // 5 MB
let total = 0;
const chunks: Uint8Array[] = [];
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  total += value.byteLength;
  if (total > MAX) throw new IngestError("Page too large");
  chunks.push(value);
}
const html = new TextDecoder().decode(Buffer.concat(chunks));
```

**Teaching moment:** every outbound call needs three bounds — _time_, _bytes_, _count_ (redirect hops). Writing a network call without them is writing a DoS primitive.

---

## 3. High: no rate limiting on `POST /api/articles`

One authenticated user can, right now, force the server to fetch-and-parse N URLs per second until your blob store bill is embarrassing or a slow upstream hits finding #2. Clerk gives you `userId` — that's your rate-limit key. Use Upstash Redis via the Marketplace, or even an in-memory leaky bucket per instance for the MVP.

Combine with #1 and #2: those three findings are one vulnerability wearing a trench coat.

---

## 4. High: Readability HTML is round-tripped through Turndown, then Markdown → HTML → DOMPurify

`ingest.ts:40` HTML → Markdown (Turndown). `markdown.ts:24` Markdown → HTML (marked) → DOMPurify.

This is two lossy conversions back-to-back, with a sanitise at the end. A few consequences:

- **Rendering fidelity:** figures, captions, footnotes, pull quotes, `<aside>`, MathML, inline SVG — all either lost or mangled. For a "read it cleanly" product, this is the product surface, not an implementation detail.
- **Performance:** you're loading jsdom (~40 MB of code) on every POST, marked on every GET of `/read/[id]`. Consider sanitising the Readability output once at save time and storing sanitised HTML alongside (or instead of) markdown. Storing markdown is only worth it if you can render it faithfully — right now you can't.
- **Testing gap:** there are no round-trip tests. "HTML with a `<figure>` → stored → rendered back" is not asserted anywhere.

**Recommendation:** store the sanitised HTML (what DOMPurify approves) as the canonical body. Keep the markdown if you like for portability, but don't re-render it on every read. This fixes fidelity, performance, and the sanitise-twice code smell in one go.

---

## 5. High: `FsAdapter` in production is a silent footgun

`src/lib/folio.ts:25`:

```ts
const baseDir = process.env.BROADSHEET_FS_DIR ?? ".broadsheet-data";
adapter = new FsAdapter({ baseDir });
```

If `BLOB_READ_WRITE_TOKEN` is unset in production, the app falls through to writing articles to `./broadsheet-data` on the serverless function's ephemeral filesystem. On Vercel (Fluid Compute), that directory _does_ persist across warm invocations on the same instance — but it does **not** persist across cold starts, deploys, or instance recycling. Users will see their library randomly empty out.

Options:

- Fail closed: if `NODE_ENV === "production"` and there's no blob token, throw at boot. Don't silently degrade to local disk.
- Put the check in `resolveAdapter` and surface a clear error to `/api/articles` so you get a 500 instead of ghost data.

**Teaching moment:** "fall back to local disk" is always wrong in serverless. Local disk is per-invocation cache, not storage.

---

## 6. High: cross-user auth only works because two mistakes cancel out

`src/lib/folio.ts:38` hashes the Clerk `userId` to 24 hex chars and uses it as a volume name. Everything downstream — `saveArticle`, `getArticle`, `listArticles`, `markRead` — scopes by that volume. So far so good.

But there's nothing enforcing at the _API boundary_ that the caller's userId is used. Every function takes `userId` as a parameter, and the only caller is the route handler, which reads from `auth()`. One future "admin endpoint" or one accidental `getArticle(req.body.userId, id)` and you have IDOR. A thin `currentUserVolume()` helper that calls `auth()` directly, with no `userId` parameter on the public functions, would make the mistake impossible to write.

Also, 96 bits of hash collision resistance is fine for any realistic user count, but truncating hashes is a code smell. If folio's volume-name regex is the only reason to hash at all, document that right next to `volumeNameForUser`, and use `.slice(0, 40)` or the full hash — 24 characters saves you nothing and reads like an arbitrary choice.

---

## 7. High: `markRead` is dead code

`src/lib/articles.ts:89` exports a `markRead` function. Grep the repo — nothing calls it. There's no API route, no UI affordance. The `readAt` field in the frontmatter is _declared_ but never _written_. The library page at `src/app/library/page.tsx:41` renders a "Read" badge conditional on `a.readAt`, which will never be truthy.

Dead code is a liability:

- readers assume it's load-bearing and won't delete it;
- it'll rot the next time the `Article` schema changes;
- it makes the surface area look bigger than it is, which makes new engineers cautious about touching things they shouldn't be cautious about.

Either wire it up (a PATCH endpoint, a toggle on the reader) or delete it. Pick this week.

---

## 8. Medium: DOMPurify config drops things real articles use

`src/lib/markdown.ts:9`.

- `ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i` rejects `data:` images. Plenty of news sites inline tiny images as data URIs, or use them for LQIP placeholders. Those will silently disappear.
- `ALLOWED_ATTR` has no `class`, `id`, `target`, `rel`, `width`, `height`, `data-*`. That's fine for a locked-down reader view, but `target`/`rel` matter if you ever render an "open in new tab" link — the "Original" link in `read/[id]/page.tsx:38` is hand-written and hardcodes `rel="noreferrer noopener"`, so it's fine, but inline links inside the article body will open in the same tab with no rel attributes. Decide once and document the policy.
- `srcset` is allowed but DOMPurify's srcset handling historically leaves URLs that slip past the URI regexp on some versions — worth confirming current `isomorphic-dompurify` behaviour and adding an explicit test.
- No `ALLOW_DATA_ATTR: false`, no `FORBID_TAGS`, no `SAFE_FOR_TEMPLATES`. Explicit > implicit.

**Test this with a real article, not a canned HTML snippet.** The existing test (`markdown.test.ts`) proves the obvious XSS vectors are dead. It does not prove real articles render correctly.

---

## 9. Medium: privacy leak through remote images in the reader view

Articles are rendered with `dangerouslySetInnerHTML` (`src/app/read/[id]/page.tsx:51`), including `<img src="https://tracker.example/...">`. Every time a user opens their library, the original publishers' image CDNs see a hit with a referrer, cookies (if any), user agent, IP. That's a meaningful privacy regression vs. "I saved this to read later" — arguably the product's whole point is that you _don't_ call home to the publisher.

Two remediations:

1. `<meta name="referrer" content="no-referrer">` on the layout. Cheap. Stops the referrer leak.
2. Download images at save time, store in Vercel Blob, rewrite `src` to your own URLs. Expensive. Fixes the IP/UA leak too and makes the library work offline (well, server-side cache-y).

Do (1) now. Put (2) on the roadmap if you care about this use case.

---

## 10. Medium: `force-dynamic` everywhere and no pagination

`library/page.tsx:9` and `read/[id]/page.tsx:8` both set `export const dynamic = "force-dynamic"`. That's correct for auth-gated pages, but combined with `listArticles` having no pagination or limit, every library load fetches and sorts _every_ article the user has ever saved. At 1,000 articles this is slow. At 10,000 it's a bug.

Also worth noting: you're on Next 16 and this codebase doesn't use any Cache Components (`'use cache'`) or `cacheLife`. Fine — read-later apps are inherently user-specific and hard to cache — but there's no reason `renderMarkdown` for a given article body should run on every page view. Memoise by article id, or cache the rendered HTML alongside the body.

---

## 11. Medium: no dedup on save

POST the same URL twice and you get two rows with different ids. The product promise is "keep a clean library"; duplicates are a core UX failure. `saveArticle` should canonicalise the URL (strip tracking params, fragment, trailing slash, lowercase host) and check for an existing entry before writing.

A hash of the canonicalised URL also makes a better article id than a random UUID — it's idempotent, cacheable, and lets the extension detect "already saved" without a round-trip. UUID is only the right answer if you _want_ duplicates.

---

## 12. Medium: `marked.parse(..., { async: false }) as string` is a trap

`src/lib/markdown.ts:24`. Two issues:

- `as string` is a lie to the type system. If a future `marked` plugin or config change makes this return a `Promise<string>`, DOMPurify sanitises `"[object Promise]"` and your reader view silently goes blank. The compiler won't catch it.
- Setting `{ async: false }` is fragile — `marked` has been moving this around across versions. Pin the version (you're on `^18.0.0` — ideally lock to `~18.0.0`) and write a test that fails if this ever returns a non-string.

```ts
const html = marked.parse(md);
if (typeof html !== "string") throw new Error("marked returned a Promise");
```

Ugly but correct. Or use `marked.parseSync` if your version has it.

---

## 13. Medium: error messages and logging leak internal details

`ingest.ts:67`:

```ts
throw new IngestError(`Failed to fetch URL: ${(err as Error).message}`, err);
```

…which is passed straight to the user in `route.ts:40` as a 422. `err.message` here can be `"connect ECONNREFUSED 10.0.0.7:5432"`. Combine with finding #1 and you have an SSRF _scanner_ — the error messages confirm which internal hosts are reachable.

Log the raw error server-side, return a generic `"Could not fetch the page"` to the client. Same applies to `parseArticleFromHtml` errors — the user doesn't need the Readability internals.

Also, `console.error("[api/articles] save failed", err)` is the only observability in this file. No structured logging, no request id, no latency timer. Add a minimal structured logger (one function, `log(event, fields)`) before the codebase grows teeth.

---

## 14. Medium: no CSRF hardening

The app trusts a Clerk session cookie on `POST /api/articles`. The content-type is forced to `application/json`, which triggers a CORS preflight for cross-origin requests, which a third-party site can't complete without your CORS headers — so the practical risk is low. But "low" isn't "zero", and Clerk does publish CSRF guidance for exactly this case. At minimum:

- Explicitly reject requests whose `Origin` is neither `null` (same-origin) nor your allowed list.
- Document that the extension uses `credentials: "include"` with `host_permissions: https://*/*` — that's a broad grant. The extension should only target Broadsheet's origin and the active tab.

---

## 15. Medium: the Chrome extension's `host_permissions`

`apps/extension/manifest.json:19`:

```json
"host_permissions": ["http://localhost:3000/*", "https://*/*"]
```

`https://*/*` is the "can talk to any HTTPS site" permission. The only thing the extension actually needs is to POST to Broadsheet's API. Replace with the production domain (and `http://localhost:3000/*` for dev) and the Chrome store review gets easier too. Extensions that ask for `<all_urls>` have to justify it; yours can't — all it needs is the active tab's URL (`activeTab` already gives you that) and the Broadsheet origin.

Side note: the extension's default base URL is `http://localhost:3000`. Ship a sensible production default before the first external tester installs it.

---

## 16. Low: repo hygiene

Small stuff, but it adds up:

- `default.profraw` (Rust coverage artifact?) and `tsconfig.tsbuildinfo` are committed. Add to `.gitignore`.
- `.gitignore` has uncommitted modifications (`M .gitignore` in git status). Commit or revert.
- `folioblob-next: file:../../mcclowes/folio/packages/folio-next` in `package.json`. This works on your laptop. It will fail on CI, on any other developer's machine, on a fresh Vercel build, and in two weeks when you forget you did it. Publish the package (even privately) or vendor it into this repo.
- No `lint` script in CI (there's `next lint` in package.json but no lint config visible), no `typecheck` step wired to PRs, no `test` step. Add a GitHub Action that runs `npm run lint && npm run typecheck && npm test` on every PR. This is 30 minutes of work and catches the next six bugs on this list before they land.
- No `eslint` config file in tree — `next lint` depends on Next's built-in rules. That's fine for now, but turn on `@typescript-eslint/no-explicit-any`, `no-floating-promises`, `@typescript-eslint/consistent-type-imports`.
- `package.json` has no `postinstall` guard against the `file:` dependency — a fresh `npm ci` in CI will just explode.

---

## 17. Low: test coverage has a sharp boundary

What's tested:

- `parseArticleFromHtml` happy path + empty-body error (`ingest.test.ts`)
- `estimateReadMinutes` (two cases)
- `renderMarkdown` XSS vectors (`markdown.test.ts`)

What isn't tested, at all:

- `fetchAndParse` (the function that has all the SSRF/DoS exposure)
- `saveArticle`, `listArticles`, `getArticle`, `markRead` — the entire storage layer
- `volumeNameForUser` (easy win: assert stable hash, assert regex-safe output)
- The route handler (auth unhappy path, bad JSON, zod reject, IngestError → 422, unknown error → 500)
- The extension background script (it's plain JS, but `saveAndNotify` is testable)
- Any end-to-end "save a URL, see it in the library, open it" happy path
- Round-trip: a real article's HTML → markdown → HTML → sanitised → rendered

You've tested the easy 20%. The bugs live in the other 80%. As a rule of thumb: **test every function that returns a Promise and every function that touches the network**. That list would have caught findings #1, #2, #11, and #12 before review.

**Teaching moment for the team:** tests are not a badge. They're a lever. You write a test for the thing that scares you — and if nothing scared you when you wrote it, you weren't thinking hard enough about what could go wrong.

---

## 18. Edge cases I don't see handled anywhere

A non-exhaustive list of things that will happen in production and bite you:

- **Non-UTF-8 pages.** Latin-1, Shift-JIS, GB2312. `res.text()` uses UTF-8. JSDOM may or may not detect the meta charset. Test with a real Japanese news site.
- **Paywalls.** Readability will happily parse the paywall teaser as the article. Users will save "Subscribe now!" instead of content. At minimum, warn if `wordCount < 200`.
- **Infinite-scroll articles / single-page apps.** Readability runs on the initial HTML. A client-rendered article on Medium, Substack (works, they SSR), NYT (works), vs. something Next.js-based with JS-only content → empty parse.
- **Cloudflare / anti-bot walls.** Your `User-Agent` identifies as a bot. Half the news web will serve you a 403 or a JS challenge page. You'll parse the challenge page.
- **Redirect loops.** `redirect: "follow"` has a default cap, but combined with #1 you want to own the cap.
- **Very long titles / bylines.** The frontmatter schema has no max length. Someone's going to save an article with a 3 KB title.
- **Unicode filenames in blob storage.** Depends on folio — probably fine because you hash — but worth asserting.
- **Concurrent saves of the same URL from the same user.** Two tabs, two clicks, two rows. See finding #11.
- **Clock skew between save and display.** `savedAt: new Date().toISOString()` → trust server clock, fine, but add a test that mocks Date.
- **Clerk webhooks / user deletion.** If a Clerk user is deleted, their volume lives forever in blob storage. GDPR says you have 30 days. Wire a Clerk webhook → volume delete. Budget a week for this before you take public signups.
- **`/read/[id]` with a malformed id.** Not tested. `getArticle` presumably returns null, you `notFound()`. Assert it.
- **Articles with >1000 images.** `renderMarkdown` will render them all synchronously into one string. Not dangerous, just slow.
- **An image URL that 404s.** Inline `<img>` in the reader view will render broken-image icons with no alt text fallback. Consider lazy loading + `onerror` replacement.

---

## 19. Architectural observations

Less "you are wrong" and more "things a principal would push on if this grew":

1. **The ingest pipeline is synchronous inside the request.** Save → fetch → parse → store, all inside the POST. On a slow article this is a 5–10 second POST. UX-wise that's ugly; reliability-wise, any parse failure halfway through leaves nothing saved _and_ the user has lost their URL. Consider: the POST enqueues a job (Vercel Queues is in public beta — or a simple "pending" row), returns immediately with 202, the client polls or the UI shows "saving…" via SSE. This also lets you retry parse failures automatically.
2. **Storage layer is abstracted but the abstraction is leaky.** `folio.ts` picks an adapter based on env vars with a cascading if-else, mutable singletons, and no clean dev-vs-prod gate. Either commit to "always blob" and delete the fs/memory adapters from the runtime (keep for tests via DI), or make the selection explicit in config, not env sniffing. The current shape is the worst of both worlds: hard to reason about _and_ easy to misconfigure (see #5).
3. **No analytics, no error reporting.** When something breaks in prod, you'll find out from a user. Wire Sentry (or Vercel's built-in) before you ship publicly. The 30-minute version is fine.
4. **No feature flags, no kill switch.** If the ingest pipeline starts misbehaving — a Readability bug on a popular site, say — you have to ship a revert to turn it off. A simple env-var kill switch on `/api/articles` POST gives you an abort button.
5. **The extension and the web app live in the same repo but share nothing.** The extension hand-rolls its own "post JSON to /api/articles" logic. If the API response shape changes, the extension breaks silently. Consider extracting a tiny shared client (`src/lib/client.ts`) that both consume. Tiny, cheap, buys you safety.

---

## 20. What to do about all this — a triage list for the team

**This week (stop-the-bleeding):**

1. SSRF + timeout + body cap on `fetchAndParse` (findings #1, #2). This is a pre-production blocker.
2. Rate limit POST `/api/articles` (finding #3).
3. Fail closed when `NODE_ENV === "production" && !BLOB_READ_WRITE_TOKEN` (finding #5).
4. Sanitize error messages back to the client (finding #13).
5. Tighten Chrome extension `host_permissions` (finding #15).

**Next sprint:**

6. Dedup + URL canonicalisation + idempotent save (finding #11).
7. Delete or implement `markRead` (finding #7).
8. Pagination + `listArticles` limit (finding #10).
9. `no-referrer` meta tag in layout (finding #9).
10. Tests for the route handler, the storage layer, and at least one real-world ingest fixture (finding #17).
11. Wire lint/typecheck/test into CI (finding #16).
12. Publish `folioblob-next` or vendor it (finding #16).

**Before public launch:**

13. Async ingest pipeline (architecture point #1).
14. User deletion via Clerk webhook + GDPR story (edge case in #18).
15. Sentry / structured logging.
16. Decide on and document the storage + rendering path: markdown-only, HTML-only, or both — and which is canonical (finding #4).

---

## Closing note for junior engineers on this team

A few themes worth internalising, because they show up in almost every finding above:

- **Every network call needs bounds.** Time, bytes, hops. Every one. No exceptions. If you find yourself typing `await fetch(` without a timeout, stop.
- **Graceful degradation is not free.** "Fall back to local disk" saves you an error today and loses you a user tomorrow. Fail loudly when a critical dependency is missing, in the environment where it matters.
- **Dead code is not neutral.** `markRead` sits there looking like it does something. Either it does, and it's tested, or it goes. Midway is the worst state.
- **Tests are a lever, not a badge.** Don't optimise for coverage percentage; optimise for "could this silently break in production?" Write a test for that thing specifically.
- **Sanitise at the boundary, not in the middle.** You sanitise HTML at render time (good), but only _after_ round-tripping it through markdown (which re-introduces the need to sanitise). Draw the trust boundary once, cleanly, and don't re-cross it.
- **Type assertions (`as string`) are you lying to the compiler.** Sometimes necessary, always a smell. Every one deserves a comment explaining _why_ you're sure it's safe, and ideally a runtime check that backs it up.
- **`force-dynamic` is not a performance strategy.** It's a correctness fallback. If you reach for it, you've given up on caching — make sure that was the right call, and that you've measured.

The codebase is small enough that all of this is fixable in a couple of focused weeks. It is _not_ small enough that you can ship it to real users as-is. Fix the top five first, then the rest, then come back and re-read this file.
