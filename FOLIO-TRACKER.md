# Folio upstream tracker

Issues, missing features, and API roughness in `folio-db-next` that should be
actioned upstream rather than worked around inline.

## Open

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
