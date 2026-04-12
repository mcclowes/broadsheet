# Folio improvements — what would make it load-bearing for Broadsheet

Where Folio falls short today, what it should grow into, and what supplementary tooling around it would let Broadsheet commit to Folio long-term instead of outgrowing it.

---

## 1. Frontmatter-only listing (the biggest gap)

**Problem:** `volume.list()` returns full `Page<T>[]` — every page's frontmatter _and_ body. Broadsheet's `/library` calls this on every page load to show titles, sources, and read times. It never needs the body. For a user with 500 saved articles, that's 500 blob reads fetching markdown bodies that are immediately discarded.

**What Folio should do:**

- `volume.list({ fields: 'frontmatter' })` or a dedicated `volume.listFrontmatter()` that returns `Array<{ slug, frontmatter, etag, updatedAt }>` without the body.
- At the adapter level this means either (a) storing frontmatter and body as separate blobs so they can be fetched independently, or (b) maintaining a per-volume manifest/index blob that caches all frontmatter and is updated on every write.

Option (b) — a manifest — is the better fit. It's one blob read per `list()` instead of N. It also unlocks pagination and count without scanning.

**Broadsheet impact:** `/library` goes from O(n) blob reads to O(1). This is the single change that makes "don't add Postgres" a defensible long-term position.

---

## 2. Pagination on `list()` and `query()`

**Problem:** `query()` already accepts `limit` and `offset`, but it applies them in-memory after loading all pages via `list()`. At scale this is just `list()` with extra steps.

**What Folio should do:**

If a manifest exists (see above), `query()` can filter and paginate over the manifest without loading page bodies. `list()` should accept `{ limit, offset, orderBy, order }` directly:

```ts
const page1 = await volume.list({
  orderBy: "savedAt",
  order: "desc",
  limit: 20,
});
const page2 = await volume.list({
  orderBy: "savedAt",
  order: "desc",
  limit: 20,
  offset: 20,
});
```

A cursor-based API (`after: slug`) is even better for real-time lists where items shift between pages, but offset is fine for v1.

**Broadsheet impact:** library loads are bounded. Infinite scroll or paginated views become possible without loading every article.

---

## 3. Volume-level stats

**Problem:** Broadsheet has no way to show "247 articles saved" without calling `list()` and counting. No way to show "12 unread" without loading all frontmatter and filtering.

**What Folio should do:**

```ts
const stats = await volume.stats();
// { count: 247, sizeBytes: 14_200_000, updatedAt: Date }
```

