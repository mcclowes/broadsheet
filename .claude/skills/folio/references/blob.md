# Folio — Vercel Blob adapter

The blob adapter is the production path on Vercel. It's the intended target for any app where more than one instance will read/write the same volume.

## Setup

```ts
import { createFolio } from 'folio-db-next';
import { createBlobAdapter } from 'folio-db-next/adapters/blob';

const folio = createFolio({
  adapter: createBlobAdapter({
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    // optional: a per-environment prefix so prod and preview don't collide
    prefix: process.env.VERCEL_ENV === 'production' ? 'prod/' : 'preview/',
  }),
});
```

`@vercel/blob` is a **peer-optional** dep of `folio-db-next` — install it in the consuming app (not in the SDK) whenever you use this adapter:

```bash
pnpm add @vercel/blob
```

## Environment

- `BLOB_READ_WRITE_TOKEN` — auto-provisioned by the Vercel Blob integration. Pull it locally with `vercel env pull` (or `vercel:env` skill).
- In preview/prod, the token comes from the linked Blob store; no extra config needed.
- Reach for a **separate Blob store per environment** (prod vs preview vs dev) rather than prefix-partitioning one store — it makes wipe-and-reset safe.

## Semantics worth knowing

- **ETags**: Vercel Blob returns strong ETags. Folio maps these into the `ifMatch` / `ifNoneMatch` contract directly; CAS works as documented.
- **Eventual consistency on list**: blob `list()` can briefly lag a recent write. The conformance suite is written to tolerate this, and Folio's self-healing `reindex` covers the search index. When you need read-your-write semantics for a freshly-written slug, `get(slug)` directly — `list()` isn't guaranteed to see it immediately.
- **No true transactions**: multi-key atomicity does not exist. If you need "either both write or neither", model it as one document.
- **Costs scale with ops, not storage**: `list()` and `listKeys()` cost per 1k entries. Back high-traffic index pages with a `listCache` (Upstash Redis, Vercel Runtime Cache) — see the main SKILL for the list-cache pattern.

## Recommended companions on Vercel

- **Runtime Cache** (`vercel:runtime-cache` skill) for the `listCache` — tag-based invalidation pairs naturally with volume writes.
- **Fluid Compute** (the default) — Folio is plain Node.js, so no edge-runtime gymnastics needed.
- **Cron Jobs** to call `volume.reindex()` periodically if you see `index_update_failed` events under load. Not strictly required; the self-healing rebuild usually suffices.

## Gotchas

- Don't set `prefix` to something that starts with `/`. It's joined as a literal string prefix.
- Don't reuse one store across unrelated projects — `deleteByPrefix` makes it trivial to wipe a volume, and a shared store makes that riskier than it needs to be.
- If you see repeated `write_conflict` events on the same slug, that's a signal the callers are racing to patch the same document — consider modelling the contended field as its own volume or its own slug.
- Storing large binaries as Folio assets works (they're base64-wrapped, ~33% overhead). If you're routinely storing >1 MB binaries, put them in Blob directly and reference the URL from frontmatter instead.
