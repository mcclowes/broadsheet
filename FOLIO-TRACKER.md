# Folio upstream tracker

Issues, missing features, and API roughness in `folio-db-next` that should be
actioned upstream rather than worked around inline.

## Open

_Nothing open — both tracked items shipped in `folio-db-next@0.2.0`._

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
