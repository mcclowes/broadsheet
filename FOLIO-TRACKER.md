# Folio upstream tracker

Issues, missing features, and API roughness in `folio-db-next` that should be
actioned upstream rather than worked around inline.

## Open

### `setIfAbsent` / conditional write primitive

`saveArticle` in `src/lib/articles.ts` uses a check-then-act pattern (`get` →
`set`) that isn't atomic. Two concurrent saves for the same URL can both see
the key as absent and both write, with the second silently overwriting the
first. A `setIfAbsent` (or `putIfAbsent`) method on `Volume` would let the
caller detect and handle conflicts.

**Impact:** Low in practice (both writes come from the same URL and produce
near-identical content), but prevents any future use of Folio for
compare-and-swap patterns.

**Opened:** 2026-04-12

### `Volume.destroy()` / bulk delete

`deleteAllUserData` in `src/lib/user-deletion.ts` has to `list()` + `delete()`
each page of every per-user volume to implement GDPR deletion. For users with
many articles this is O(n) round trips where one bulk "drop this volume"
operation could be O(1).

**Impact:** Correctness is fine (idempotent; safe to retry), but latency and
API-call cost scale linearly with saved articles. Worth a dedicated primitive
before we have users with thousands of saves.

**Opened:** 2026-04-12
