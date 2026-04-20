# Broadsheet

Save articles from the web. Read them later, cleanly, without the clutter.

Broadsheet is an open-source read-it-later app — a modern alternative to Pocket. Save any article with one click from your browser, and it's parsed into clean, readable Markdown and stored in your personal library. No ads, no algorithmic feed, just your articles.

> **Status:** pre-production MVP. The web app is functional, and the [Chrome extension is published on the Chrome Web Store](https://chromewebstore.google.com/detail/broadsheet/joflmcpipjmffhgonneneafllkfppdld). See [Contributing](#contributing) if you want to help.

## Features

- **One-click save** — save any article from the Chrome extension or directly from the web app
- **Clean reading** — articles are stripped of ads, nav bars, and clutter, then rendered in a distraction-free reader
- **Keyboard shortcut** — press `Ctrl+Shift+S` (`Cmd+Shift+S` on Mac) to save the current tab instantly
- **Tagging** — organise saved articles with tags
- **Filters** — filter your library by tag, source, or read/unread/archived status
- **Deduplication** — saving the same article twice won't create duplicates
- **Estimated read time** — see how long each article will take before you start

## Getting started

### Web app

1. Go to your Broadsheet instance and sign up
2. Paste a URL into the save form on the library page, or use the Chrome extension
3. Open any saved article to read it

### Chrome extension

The extension adds a toolbar button and keyboard shortcut to save the page you're viewing.

1. Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/broadsheet/joflmcpipjmffhgonneneafllkfppdld) (or load it manually — see [development](#chrome-extension-1) below)
2. Sign in to Broadsheet in the same browser profile
3. Click the Broadsheet icon in your toolbar, or press `Ctrl+Shift+S` / `Cmd+Shift+S`
4. The article is saved to your library — open the web app to read it

---

## Development

### Prerequisites

- Node.js (LTS recommended)
- npm

### Setup

```bash
git clone https://github.com/mcclowes/broadsheet.git
cd broadsheet
npm install
cp .env.example .env.local
# Fill in Clerk keys from https://dashboard.clerk.com
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See `.env.example`. The key configuration is Folio's storage adapter (see `src/lib/folio.ts`):

| Setting                           | Behaviour                                         |
| --------------------------------- | ------------------------------------------------- |
| `BROADSHEET_FOLIO_ADAPTER=memory` | Ephemeral in-memory store — tests only            |
| `BLOB_READ_WRITE_TOKEN=...`       | Vercel Blob adapter — production                  |
| _(neither set)_                   | `FsAdapter` writing to `./.broadsheet-data` — dev |

Override the dev storage directory with `BROADSHEET_FS_DIR=/path/to/dir`.

### Scripts

```bash
npm run dev                   # Next.js dev server
npm run build                 # production build
npm run start                 # run built app
npm run lint                  # next lint
npm run typecheck             # tsc --noEmit
npm test                      # vitest run
npm run test:watch            # vitest watch
npm run test:e2e              # Playwright e2e against `next dev`
npm run test:e2e:prod-smoke   # Playwright auth-gated smoke against prod
```

A husky pre-commit hook runs `typecheck` + `lint`. GitHub Actions (`.github/workflows/ci.yml`) additionally runs `test`, `build`, and `npm audit` on push and PR to `main`.

### Uptime monitoring

`.github/workflows/prod-smoke.yml` runs the `e2e/prod-smoke.spec.ts` Playwright check every 15 minutes against the production deployment. It signs in as a dedicated Clerk test user and asserts `/library` still renders — catching the "auth broke and nobody noticed" failure mode. GitHub's default scheduled-workflow failure notification emails the repo owner when the job fails.

Secrets required (Settings → Secrets and variables → Actions):

| Secret                       | Source                                |
| ---------------------------- | ------------------------------------- |
| `PROD_CLERK_PUBLISHABLE_KEY` | Clerk dashboard (production instance) |
| `PROD_CLERK_SECRET_KEY`      | Clerk dashboard (production instance) |
| `PROD_SMOKE_USER_USERNAME`   | Email of the dedicated test user      |
| `PROD_SMOKE_USER_PASSWORD`   | Password of the dedicated test user   |

Optional repository variable `PROD_BASE_URL` overrides the default `https://broadsheet.app`.

To run the smoke check locally against prod:

```bash
E2E_BASE_URL=https://broadsheet.app \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_… \
CLERK_SECRET_KEY=sk_live_… \
E2E_CLERK_USER_USERNAME=max+test@mcclowes.com \
E2E_CLERK_USER_PASSWORD=… \
npm run test:e2e:prod-smoke
```

### Stack

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

### Repo layout

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
└── CLAUDE.md                        # conventions for Claude Code
```

### How it works

1. **Save.** User POSTs a URL to `/api/articles` from the web app or Chrome extension. The route handler authenticates via Clerk, hands the URL to `fetchAndParse`, and persists the result via `saveArticle`.
2. **Ingest.** `fetchAndParse` fetches the page HTML, runs Mozilla Readability inside jsdom, and converts the cleaned article HTML to Markdown with Turndown.
3. **Store.** `saveArticle` canonicalises the URL (strips tracking params, normalises host/path), hashes it to derive a stable 32-char article ID, and writes `{ frontmatter, body }` into the user's per-user Folio volume. Re-saving the same URL is a no-op.
4. **Read.** `/library` lists the user's articles (with tag/source/state filters). `/read/[id]` loads the Markdown body, renders it with `marked`, and sanitises the result with DOMPurify before display.

### Chrome extension

The MV3 extension in `apps/extension/` saves the current tab to your library. It defaults to the production URL; for local dev, change the base URL to `http://localhost:3000` via the extension's options page.

```bash
npm run dev                 # in the repo root, for dev
npm run extension:package   # build dist/broadsheet-extension-<version>.zip
```

Load unpacked for development:

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `apps/extension/`.
3. Sign in to Broadsheet in the same profile (the extension uses cookie auth).
4. Click the toolbar icon or press `Cmd+Shift+S` / `Ctrl+Shift+S` to save the current tab.

Releases are tagged `extension-vX.Y.Z`; the `extension-release` workflow attaches a zip to the GitHub release ready for Chrome Web Store upload. See [`apps/extension/README.md`](./apps/extension/README.md) for the full publishing checklist.

### iOS app (dev)

```bash
brew install xcodegen                # one-time
cd apps/ios && xcodegen generate
open Broadsheet.xcodeproj
```

The app has two Xcode targets: `Broadsheet` (main SwiftUI app — library + reader + sign-in) and `ShareExtension` (share-sheet save target — the primary save path on mobile). Both share an App Group + shared keychain so the extension can use the main app's Clerk JWT.

Requires iOS 17+, Xcode 16+, Clerk iOS SDK v1.0+, and an Apple Developer account to install on a device. See [`apps/ios/README.md`](./apps/ios/README.md) for details.

### Deployment

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
- Before touching ingestion, storage, or auth, read the "Hardening already in place" section of [`CLAUDE.md`](./CLAUDE.md) so you don't regress load-bearing invariants.
