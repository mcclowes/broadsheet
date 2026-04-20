# Senior code review — auth, proxy layer, and general approach

> Reviewer context: first week on the project, principal-level lens, writing for the team's less-senior members so they can absorb the reasoning behind the critique, not just the conclusions. I've focused on the three areas the command asked for — **auth**, **the middleware ("proxy") layer**, and **the general approach** — but rounded it out where the adjacent code directly enables or undermines them.

The TL;DR for the team: **the security primitives are genuinely excellent** (SSRF hardening in `src/lib/ingest.ts`, fail-closed storage, branded user-id types, idempotent saves) — please don't read this review as "everything is broken." The critique is about the _seams_ between those primitives: where responsibilities are split between middleware and handlers, where secrets are reused across purposes, where an in-process assumption leaks into production behaviour. Those seams are where bugs will show up first when we scale or onboard new contributors.

---

## Contents

1. [Auth — the two-layer model](#1-auth--the-two-layer-model)
2. [The "proxy" layer (`src/proxy.ts`)](#2-the-proxy-layer-srcproxyts)
3. [CSRF, Origin, and the request-edge posture](#3-csrf-origin-and-the-request-edge-posture)
4. [Cron auth, webhook auth, and secret sprawl](#4-cron-auth-webhook-auth-and-secret-sprawl)
5. [Rate limiting — the in-process assumption](#5-rate-limiting--the-in-process-assumption)
6. [SSRF and outbound fetch — edge cases still unspotted](#6-ssrf-and-outbound-fetch--edge-cases-still-unspotted)
7. [Data-layer concerns that cross into auth](#7-data-layer-concerns-that-cross-into-auth)
8. [General approach — the stuff that'll hurt at scale](#8-general-approach--the-stuff-thatll-hurt-at-scale)
9. [What to keep doing (credit where due)](#9-what-to-keep-doing-credit-where-due)
10. [Recommended follow-ups, ranked](#10-recommended-follow-ups-ranked)

---

## 1. Auth — the two-layer model

### 1.1 Double enforcement without a single source of truth

`src/proxy.ts:16-34` enforces auth on a matcher list. Every handler under `/api/articles(.*)` etc. _also_ checks `await auth()` and returns 401 on null. Two enforcement points for one invariant.

```ts
// proxy.ts
const isProtectedApi = createRouteMatcher([
  "/api/articles(.*)",
  "/api/sources(.*)",
  "/api/digest/preferences(.*)",
  "/api/import(.*)",
]);
```

```ts
// Every route handler: same dance, six times
const { userId: rawUserId } = await auth();
if (!rawUserId)
  return Response.json({ error: "Unauthorized" }, { status: 401 });
const userId = authedUserId(rawUserId);
```

**Why this is a problem.** Either layer on its own is sufficient. Both together create three failure modes:

1. **Gaps.** `/api/settings/auto-archive/*` is _not_ in the middleware matcher (`src/proxy.ts:17-21`). The only reason it's safe is that the route handler (`src/app/api/settings/auto-archive/route.ts:12-15, 41-44`) remembers to call `auth()` itself. A junior copy-pasting a new `/api/settings/foo` route and forgetting either the matcher entry _or_ the handler-level check leaks data silently — and CI has no test that would catch that. (See §1.3.)
2. **Inconsistent response shapes.** Middleware returns `Response.json({ error: "Unauthorized" }, { status: 401 })`. Handlers return the same string. But if anyone changes one, they'll forget to change the other. I'd rather this error come from one place.
3. **Cognitive load.** To answer "is route X protected?" a reviewer must check two files. That's a tax every PR.

**What I'd do.** Pick one. In this codebase, I'd remove the middleware matcher for APIs and let each handler call a single helper:

```ts
// lib/auth-guard.ts
export async function requireUser(
  req: Request,
): Promise<
  { kind: "ok"; userId: AuthedUserId } | { kind: "err"; res: Response }
> {
  const originErr = checkOrigin(req); // read-only requests pass null-Origin
  if (originErr) return { kind: "err", res: originErr };
  const { userId } = await auth();
  if (!userId)
    return {
      kind: "err",
      res: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  return { kind: "ok", userId: authedUserId(userId) };
}
```

Keep the middleware for **pages** (`auth.protect()` redirects to `/sign-in`, which middleware is the correct place for). Keep it for public routes that need the Clerk session hydrated but don't require it (so `auth()` returns the session cheaply).

**Teaching point for juniors.** Defence-in-depth only helps if each layer enforces something the other can't. Two layers enforcing the exact same rule is just duplication — it doesn't make the system more secure, it makes it more brittle.

### 1.2 The matcher regexes over-match

```ts
const isProtectedPage = createRouteMatcher([
  "/library(.*)",   // also matches /library-foo
  "/read(.*)",      // also matches /ready, /reader
  ...
]);
```

No such collision exists today, but `/library(.*)` is a _prefix_ match, not a _path segment_ match. The day someone adds `/read-later` as an unauthenticated landing page, this will gate it unintentionally. **Fix:** `"/library", "/library/(.*)"`. Same for every entry.

**Why this matters.** This is how "why is this route asking me to sign in??" bugs happen six months from now, long after the commit author has moved on. These regex matchers are load-bearing — treat them like type signatures, not URL patterns.

### 1.3 No tests for the auth boundary

There are thorough unit tests for `articles.ts`, `ingest.ts`, `csrf.ts` — but **no test that asserts an unauthenticated request to `/api/articles` gets 401**, no test that `DELETE /api/sources/:id` checks the user's origin, no test that `/library` redirects signed-out users to `/sign-in`.

The auth posture is the single most security-critical surface, and it's the one area with zero regression lock-in. A Playwright spec that drives through unauthenticated routes and asserts 401/redirect for each would take an afternoon and prevent a whole category of future regressions.

**Teaching point.** "Does it work?" is a weaker question than "what prevents this from silently breaking in six months?" For auth, the answer is almost always a test.

### 1.4 `AuthedUserId` brand is good, but it lies at the webhook boundary

`src/lib/auth-types.ts:16-18`:

```ts
export function authedUserId(clerkUserId: string): AuthedUserId {
  return clerkUserId as AuthedUserId;
}
```

The brand is a great idea — it forces `getArticle(req.body.userId, id)` to be a type error. But in `src/app/api/webhooks/clerk/route.ts:23`, we construct an `AuthedUserId` from `event.data.id` — data that came in a webhook body. That ID is _Svix-signature-verified_, not _session-authenticated_. Those are different trust levels.

It's not a bug today (Clerk won't issue a `user.deleted` event for a user ID that doesn't belong to the app), but the name "Authed" is load-bearing semantically, and this usage weakens it. I'd introduce `TrustedUserId` (superset of `AuthedUserId`) for webhook-verified IDs, or at minimum rename the function in that call-site to make the trust-level explicit.

**Teaching point.** Branded types are contracts with your future self. The moment you use `as` to construct one from a value that doesn't meet the contract, you've silently repealed the contract — and no compiler will tell you.

---

## 2. The "proxy" layer (`src/proxy.ts`)

### 2.1 Naming — no, it's not a typo

For the juniors: `src/proxy.ts` is **the Next.js 16 renamed middleware file** (`middleware.ts` → `proxy.ts`). If you grep for `middleware` you'll find nothing and panic. Please add a one-line comment at the top:

```ts
// Next.js 16 middleware. Named `proxy.ts` per the Next 16 convention
// (see https://nextjs.org/docs/...). In older docs this file is "middleware.ts".
```

This would save every new contributor ten minutes.

### 2.2 The matcher is unreadable

```ts
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

Problems:

1. **No tRPC in this codebase.** The `trpc` match is dead.
2. **Negative lookahead lists file extensions.** Adding a new static type (e.g. a font, a video) means updating this regex — and if you forget, you pay the middleware cost on every static request.
3. **Zero test coverage.** There is no test that `.webp` assets skip the middleware, or that `/api/articles` hits it.

**What I'd do.** Either move to the documented Clerk pattern (which uses a simpler matcher plus an explicit public-routes list), or extract a named regex with commented rationale:

```ts
// Skip Next internals and common static asset extensions. Add new extensions
// here as you ship them; a missed entry costs a middleware invocation per
// asset fetch, not correctness.
const STATIC_ASSET = "[^?]*\\.(?:html?|css|js(?!on)|jpe?g|...)";
```

Either way, write a test: call `middleware(mockReq("/foo.png"))` and assert it's a no-op.

### 2.3 `frontendApiProxy: { enabled: true }` — unexplained and unvalidated

```ts
export default clerkMiddleware(async (auth, req) => { ... }, {
  frontendApiProxy: { enabled: true },
});
```

This enables Clerk's frontend-API proxy feature, which routes Clerk API calls through _your_ domain to avoid third-party cookies. Great feature — **but**:

1. It requires `NEXT_PUBLIC_CLERK_PROXY_URL` to be set and the Clerk dashboard to match. Neither is validated at startup the way `CLERK_SECRET_KEY` is in `next.config.ts:5-30`. If the env var is missing, auth fails in subtle cookie-setting ways rather than at boot.
2. There is no doc comment explaining _why_ this is enabled. A junior can't tell whether to leave it on, turn it off in preview, etc.

**Fix:** either remove it (if the cookie setup doesn't need it), or extend `validateClerkEnv` to require `NEXT_PUBLIC_CLERK_PROXY_URL` when the flag is on.

### 2.4 Middleware mixes API-401 and page-redirect policy

```ts
if (isProtectedApi(req)) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return;
}
if (isProtectedPage(req)) {
  await auth.protect();
}
```

Two distinct policies in one closure. That's fine in an MVP — at the next complexity bump (say, partial-auth pages, admin-only APIs), it'll want splitting. Not urgent, but flag it in the code with a `TODO(scale)` comment so the next person knows there's a fork road ahead.

---

## 3. CSRF, Origin, and the request-edge posture

### 3.1 `checkOrigin` is called by hand in every mutating handler

Each handler does:

```ts
const originError = checkOrigin(req);
if (originError) return originError;
```

Count of places this is repeated: 7+ (articles POST/PATCH, sources POST/DELETE, digest preferences PATCH, auto-archive PATCH, pocket import POST, annotations POST/PATCH/DELETE). The first handler that forgets this call is CSRF-vulnerable in exactly the way the framework tried to prevent.

**Move it to the middleware.** For any mutating method (POST/PATCH/PUT/DELETE) under `/api`, the middleware should short-circuit on origin failure. That's the single-source-of-truth fix for §1.1 too.

```ts
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
if (MUTATING.has(req.method) && req.nextUrl.pathname.startsWith("/api/")) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
}
```

### 3.2 `checkOrigin` trusts missing Origin headers

`src/lib/csrf.ts:70`:

```ts
// No Origin header → same-origin request (browsers omit it for same-origin)
if (!origin) return null;
```

The comment is outdated. **Modern browsers send `Origin` on cross-origin AND same-origin non-GET requests.** Firefox has historically been inconsistent, and older browsers differ. More importantly: non-browser clients (curl, Python, other extensions) may omit the header entirely, and this policy passes them through.

The real protection is Clerk's session cookie being `SameSite=lax`/`strict`, which stops cross-site form submits without Origin from carrying the session. So this isn't a gaping hole — but the comment gives a _wrong reason_ for why it's safe, which is how bugs sneak in when someone relaxes one end without realising the other end was load-bearing.

**Suggested rewrite:**

```ts
// A missing Origin header alone isn't a CSRF signal — we rely on the
// session cookie being SameSite=lax to block cross-site requests from
// carrying auth. `checkOrigin` is belt-and-braces for the case where the
// browser does send Origin and it's the wrong one.
if (!origin) return null;
```

### 3.3 Extension allowlist policy is subtle but correct

`src/lib/csrf.ts:74-91` — I like this logic. The "if we're not in local dev, require an allowlist, and a failed match is a hard 403" posture is exactly right. One nitpick: the `console.info("[csrf] allowed extension origin ...")` log fires on every single dev request from any unpacked extension. At dev-run scale that's noise. Drop it to `console.debug` or gate it on a `DEBUG_CSRF` env var.

### 3.4 GET routes that mutate state

`src/app/api/digest/unsubscribe/route.ts` accepts GET and POST. GET with side effects is, in general, an anti-pattern: browsers prefetch, email clients preview, monitoring services warm links. The HMAC token gates the action, so it's not _unsafe_ — but:

- Gmail's "security scanners" frequently follow one-click-unsubscribe URLs, which can unsubscribe users _before they click_. This is a known Gmail pain point (search "Gmail preview unsubscribe"). Some setups require POST-only.
- RFC 8058 (List-Unsubscribe-Post) is the proper mechanism; you've implemented it. But the GET fallback is the one most scanners will hit.

Not a blocker — this is how most services still do it — but worth a comment noting the tradeoff and considering a confirmation page for GET.

---

## 4. Cron auth, webhook auth, and secret sprawl

### 4.1 `CRON_SECRET` is overloaded

Two distinct, unrelated uses of the same secret:

1. `src/lib/cron-auth.ts:13` — bearer auth for Vercel Cron hitting `/api/digest/send` and `/api/auto-archive/run`.
2. `src/lib/digest.ts:111` — HMAC key for signing one-click unsubscribe tokens.

**This is a classic secret-sprawl smell.** Rotating `CRON_SECRET` would silently invalidate every outstanding unsubscribe link in every email in every inbox. The blast radius of rotation is now "all email links" — which means rotation won't happen, even when it should.

**Fix:** one env var per purpose. `DIGEST_UNSUBSCRIBE_SECRET` separate from `CRON_SECRET`. The code change is a one-line swap; the operational win is that rotating one doesn't break the other.

**Teaching point.** "Same shape" (both 32-byte random strings) is not "same purpose." Secrets should be named and separated by the invariant they protect, not by their byte length. Storing a password-hash pepper and an API signing key in one env var is the same anti-pattern.

### 4.2 Unsubscribe tokens never expire

`generateUnsubscribeToken(userId)` is purely a function of userId + secret. No timestamp, no nonce, no binding to the email it was embedded in. A token leaked (say, a forwarded email hitting an internal archive) works forever, and the only way to revoke is secret rotation — which per §4.1 isn't really possible.

For a reader app with 1 user this is theatre; at scale it's a real concern. The canonical shape is `HMAC(secret, userId + ":" + issuedAtEpoch)`, with a verify step that rejects tokens older than (say) 90 days and rejects tokens issued for an email the user no longer owns.

### 4.3 Webhook signature verification is fine; the handler is thin

`src/lib/clerk-webhook.ts` is defensively written — signature verify first, then type-narrow, then act. Good. Two notes:

1. **Only `user.deleted` is handled.** That's the only event the PRD calls for. Fine. But the switch statement is implicit (single `if`); add an explicit `default: console.info(...)` branch so we can see when Clerk starts sending events we don't handle, instead of silently 200-ing them.
2. **No replay protection explicitly tested.** Svix handles replay windows internally, but there's no test that locks that behaviour in for our integration. A `svix.verify` call with a stale timestamp should throw — assert that in `clerk-webhook.test.ts`.

### 4.4 `deleteAllUserData` is not atomic

```ts
async function clearVolume(name: string): Promise<void> {
  const vol = getFolio().volume(name);
  const pages = await vol.list();
  for (const page of pages) {
    await vol.delete(page.slug);
  }
}
```

If this times out mid-loop (Vercel function limit, network blip, Folio error on one page), the user is _partially_ deleted. The webhook returns a 5xx, Svix retries, we re-enter and finish. Good.

But: **`clearVolume` has no try/catch around the inner `vol.delete`.** A single page failing to delete — for _any_ reason — aborts the whole loop and leaves a mix of deleted/kept data across _other_ volumes. The registry-volume delete in the next block has a `try/catch` that _swallows_ errors, which is the opposite problem: a persistent delete failure is silently accepted.

**Fix:** wrap each delete in a try/catch with logging; continue through siblings; rethrow at the end only if any failed. GDPR compliance is "we tried and succeeded"; "we tried and crashed halfway" needs to be visibly different from "we succeeded."

### 4.5 No reconciliation for missed webhooks

If the webhook endpoint is down for 24 hours (Vercel outage, cert issue), Clerk gives up eventually. We have no fallback: no "nightly job that compares Clerk's user list to Folio's volumes and reconciles deletions." That's a GDPR finding waiting to happen. Acceptable risk for 0 users; unacceptable at 1k.

---

## 5. Rate limiting — the in-process assumption

### 5.1 Singletons bake "one instance" into the design

```ts
export const articleIngestLimiter = new RateLimiter({
  capacity: 10,
  refillRate: 1,
});
```

Exported as a module singleton. On Vercel's serverless runtime, each function instance has its own Map. Ten concurrent instances handling one user's burst → 10 × 10 = 100 saves in the nominal 10-save budget. The comment at `src/lib/rate-limit.ts:8-10` and CLAUDE.md both acknowledge this — so the team _knows_ — but the knowledge is buried in comments and the code reads as if rate limiting is real.

**Immediate fix (no infra change):** rename these to something that signals the lie: `articleIngestSoftLimiter`, or at least add a JSDoc that a reviewer reading the call-site will see, not a comment in the file where the limiter is declared.

**Proper fix (when scale requires):** Upstash Redis / Vercel KV rate limiter. It's a 50-line migration. Track in an issue.

### 5.2 The sweeper has a weird lifecycle

`ensureSweep` starts a `setInterval` on first `consume`. On process exit, `.unref()` lets the process die. OK. But:

1. Once the map is emptied, the sweep timer clears itself (`clearInterval`, `sweepTimer = null`). The next `consume` creates a new timer. Fine in production (long-lived process), churny in tests.
2. Multiple limiter instances each have their own sweep timer. Four limiters = four timers. None of them coordinate.
3. Under HMR in `next dev`, module re-evaluation leaks the old limiter's timer _and_ its bucket map. Not worth fixing, but worth _knowing_ — if a dev sees "request count is weird in dev," this is why.

### 5.3 No rate limit on the webhook or health endpoint

`/api/webhooks/clerk` and `/api/health` are unauthenticated. If someone floods them, they cost CPU (Svix signature verify; Folio health probe with its own IO). Svix has retry protection and the payload is small; health does a real Folio scan. I'd rate-limit health by source IP — 10 req/min per IP is plenty for any legitimate uptime monitor.

### 5.4 Rate-limiter tests run against module singletons

Because the limiters are module constants, tests share them. If `article-api.test.ts` and `article-post.test.ts` both exhaust the bucket, ordering matters. That's fragile. Refactor to inject limiters through a DI seam — or at least add a `beforeEach` that calls `articleIngestLimiter.destroy()` then re-imports.

---

## 6. SSRF and outbound fetch — edge cases still unspotted

This is the strongest code in the repo. I'm going to be picky precisely _because_ it's strong — the 5% of risk that remains is the part worth naming out loud.

### 6.1 DNS TOCTOU / rebinding

```ts
await assertPublicHost(current.hostname);  // resolves and validates
let res = await fetch(current, { ... });   // re-resolves
```

Between `dns.lookup()` and `fetch()`, DNS can return a different answer. A malicious authoritative server can return a public IP (TTL=0) to the first resolution and a private IP to the second. Node's `undici` (the fetch implementation) uses its own DNS path, not the `dns.lookup` result.

**This is a real SSRF bypass** for a determined attacker running an authoritative DNS server. The fix is to pin the resolved IP by using a custom `dispatcher`:

```ts
import { Agent } from "undici";
const agent = new Agent({
  connect: {
    lookup: (hostname, opts, cb) => {
      // Use the already-validated address, or re-resolve + re-validate.
    },
  },
});
fetch(url, { dispatcher: agent });
```

This is a known class of bug — cloudflare's [ssrf deep-dive](https://blog.cloudflare.com/ssrf-mitigations/) has a good writeup. Add an issue; it's not worth blocking on but it IS the next level of the hardening you've already done.

### 6.2 `MAX_REDIRECTS` isn't a time budget

Feed discovery does: attempt-1 (5 redirects max) + up to 5 candidates (5 redirects each) + up to 7 well-known paths (5 redirects each). Worst case: 13 × 5 = 65 fetches, each allowed `DISCOVERY_TIMEOUT_MS` (5s) = 325s. That's past any Vercel function budget.

The cumulative cap is "upper-bound how badly this can behave", not "will it succeed." Add a wall-clock budget across the whole `discoverFeed` call.

### 6.3 JSDOM is a CPU DoS vector

`MAX_USER_HTML_BYTES` (512 KB) is good for extension-submitted HTML. But the server-fetched path allows 5 MB via `MAX_BODY_BYTES`. JSDOM on 5 MB of pathological HTML (deeply nested tags, lots of comments) can spend seconds CPU-bound. Parsing is synchronous per request.

At the current rate limit (10 burst + 1/s), one motivated user can keep a Vercel function permanently saturated. Consider:

- Moving parsing off the request-response path (queue + worker).
- Or adding a `workerd`-style CPU budget (not trivial on Vercel, but `setTimeout`-based wall-clock guards work).

### 6.4 `isHtmlContentType` allows any HTML charset — decoder silently falls back

```ts
const charset = charsetFromContentType(contentType ?? null) ?? "utf-8";
try {
  const decoder = new TextDecoder(charset, { fatal: false });
  return decoder.decode(buf);
} catch {
  return buf.toString("utf8");
}
```

`{ fatal: false }` means invalid bytes are replaced with U+FFFD silently. That's fine for readability, terrible for diagnostics — if a site is serving gibberish and we're happily parsing it, we'll ingest nonsense. Log `decoder.encoding !== 'utf-8'` at info level so we can track which sites need charset-specific handling.

### 6.5 ReDoS surface on emphasis patterns

```ts
/(^|[^\w*])\*\*([^\s*][^*]*?[^\s*]|[^\s*])\*\*(?=[^\w*]|$)/g;
```

The lazy `[^*]*?` is bounded by the non-nested-quantifier rule — probably safe, but I didn't prove it. `EMPHASIS_PATTERNS` runs on attacker-controlled text nodes. Add a quick unit test with a pathological input (e.g. 100 KB of `*`s, alternating with word chars) and measure parse time. If it blows up, fall back to a simpler replace.

### 6.6 `redirect: "manual"` + re-assert per hop — good. But note

`fetchPublicResource` validates per hop, which is correct. What's missing: **the final `fetch` trusts the server to honour content-length / close the body.** If an attacker streams infinite data, `readBoundedBody` catches it (good). But the connection stays open until we cancel the reader — which we do in the `finally`. OK. Still: add an overall wall-clock timeout independent of read byte count, so a slowloris can't trickle bytes under the cap.

`AbortSignal.timeout(FETCH_TIMEOUT_MS)` is passed to `fetch`, which aborts the whole request — so the streaming case IS covered. Ignore this point; verified fine.

---

## 7. Data-layer concerns that cross into auth

### 7.1 Source IDs share the article ID regex

`src/app/api/sources/[id]/route.ts:20-22`:

```ts
if (!ARTICLE_ID_RE.test(id)) {
  return Response.json({ error: "Invalid source id" }, { status: 400 });
}
```

Article IDs and source IDs both happen to be 32 lowercase hex chars (sha256 truncated). So the regex passes. But this is **coupling by coincidence** — a future change to either derivation (say, article IDs widen to 40 hex) silently breaks the other's validation.

**Fix:** extract a shared `HEX32_ID = /^[a-f0-9]{32}$/` in a neutral module, and let both `articleIdForUrl` and `sourceIdForFeedUrl` advertise their output via a type. Or better, stop widening and narrowing by hand:

```ts
// lib/ids.ts
export const ID_PATTERN = /^[a-f0-9]{32}$/;
export function isValidId(s: string): boolean {
  return ID_PATTERN.test(s);
}
```

**Teaching point.** When two separate modules rely on the same magic constant but don't share it, you have a hidden coupling that review won't catch. Extract the constant to a shared place the moment you notice.

### 7.2 `articleFrontmatterSchema` fights zod's inference

```ts
export const articleFrontmatterSchema: z.ZodType<ArticleFrontmatter> = z.object(
  { ... }
) as unknown as z.ZodType<ArticleFrontmatter>;
```

The double `as unknown as` is a red flag. The root cause is the `[key: string]: unknown` index signature on `ArticleFrontmatter` — zod can't express that, so inference fails, and we paper over it.

Two better options:

1. **Drop the index signature.** If `ArticleFrontmatter` is a closed shape, don't let it leak "any other key is also allowed" — that defeats the schema's purpose.
2. **Let zod own the type.** `export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>` — now you can't drift.

The current approach lets schema and TS type diverge silently. The fact that `readProgress` has a `.nullable().default(null)` in the schema but `readProgress: number | null` in the type (no optional) means a new field with a default won't be required by TS even when the schema makes it so. Future-bug material.

### 7.3 `patchArticle` does a volume.get inside a setIfAbsent-style flow

`src/lib/articles.ts:585-597` — to decide whether to stamp `readAt` on cross-threshold progress, we do an extra `volume.get`. The retryOnConflict wrapper is outside this. If the concurrent writer lands _between_ the `.get` and the `.patch`, we either get a stale decision or a conflict. The comment says "ReadingProgress throttles" — fine, but this is subtle enough to deserve a test. Race-test it with two simulated concurrent progress updates.

### 7.4 `listArticles` loads the full library on every library render

`src/app/library/page.tsx:205-208`:

```ts
const [allArticles, highlightCounts] = await Promise.all([
  listArticles(userId, {}),
  getHighlightCounts(userId),
]);
```

Two full-volume scans per library render, on a `force-dynamic` route. At 1k articles this is fine; at 10k it's ~1-2s per render. The PRD punts on this; just be aware the fix will be a sore point. Projections or a secondary index on Folio are the upstream fix — tracked in `FOLIO-TRACKER.md`.

**Subtler issue:** Folio's `RuntimeListCache` is enabled only in production (`BLOB_READ_WRITE_TOKEN` gate in `src/lib/folio.ts:20-28`). That means **dev and tests use a very different cache posture than production**. Perf numbers from dev don't translate.

### 7.5 `revalidatePath` fires on every article mutation

`src/app/api/articles/[id]/route.ts:100-101`:

```ts
revalidatePath("/library");
revalidatePath(`/read/${id}`);
```

Every PATCH (including per-second scroll-progress throttled updates) fires two revalidations. On a single-user app, this is free; on a many-user app, per-user tagged revalidation via `revalidateTag` is correct. The paths are user-specific in rendering but shared-cache-keyed by URL — so this is actually doing _nothing useful_ for most caching, and _some_ redundant work in Next's router cache. Worth a look.

---

## 8. General approach — the stuff that'll hurt at scale

### 8.1 No CSP, no security headers

The app renders DOMPurify-sanitised markdown HTML, which includes attacker-influenced content (article body). DOMPurify is excellent, but it's a single line of defence. A Content-Security-Policy is the second line.

Minimum:

```
default-src 'self';
img-src * data:;
style-src 'self' 'unsafe-inline';   // SCSS modules are fine; no inline style for articles
script-src 'self' 'nonce-<per-request>';
frame-ancestors 'none';
```

The inline theme-init script at `src/app/layout.tsx:56` needs a nonce (Next.js 16 supports this via `unstable_noStore` + headers). Without CSP, an XSS in any user-influenced rendering is one `<script>` from a full account takeover.

Also missing:

- `Strict-Transport-Security` (Vercel sets HSTS on the edge by default, but verify)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer` (you set this via metadata on the page, but not as a header; headers are more reliable)
- `Permissions-Policy` (block geolocation, camera, etc. — the app doesn't use them)

**Configure via `next.config.ts`'s `async headers()`**. Ten-minute change, big defence-in-depth win.

### 8.2 `console.error` is the entire observability story

I didn't find a single structured log, request ID, latency histogram, error-rate meter, or health beacon beyond `/api/health`. For a pre-launch reading app this is fine; the day you have a weird bug you can't reproduce, you'll wish you'd added (at minimum):

- A `requestId` (pass through `x-request-id` or generate one in middleware).
- Consistent log prefix per module.
- Server-side error reporting (Sentry, Axiom, anything).

Vercel's built-in analytics isn't a substitute — it doesn't tell you _why_ something failed.

### 8.3 Swallowed errors

Multiple places use `.catch(() => {})`:

- `src/lib/sources.ts:222` — registry patch on feed error
- `src/app/api/sources/[id]/route.ts` — none (OK)
- `src/lib/user-deletion.ts:36-38` — registry delete (justified by "idempotent delete," OK)
- `src/app/api/import/pocket/route.ts` — none (OK)

Pattern check: the `sources.ts` swallow is the one that scares me. If the patch fails because Folio is down, we silently return without updating `lastError`. The user sees an "error" message but the persistent state never reflects it. At minimum: `.catch((err) => console.warn(...))`.

**Rule of thumb.** `catch {}` without a log is a future debugging nightmare. `catch (err) { log(err) }` takes one extra line and saves hours.

### 8.4 Read page rehydrates synchronously in the server component

`src/app/read/[id]/page.tsx:45-62` — if `article.pendingIngest` is true, we `await fetchAndParse(article.url)` in the server render. That's up to 15 s of TTFB for a Pocket-imported article on first click.

Much better UX: render the stub immediately, kick off rehydration in a background job (`after()` hook, or a `POST /api/articles/:id/rehydrate` call from the client), and poll / Suspense until it completes. This also lets you cache the stub render on the CDN.

### 8.5 `force-dynamic` + per-user auth on every render

`/library` and `/read/[id]` are `force-dynamic`, which disables all caching. The CLAUDE.md note says "don't introduce `'use cache'` without rethinking the auth model" — correct. But with Next 15+ `dynamicIO` and `cacheLife`, you can keyed-cache by user and get back 90% of the perf. Worth revisiting once the app has more users than the developer.

### 8.6 The extension's `optional_host_permissions: ["https://*/*"]`

`apps/extension/manifest.json:32` requests optional permission to **every HTTPS site.** This is a huge permission scope. Most users won't grant it; those who do are trusting the extension with every browsing session. The extension only needs it to extract `document.documentElement.outerHTML` from the active tab — which `activeTab` (already in the required permissions) covers _without_ granting host permissions.

**Review this before store submission.** Chrome Web Store reviewers will flag it. The correct scope is probably just `activeTab` + `scripting` + user-initiated (which you already have via the keyboard command and popup click).

### 8.7 No e2e smoke tests of the save flow

There's `playwright.prod-smoke.config.ts` and some e2e specs, but the canonical user journey — sign in → save an article via the extension → see it in the library — isn't covered. That's the product. Everything else is garnish.

### 8.8 Tests aren't written against the auth-boundary invariants

Per §1.3: the "every `src/lib/**` function takes `userId`" convention is a design contract. Lock it in with a lint rule:

```js
// .eslintrc / eslint flat config
{
  files: ["src/lib/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      { paths: [{ name: "@clerk/nextjs/server", message: "Auth must flow via userId param. Do not call auth() in lib/." }] }
    ]
  }
}
```

That's a structural enforcement of a CLAUDE.md convention. **Rules that live only in docs decay.**

---

## 9. What to keep doing (credit where due)

I've been harsh because the bar the codebase is already meeting is high. To be explicit about what's _good_:

- **`src/lib/ingest.ts` SSRF hardening.** IPv6 expansion, NAT64 handling, per-hop re-validation, bounded body, charset detection — this is the best piece of code in the repo and should be the reference for anything else the team builds that hits external URLs. Juniors: read this file twice.
- **`AuthedUserId` branded type.** Load-bearing in a way the TS compiler actually checks. Don't let it slip.
- **`SANITIZE_CONFIG` shared between server and client.** The PRD/CLAUDE.md call-out that the configs "can't drift" is exactly the right framing. Same pattern applies to auth, date formatting, ID validation — any policy where drift is a security issue.
- **Content-hash article IDs for dedup.** This is elegant. `setIfAbsent` + post-conflict re-read is the right idempotency shape.
- **Fail-closed storage in prod (`src/lib/folio.ts:45-49`).** "Throw on misconfig" beats "silently fall back to ephemeral disk" every single time.
- **Structured error separation (`IngestError.publicMessage` vs `message`).** Juniors often leak internal paths / host names in error responses. This pattern prevents it. Copy it anywhere else user-visible errors are generated.
- **`verifyCronBearer` uses `timingSafeEqual` with length equalisation.** That's the correct, paranoid shape. Most implementations I see in the wild get this subtly wrong.
- **Tests alongside implementation.** Every `lib/*.ts` file has a `.test.ts` sibling. Good discipline. The gap (per §1.3) is at the route-handler and middleware layer, not in lib/.

---

## 10. Recommended follow-ups, ranked

Ranked by **risk × ease of fix**. Not all of these are urgent; the ranking is what I'd tackle first as a new team member.

| #   | Item                                                                            | Risk          | Effort | §   |
| --- | ------------------------------------------------------------------------------- | ------------- | ------ | --- |
| 1   | Split `CRON_SECRET` into per-use secrets                                        | H             | XS     | 4.1 |
| 2   | Test unauthenticated access to each `/api/*` returns 401                        | M             | S      | 1.3 |
| 3   | Move `checkOrigin` into middleware for mutating methods                         | M             | S      | 3.1 |
| 4   | Add a CSP header + basic security-header bundle                                 | M             | S      | 8.1 |
| 5   | Remove extension's `optional_host_permissions: ["https://*/*"]`                 | M             | XS     | 8.6 |
| 6   | Extract shared `HEX32_ID` regex; remove `ARTICLE_ID_RE` misuse in sources route | L             | XS     | 7.1 |
| 7   | Add `SSRFTOCTOU` hardening via undici `dispatcher.lookup`                       | M             | M      | 6.1 |
| 8   | Split rehydration off the read-page render path                                 | L (UX)        | M      | 8.4 |
| 9   | Fix `deleteAllUserData` per-page error handling + logging                       | M (GDPR)      | S      | 4.4 |
| 10  | Drop the `as unknown as` schema casts; let zod infer the type                   | M             | S      | 7.2 |
| 11  | Add structured logging + request IDs                                            | L             | M      | 8.2 |
| 12  | Rename `proxy.ts` comment so it's greppable as "middleware"                     | L             | XS     | 2.1 |
| 13  | Move the dead `trpc` route out of the middleware matcher                        | L             | XS     | 2.2 |
| 14  | Replace per-process rate limiter with Upstash when traffic warrants             | scale         | M      | 5.1 |
| 15  | Reconciliation cron for missed Clerk deletions                                  | GDPR (future) | M      | 4.5 |

Risk key: **H** = known real-world exploit path / compliance risk / outage amplifier. **M** = plausible bug under normal use or scale. **L** = latent debt, hygiene, or scale-item.

Effort key: **XS** = under an hour. **S** = a half-day. **M** = a day or two.

---

## Closing thought for the team

The single highest-leverage habit to develop from this review: **treat invariants as things you test, not things you document.** Every bug I flagged in auth and CSRF exists because the invariant lives in a comment or a CLAUDE.md rule, and the compiler has no way to enforce it. A test for "unauthenticated GET /api/articles returns 401" is cheap insurance; a comment saying "remember to call `auth()` in every route" is expensive when someone forgets. The SSRF code in `ingest.ts` is great specifically because every invariant has a test anchoring it — the same discipline applied to the auth boundary would lift the whole codebase.

And for the reviewer's own sanity: start each PR by asking _"what would have to go wrong for this to become a security incident?"_ — if the answer is "someone would need to forget a line," that's a process smell, not a code problem. Fix the process, not just the line.

— End of review
