# Folio upstream tracker

Issues, missing features, and API roughness in `folio-db-next` that should be
actioned upstream rather than worked around inline.

## Open

### `VercelBlobAdapter.get()` sources the CAS etag from a cached CDN fetch — conditional `put` 412s forever

Every conditional write (`patch`, `set({ifMatch})`) on the Vercel Blob
adapter fails with `ConflictError` in production, so any article mutation
(archive, mark-read, tag, progress — all go through `Volume.patch` →
`adapter.put({ifMatch})`) returns a 409 to the client deterministically.

Root cause: `VercelBlobAdapter.get()` (`adapters/blob.js`) reads the etag
from `@vercel/blob`'s `get()`, which does a plain `fetch(blobUrl)` against
the Blob CDN *without* `useCache: false`. The HTTP `ETag` on that
cached/edge response is not guaranteed to equal the authoritative storage
etag that the Blob API validates the `x-if-match` header against
server-side (CDN caching/staleness, content-encoding suffixes beyond the
`-gzip` that `normalizeEtag` strips, weak validators). When they diverge,
`put({ifMatch})` → 412 → `ConflictError`. `Volume.patch`'s internal retries
and broadsheet's `retryOnConflict` both re-`get` the same cached etag, so
every attempt fails — the 409 is permanent, not transient contention.

Smoking gun: the adapter is internally inconsistent about where etags come
from. `put` (via `head()`), `list`, and `listKeys` all use the authoritative
Blob-API etag; only `get()` uses the CDN fetch etag. So a slug read via
`list` and one read via `get` can carry different etag strings for the same
object — and `patch` reads via `get`.

Fix (upstream, in folio's `VercelBlobAdapter.get`): source the etag for CAS
from an authoritative, uncached path — pass `useCache: false` to
`@vercel/blob`'s `get()`, or take the etag from `head(url, {token})` (the
adapter already calls `head` in `put` for `uploadedAt`), so the round-trip
`get().etag` → `put({ifMatch})` compares equal. The conformance suite passes
today only because it runs against in-process stores (memory/fs) with
immediate read-after-write and no CDN; add a live-blob conformance case that
writes, then reads via `get()`, then `put({ifMatch: get().etag})`.

**Opened:** 2026-06-09 · **Fix pushed:** mcclowes/folio#74 (awaiting
release + a `folio-db-next` bump here before archiving works in prod).

### Relax `Frontmatter = Record<string, unknown>` constraint

`Frontmatter` is exported as `Record<string, unknown>`. Consumer types have
to add `[key: string]: unknown` to satisfy the constraint, which defeats
zod's inferred shape — `z.object({...})`'s `ZodType<T>` no longer matches
the declared TS type, forcing every `volume<T>` call to use an `as unknown
as z.ZodType<T>` double-cast (`src/lib/articles.ts:107`,
`src/lib/sources.ts:32`, `src/lib/digest.ts:30`, `src/lib/annotations.ts:65`,
`src/lib/auto-archive.ts:64`).

Proposal: change Folio's constraint to `T extends object` (or drop the
constraint entirely and let storage adapters stringify arbitrary objects).
Call-sites can then use `z.infer<typeof schema>` as the source of truth and
the double-cast disappears.

**Opened:** 2026-04-20

### deleteVolume for user deletion

`deleteAllUserData` in `src/lib/user-deletion.ts` still walks each volume
page-by-page (`vol.list()` + `vol.delete(slug)`) instead of using the
`deleteVolume` primitive shipped in 0.2.0. On a user with thousands of
articles this burns round-trips and is a GDPR-latency concern. Needs a
call-site refactor to prefer `folio.deleteVolume(name)` with page-level
retry only as a fallback.

**Opened:** 2026-04-20

### zod 4 support

`folio-db-next`'s peer/runtime dep is pinned to `zod@^3.23.8`, and the
`Volume<T>` schema option types against `z.ZodType<T>`. Zod 4's `ZodType`
has a different internal shape (`$ZodTypeInternals`, different generic
arity), so passing a zod-4 schema into `getFolio().volume(name, { schema })`
fails typecheck and at runtime the two zod versions don't share a registry.

Blocks Dependabot PR #107 (zod 3.25.76 → 4.3.6). Keeping zod on 3.x in
broadsheet until folio-db-next ships a zod-4-compatible release.

**Opened:** 2026-04-16

## Resolved

### `setIfAbsent` / conditional write primitive — shipped 0.2.0

`Volume.setIfAbsent(slug, {frontmatter, body})` throws `ConflictError` when
the slug already exists; otherwise writes atomically. `saveArticle` and
`saveArticleStub` in `src/lib/articles.ts` now use it. The earlier
check-then-act race is gone.

**Opened:** 2026-04-12 · **Closed:** 2026-04-13 (folio-db-next@0.2.0)

### `Volume.destroy()` / bulk delete — shipped 0.2.0

`Volume.deleteAll()` and `folio.deleteVolume(name)` both use the new
`adapter.deleteByPrefix` primitive — O(1) round trips to the storage layer
regardless of article count. Note that cross-volume cascades (e.g. the
digest-registry alongside the per-user article volume) are still the
caller's responsibility; `deleteAllUserData` in `src/lib/user-deletion.ts`
should be updated to use `deleteVolume` but still has to walk the registries
itself.

**Opened:** 2026-04-12 · **Closed:** 2026-04-13 (folio-db-next@0.2.0)
