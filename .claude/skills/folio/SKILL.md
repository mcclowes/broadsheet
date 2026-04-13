---
name: folio
description: Use Folio (folio-db-next) to persist data in Next.js apps as markdown files with YAML frontmatter, backed by a pluggable StorageAdapter (Vercel Blob, filesystem, HTTP, memory). Use whenever the user wants document-centric storage, a lightweight CMS-like layer, markdown-driven content, or asks about `createFolio`, `Volume`, "folio-db-*", "folio-next", or "the Desk". Also use when the user wants a git-friendly data layer, an alternative to a SQL/Mongo database for small-to-medium structured content, or needs to wire Vercel Blob into a Next.js app for content storage.
---

# Folio

Folio is a document-centric data layer: every entity is a markdown file with YAML frontmatter, every collection is a `Volume`, and persistence goes through a pluggable `StorageAdapter`. The SDK is `folio-db-next` (package dir `packages/folio-next`). Schemas are validated with `zod`; full-text search is built in via Orama.

## When to reach for Folio vs something else

- **Reach for it** when the data is naturally document-shaped (posts, recipes, configs, profiles), small-to-medium scale, and you want the content to be human-readable markdown on disk or in Blob.
- **Reach for something else** (Postgres/Neon, Upstash, etc.) when you need relational joins, high-throughput transactions, or strict multi-statement consistency. Folio gives you per-key CAS via ETags — not multi-key transactions.

Challenge the user if they reach for Folio for a workload it will handle badly (high write contention on a single key, cross-entity transactions, millions of rows).

## Core API shape

```ts
import { createFolio } from 'folio-db-next';
import { z } from 'zod';

const folio = createFolio({ adapter });

const posts = folio.volume('posts', {
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

await posts.set('hello-world', {
  frontmatter: { title: 'Hello', publishedAt: new Date(), tags: ['intro'] },
  body: '# Hello\n\nFirst post.',
});

const page = await posts.get('hello-world');       // Page<T> | null
const recent = await posts.list({ fields: 'frontmatter', orderBy: 'updatedAt', order: 'desc', limit: 20 });
const hits = await posts.search('first post');
await posts.patch('hello-world', { frontmatter: { tags: ['intro', 'meta'] } });
await posts.delete('hello-world');
```

Key rules to internalise before writing code:

- **Slugs**: match `/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/` — lowercase, may contain nested segments separated by `/`. No `..`, no backslashes.
- **Volume names**: `/^[a-z0-9][a-z0-9_-]*$/`.
- **Concurrency**: every write supports `{ ifMatch: etag }`. `patch` does its own optimistic retry loop (3 attempts with jittered backoff) unless you pass an explicit `ifMatch`. `setIfAbsent(slug, input)` is the atomic create primitive.
- **list shapes**: `list()` returns full `Page<T>[]`; `list({ fields: 'frontmatter', ... })` returns `FrontmatterEntry<T>[]` and is the one you want for index pages — it can be backed by a `listCache`.
- **Search**: Orama index, persisted to the adapter. If writes race the index, Folio self-heals via `reindex()` and emits an event; never throws after a successful page write.
- **Assets**: binary attachments via `putAsset/getAsset/listAssets/deleteAsset`. Stored base64-wrapped under `volumes/{name}/{slug}/_assets/{assetName}`. Cleared by `deleteAll()`.
- **ESM**: package is `"type": "module"`; relative imports inside the repo use `.js` extensions so `tsc` output resolves at runtime. Keep that convention when adding files.

## Picking an adapter

| Situation | Adapter | Read the reference |
| --- | --- | --- |
| Production on Vercel, shared across instances | `blob` | [references/blob.md](references/blob.md) |
| Local dev, CLI tools, tests against a real filesystem | `fs` | [references/fs.md](references/fs.md) |
| Unit tests, ephemeral scratch state | `memory` | (inline — `createMemoryAdapter()`, no config) |
| Talking to a remote `folio-db-server` | `http` | (inline — `createHttpAdapter({ baseUrl, token })`) |

If the user is mixing environments (blob in prod, fs in dev), pick the adapter per-environment inside `createFolio`'s setup code — don't try to swap at call sites.

## Writing code that the conformance suite still respects

Every adapter must pass `packages/folio-next/src/adapters/conformance.ts`. If you're implementing a new adapter or changing an existing one:

1. Run that suite (`pnpm --filter folio-db-next test` and check the adapter-specific tests).
2. Never bypass `StorageAdapter` from the desk, server, or CLI — all persistence flows through it so the conformance tests stay meaningful.
3. `delete` is unconditional and idempotent by contract — do not add `ifMatch`.

## Repo conventions (when working inside `mcclowes/folio`)

- pnpm workspace; directories are short (`folio-next`, `folio-cli`, `folio-server`, `folio-desk`) but published names are `folio-db-*`. The desk is private and never published.
- Dependency direction: `folio-desk` → `folio-db-next`; `folio-db-server` → `folio-db-next`; `folio-db-cli` → `folio-db-next`. Never reverse.
- Tests co-located with implementation (Vitest). TDD where practical.
- SCSS modules in the desk — not Tailwind.
- Sentence case in copy and commit messages.
- Don't add backwards-compat shims for pre-0.1 API; no external consumers yet.
- Don't hand-edit `packages/*/dist` — generated.
- Before committing, run `pnpm test` and `pnpm typecheck` for the packages you touched.

## Error types you'll actually see

- `NotFoundError` — `patch` on a missing slug; never thrown from `get` (returns `null` instead).
- `ConflictError` — `ifMatch` / `ifNoneMatch` mismatch, or `patch` retry exhaustion.
- `InvalidSlugError` / `InvalidVolumeNameError` / `InvalidAssetNameError` — always surface these as user input validation failures, not 500s.
- `FolioError` — base class; other errors (e.g. malformed asset envelope) extend it.

## Observability

`volume.health()` returns `{ adapter: 'ok'|'degraded', indexStale, listCacheAvailable, lastError? }`. Pass `onEvent` into `volume` options to stream structured events (`index_update_failed`, `write_conflict`, `list_cache_hit/miss`, `retry_exhausted`, `index_rebuild`, `list_cache_invalidate_failed`). Observability hooks that throw are swallowed — writes never fail because a hook threw.

## Next.js integration patterns

- **Server Components / Server Actions**: call `folio.volume(...).get/list/search` directly. Cache with Next.js 16 Cache Components (`use cache` + `cacheTag`) keyed on the volume + slug. Invalidate with `updateTag` after writes.
- **Route handlers**: fine for mutations; use `ifMatch` to reject stale PUTs from the client.
- **Don't** import `folio-db-next` into `'use client'` components — it's a server-only data layer.
- The dashboard package (`folio-desk`) is a reference implementation showing the wiring — see `lib/folio.ts` and `lib/volumes.ts`.
