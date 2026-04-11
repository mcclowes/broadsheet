# Broadsheet — project instructions for Claude

Read-it-later app. Next.js 16 App Router + Clerk auth + Folio (`folio-db-next`) for article storage. Chrome extension in `apps/extension/` is the desktop save trigger.

## Before you start

- **`broadsheet-prd.md`** — product vision (partly aspirational, see the implementation-status note at the top).
- **`CODE_REVIEW.md`** — open findings on security, correctness, and architecture. Treat §1–§5 as pre-production blockers. The "Resolved since this review was written" block at the top lists what's already fixed.
- Run `npm run typecheck && npm test` after any change to `src/lib/**` or the API routes.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict
- Styling: **SCSS modules** (`*.module.scss`) — no Tailwind, no CSS-in-JS
- Testing: **Vitest** (`*.test.ts` alongside implementation)
- Auth: Clerk (`@clerk/nextjs`)
- Storage: `folio-db-next` with `VercelBlobAdapter` (prod) / `FsAdapter` (dev) / `MemoryAdapter` (tests)
- Ingestion: `@mozilla/readability` + `jsdom` + `turndown`
- Rendering: `marked` → `isomorphic-dompurify`
- Deploy: Vercel (git auto-deploys disabled — see `77243e9`; deploy via `vercel deploy` or the dashboard)

## Conventions specific to this repo

- **Auth boundary.** Every server function that touches user data takes `userId` as a parameter; the `/api/articles/**` route handlers are the only place `auth()` is called. Do not call `auth()` from `src/lib/**`.
- **Folio volume names.** Always go through `volumeNameForUser(userId)` in `src/lib/folio.ts`. Never construct a volume name by hand.
- **Article IDs.** Always derive via `articleIdForUrl(url)` in `src/lib/articles.ts` (sha256 of canonicalised URL, first 32 hex chars). Never use UUIDs or random IDs — dedup depends on idempotency.
- **URL canonicalisation.** `canonicalizeUrl` strips tracking params and normalises host/path. Tests in `src/lib/articles.test.ts` lock the tracking-param list — update them together.
- **Markdown rendering path.** HTML is only trusted after `renderMarkdown` in `src/lib/markdown.ts` (marked → DOMPurify). Never inject article HTML any other way. The DOMPurify config is deliberately strict — before loosening, read finding #8 in `CODE_REVIEW.md`.
- **Error messages.** `IngestError.publicMessage` is what reaches the client. The raw message may contain internal host info (see finding #13) — keep them separate.
- **`force-dynamic`** is used on `/library` and `/read/[id]` because both are auth-gated per-user. Don't introduce `'use cache'` or `cacheLife` on these routes without rethinking the auth model.

## Working style

- **TDD where possible.** New functions in `src/lib/**` should land with tests in the same PR. If you can't test it, say why.
- **GitHub issues for all non-trivial work.** Before implementing a feature or non-obvious fix, check existing issues and link the PR with "Fixes #N". New ideas → new issue, not a TODO comment.
- **Sentence case** in UI copy, commits, docs. Rarely title case.
- **Challenge the ask.** If a request seems over-engineered or the simpler path is cleaner, say so before implementing.
- **No new top-level docs** unless explicitly requested. This file and `README.md` are the only ones that should grow.

## What NOT to do

- Don't add Postgres, Supabase, or a separate backend service. The "split metadata into a relational DB" path is explicitly deferred (see the PRD §Data Storage). If you think that line needs to be crossed, open an issue first.
- Don't loosen the DOMPurify config without adding an XSS test for what you're trying to allow.
- Don't touch `src/lib/folio.ts`'s adapter-selection without updating `.env.example` and the `README.md` dev setup section.
- Don't remove `force-dynamic` from `/library` or `/read/[id]`.
- Don't add `any`, `as string`, or other type assertions without a runtime check or a comment explaining why it's safe.
- Don't commit `default.profraw`, `*.tsbuildinfo`, or `.broadsheet-data/` — all gitignored, keep it that way.

## Open pre-production blockers

From `CODE_REVIEW.md` (still open):

1. **SSRF** in `fetchAndParse` (§1) — no host allowlist, `redirect: "follow"`.
2. **No timeout / body-size cap** on the fetched upstream (§2).
3. **No rate limiting** on `POST /api/articles` (§3).
4. **FsAdapter silent fallback** in production (§5) — should fail closed when `NODE_ENV === "production" && !BLOB_READ_WRITE_TOKEN`.
5. **Error messages leak internal details** (§13).

If you're working near any of these, address them inline rather than growing the debt.