If Folio maintains a manifest (improvement #1), `count` is free. `sizeBytes` is a nice-to-have for quota management.

For filtered counts (`volume.count({ where: { readAt: null } })`), the manifest approach makes this cheap too.

---

## 4. Bulk volume deletion

**Problem:** GDPR user deletion (called out in CODE_REVIEW.md #18) requires deleting every page in a user's volume. Today that means `list()` → loop `delete()` one by one. No atomic "drop this volume" operation.

**What Folio should do:**

```ts
await volume.deleteAll(); // or folio.deleteVolume('user-abc123')
```

At the adapter level, `VercelBlobAdapter` should support `deleteByPrefix(prefix)`. Vercel Blob's `del()` accepts multiple URLs, and `list()` supports prefix filtering — combine them for a batched delete.

**Broadsheet impact:** Clerk webhook → `folio.deleteVolume(volumeNameForUser(userId))` becomes a one-liner instead of a fragile loop.

---

## 5. Make search work in serverless

**Problem:** Folio has Orama-backed full-text search (`volume.search()`), and Broadsheet lists search as unbuilt MVP scope. But the current implementation stores the Orama index in a blob and loads it into memory. In serverless, this means:

- Cold start pays the full index deserialisation cost.
- Concurrent instances each hold their own copy — no shared state.
- Writes from instance A don't appear in instance B's index until B reloads.

For a personal read-it-later app with one user per volume and infrequent writes, this might actually be fine — but the cold start cost scales with article count and could get painful.

**What Folio should do:**

- **Lazy index loading:** don't deserialise the index until `search()` is first called. Most requests are list/get — don't pay the search tax on those.
- **Index size budget:** expose `volume.searchIndexSize()` so the app can make decisions (e.g., skip indexing article bodies over 10k words, or warn when the index exceeds a threshold).
- **Background reindex webhook/callback:** after a write, emit an event that an external system (Vercel Queue, cron) can use to rebuild the index outside the request path. The `onIndexError` hook is a start — extend it to `onIndexStale` or similar.

**Broadsheet impact:** full-text search becomes shippable without a separate search service. For a personal tool with hundreds (not millions) of articles per user, Orama-in-a-blob is actually fine if the loading is lazy and the cold path is acceptable.

---

## 6. Derived/cached fields alongside the source page

**Problem:** Broadsheet converts markdown → HTML → DOMPurify on every `/read/[id]` request. CODE_REVIEW.md #4 and #10 both flag this. The rendered HTML is a pure function of the body — it should be computed once at save time.

**What Folio should do:**

Support derived fields — data computed from the page content that's stored alongside it but isn't part of the source of truth:

```ts
const articles = folio.volume("articles", {
  schema: articleFrontmatterSchema,
  derived: {
    renderedHtml: (page) => renderMarkdown(page.body),
  },
});

const page = await articles.get(id);
page.derived.renderedHtml; // pre-computed, cached in blob
```

On `set()` and `patch()` where the body changes, derived fields are recomputed. On `get()`, they're returned from storage without recomputation.

**Simpler alternative:** just support a `meta` blob per page — an opaque JSON sidecar that the app can read/write independently of the page content. Less magical, more flexible.

```ts
await volume.setMeta(slug, { renderedHtml: "..." });
const meta = await volume.getMeta(slug);
```

**Broadsheet impact:** `/read/[id]` becomes a single blob read (page + pre-rendered HTML) instead of read + parse + sanitise. Eliminates the `marked` + DOMPurify hot path.

---

## 7. Write hooks / event system

**Problem:** several Broadsheet needs are "do something after an article is saved" — update a search index, recompute derived HTML, notify the client, update stats. Currently all of this has to be orchestrated by the caller.

**What Folio should do:**

```ts
const articles = folio.volume("articles", {
  schema: articleFrontmatterSchema,
  hooks: {
    afterSet: async (page) => {
      /* reindex, compute derived, etc. */
    },
    afterPatch: async (page) => {
      /* ... */
    },
    afterDelete: async (slug) => {
      /* ... */
    },
  },
});
```

Keep it simple — synchronous hooks that run after the write succeeds. Not a pub/sub system, not durable events. Just callbacks. The caller can make them async if they want fire-and-forget (like the existing `onIndexError` pattern).

**Broadsheet impact:** the save pipeline becomes `volume.set()` and hooks handle the rest. Search indexing, rendered-HTML caching, and future features (notifications, analytics events) all compose cleanly.

---

## 8. Asset storage (binary blobs alongside pages)

**Problem:** CODE_REVIEW.md #9 flags the privacy leak from remote images. The fix is to download images at save time and serve them from your own storage. But Folio only stores text (markdown) — there's no concept of binary assets attached to a page.

**What Folio should do:**

```ts
await volume.putAsset(slug, "hero.jpg", imageBuffer, {
  contentType: "image/jpeg",
});
const asset = await volume.getAsset(slug, "hero.jpg");
// { body: Buffer, contentType: 'image/jpeg', url: 'https://...' }
```

For the `VercelBlobAdapter`, this maps directly to Blob uploads with a prefix like `volumes/{name}/{slug}/_assets/{filename}`. The returned `url` can be a public Blob URL (for public blobs) or a signed URL.

At ingest time, Broadsheet rewrites `<img src="...">` to point at the stored asset URL. Articles become fully self-contained.

**Broadsheet impact:** offline reading, privacy, and resilience against link rot — three product-level wins from one Folio feature.

---

## 9. Adapter: `listByPrefix` with metadata-only mode

**Problem:** the `StorageAdapter.list(prefix)` interface returns `StoredObject[]` including the full `body` string. For the manifest and pagination improvements above to work efficiently, the adapter needs to support listing keys/metadata without fetching bodies.

**What the adapter contract should add:**

```ts
interface StorageAdapter {
  // existing
  list(prefix: string): Promise<StoredObject[]>;

  // new
  listKeys(
    prefix: string,
  ): Promise<Array<{ key: string; etag: string; updatedAt: Date }>>;
  deleteByPrefix(prefix: string): Promise<number>; // returns count deleted
}
```

`VercelBlobAdapter` can implement `listKeys` with Vercel Blob's `list()` (which returns metadata without bodies) and `deleteByPrefix` with batched `del()`.

---

## 10. `folio-migrate` CLI tool

**Problem:** the PRD acknowledges that Folio might not scale forever and the fallback is extracting metadata into Postgres. If that day comes, the migration needs to be scripted. Even short of that, moving between adapters (dev → prod, blob → blob with different prefix structure) needs tooling.

**What to build:**

A small CLI (`npx folio-migrate`) that:

- **Exports** a volume to a local directory of markdown files (the format is already markdown + frontmatter — this is just `list()` → write to disk).
- **Imports** a directory of markdown files into a volume.
- **Copies** between adapters (e.g., FsAdapter → VercelBlobAdapter).
- **Validates** all pages against a schema and reports invalid ones.
- **Reindexes** the search index for a volume.

This isn't Folio-core — it's a separate `folio-cli` or `folio-tools` package. But it makes the "committed to Folio" decision reversible, which is what makes it safe to commit.

**Broadsheet impact:** data portability. If Folio ever needs to be replaced, the export path is already built and tested.

---

## Summary: what this gets you

| Broadsheet problem                         | Folio improvement                   | Result                          |
| ------------------------------------------ | ----------------------------------- | ------------------------------- |
| `/library` O(n) blob reads                 | #1 Manifest + frontmatter-only list | O(1) list, no Postgres needed   |
| No pagination                              | #2 Paginated list/query             | Bounded page loads              |
| No article count without full scan         | #3 Volume stats                     | Cheap counts for UI             |
| GDPR user deletion is a loop               | #4 Bulk volume delete               | One-liner cleanup               |
| Search not shippable                       | #5 Lazy serverless-friendly search  | Ship search without Meilisearch |
| Re-render markdown on every read           | #6 Derived/cached fields            | Pre-computed HTML               |
| Save pipeline is caller-orchestrated       | #7 Write hooks                      | Composable post-write logic     |
| Privacy leak from remote images            | #8 Asset storage                    | Self-contained articles         |
| Adapter can't list without fetching bodies | #9 Metadata-only listing            | Unlocks #1, #2, #3              |
| No escape hatch if Folio outgrown          | #10 CLI migration tools             | Safe commitment                 |

**Priority order for Broadsheet specifically:** #1 and #9 first (they unblock everything), then #4 (GDPR blocker), then #5 (search is unbuilt MVP scope), then #6 and #7 (performance and composability), then #8 and #10 (product polish and safety net). #2 and #3 fall out naturally from #1.
