# Folio — filesystem adapter

The `fs` adapter is for local dev, CLI tools, tests that want real I/O, and any scenario where the data is meant to live in a git-tracked directory.

## Setup

```ts
import { createFolio } from 'folio-db-next';
import { createFsAdapter } from 'folio-db-next/adapters/fs';

const folio = createFolio({
  adapter: createFsAdapter({ root: './data' }),
});
```

`root` is resolved against `process.cwd()` if relative. The adapter creates directories on demand.

## On-disk layout

```
<root>/
  volumes/
    <volume-name>/
      <slug>.md                       # page: YAML frontmatter + body
      <slug>/_assets/<assetName>      # base64-wrapped binary asset envelope
  _index/<volume-name>.json           # persisted Orama index (opaque)
```

Because this is just markdown on disk, you can:

- Commit the whole thing to git for content that should version with the code.
- Edit pages by hand in an editor — Folio re-reads them on the next `get` / `list`.
- Use it as the source of truth for `folio` CLI commands (`list`, `show`, `search`, `reindex`, `doctor`).

## Semantics worth knowing

- **ETags**: derived from file mtime + size. Good enough for CAS on a single machine. **Do not** point multiple processes with independent writers at the same `root` over a network filesystem — it's not designed for that, and you'll see conflict storms.
- **Strong consistency**: unlike blob, `list()` immediately reflects writes. Useful for tests.
- **Watcher-friendly but not wired**: Folio doesn't ship a file watcher. If an external editor modifies a file, the next Folio read will pick it up; there's no push invalidation of `listCache`.
- **Deletes clean up empty directories**: `deleteByPrefix` removes files and then prunes empty parents up to `<root>/volumes/<name>/`.

## CLI usage

The `folio` CLI (`packages/folio-cli`) uses the fs adapter exclusively:

```bash
pnpm folio list posts --root ./data
pnpm folio show posts hello-world --root ./data
pnpm folio search "first post" --root ./data
pnpm folio reindex posts --root ./data
pnpm folio doctor --root ./data
```

`doctor` is the one to reach for when search results look stale or `listInvalid()` reports oddities.

## Test patterns

For unit tests, prefer the `memory` adapter — faster, no cleanup, no platform quirks. Use `fs` for:

- Conformance tests (already covered by `fs.test.ts`).
- Tests that exercise real filesystem edge cases (nested slugs, large listings).
- End-to-end tests against the CLI.

When using `fs` in tests, put `root` inside `os.tmpdir()` and clean up in `afterEach`.

## Gotchas

- Don't check the `_index/` directory into git — treat it as a cache. Add it to `.gitignore`. Folio regenerates it via `reindex()`.
- Case sensitivity differs between macOS (default case-insensitive) and Linux. Slugs are required to be lowercase anyway, which sidesteps most of the pain — but be careful about volume names that differ only in case.
- Don't symlink volumes across roots. Folio treats the root as the single source of truth and `deleteByPrefix` will happily follow symlinks if the OS allows it.
- If you're coming from blob and switching to fs locally, remember that fs is strongly consistent — bugs that only surface under blob's eventual-consistency window won't repro here. Run the conformance suite against both.
