# Broadsheet

A read-it-later app. Save articles from the web, parse them to Markdown at ingestion, read them cleanly later. Pocket, but rebuilt.

> **Status:** pre-production MVP. Web app + Chrome extension. See [`CODE_REVIEW.md`](./CODE_REVIEW.md) for the open blocker list before shipping to real users.

## Stack

- **Next.js 16** App Router, React 19, TypeScript strict
- **Clerk** for auth (`@clerk/nextjs`)
- **Folio** (`folio-db-next`) for article storage — per-user volumes, Markdown body + frontmatter metadata
  - Prod: `VercelBlobAdapter`
  - Dev: `FsAdapter` (`.broadsheet-data/`)
  - Tests: `MemoryAdapter`
- **Ingestion:** `@mozilla/readability` + `jsdom` + `turndown` (HTML → article → Markdown)
- **Rendering:** `marked` + `isomorphic-dompurify` (Markdown → sanitised HTML)
- **Styling:** SCSS modules
- **Testing:** Vitest
- **Deploy:** Vercel

## Repo layout

```
broadsheet/
├── src/
│   ├── app/
│   │   ├── api/articles/            # POST save, GET list
│   │   ├── api/articles/[id]/       # PATCH mark-read, archive, tags
│   │   ├── library/                 # library page + save form
│   │   ├── read/[id]/               # reader view
│   │   ├── sign-in/ sign-up/
│   │   └── layout.tsx / page.tsx
│   └── lib/
│       ├── articles.ts              # saveArticle, listArticles, canonicalizeUrl, markRead, setTags, setArchived
│       ├── ingest.ts                # fetchAndParse, parseArticleFromHtml, estimateReadMinutes
│       ├── folio.ts                 # getFolio, volumeNameForUser, adapter selection
│       ├── markdown.ts              # renderMarkdown (marked → DOMPurify)
│       └── *.test.ts
├── apps/extension/                  # Chrome MV3 save-current-tab extension
├── apps/ios/                        # iOS app + Share Extension (XcodeGen + SwiftUI)
├── broadsheet-prd.md                # product PRD (some sections aspirational)
├── CODE_REVIEW.md                   # open findings — read before shipping
└── CLAUDE.md                        # conventions for Claude Code
```

## Getting started

```bash
npm install
cp .env.example .env.local
# Fill in Clerk keys from https://dashboard.clerk.com
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

See `.env.example`. The non-obvious one is Folio's adapter selection (see `src/lib/folio.ts`):

| Setting                           | Behaviour                                         |
| --------------------------------- | ------------------------------------------------- |
| `BROADSHEET_FOLIO_ADAPTER=memory` | Ephemeral in-memory store — tests only            |
| `BLOB_READ_WRITE_TOKEN=...`       | Vercel Blob adapter — production                  |
| _(neither set)_                   | `FsAdapter` writing to `./.broadsheet-data` — dev |

Override the dev directory with `BROADSHEET_FS_DIR=/path/to/dir`.

### Chrome extension

The MV3 extension in `apps/extension/` saves the current tab to your
library. It defaults to the production URL; for local dev, change the base
URL to `http://localhost:3000` via the extension's options page.

```bash
npm run dev                 # in the repo root, for dev
npm run extension:package   # build dist/broadsheet-extension-<version>.zip
```

Load unpacked:

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `apps/extension/`.
3. Sign in to Broadsheet in the same profile (the extension uses cookie auth).
4. Click the toolbar icon or press `⌘⇧S` / `Ctrl+Shift+S` to save the current tab.

Releases are tagged `extension-vX.Y.Z`; the
`extension-release` workflow attaches a zip to the GitHub release ready for
Chrome Web Store upload. See [`apps/extension/README.md`](./apps/extension/README.md)
for the full publishing checklist.

### iOS app (dev)

```bash
brew install xcodegen                # one-time
cd apps/ios && xcodegen generate
open Broadsheet.xcodeproj
```

The app has two Xcode targets: `Broadsheet` (main SwiftUI app — library + reader + sign-in) and `ShareExtension` (share-sheet save target — the primary save path on mobile). Both are signed by the same Apple Developer team and share an App Group + shared keychain so the extension can use the main app's Clerk JWT.

Requires iOS 17+, Xcode 16+, Clerk iOS SDK v1.0+, and an Apple Developer account to install on a device. See [`apps/ios/README.md`](./apps/ios/README.md) for signing, local dev server setup, debugging, and TestFlight / App Store deployment.

## Scripts

```bash
npm run dev          # Next.js dev server
npm run build        # production build
npm run start        # run built app
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:watch   # vitest watch
```

A husky pre-commit hook runs `typecheck` + `lint`. GitHub Actions (`.github/workflows/ci.yml`) additionally runs `test`, `build`, and `npm audit --omit=dev --audit-level=high` on push and PR to `main`.

## How it works

1. **Save.** User POSTs a URL to `/api/articles` from the web app or Chrome extension. The route handler authenticates via Clerk, hands the URL to `fetchAndParse`, and persists the result via `saveArticle`.
2. **Ingest.** `fetchAndParse` fetches the page HTML, runs Mozilla Readability inside jsdom, and converts the cleaned article HTML to Markdown with Turndown.
3. **Store.** `saveArticle` canonicalises the URL (strips tracking params, normalises host/path), hashes it to derive a stable 32-char article ID, and writes `{ frontmatter, body }` into the user's per-user Folio volume. Re-saving the same URL is a no-op.
4. **Read.** `/library` lists the user's articles (with tag/source/state filters). `/read/[id]` loads the Markdown body, renders it with `marked`, and sanitises the result with DOMPurify before `dangerouslySetInnerHTML`.

## Deployment

Deploys go to Vercel. Git-triggered builds are currently **disabled** (see commit `77243e9`) — deploy manually:

```bash
vercel deploy            # preview
vercel deploy --prod     # production
```

## Contributing

See [`CLAUDE.md`](./CLAUDE.md) for conventions. In short:

- TDD where sensible; new `src/lib/**` code lands with tests.
- Open or reference a GitHub issue for non-trivial work; link PRs with `Fixes #N`.
- SCSS modules for styles; sentence case in UI and docs.
- Read `CODE_REVIEW.md` before working on ingestion, storage, or auth — it lists the open security and correctness findings.
