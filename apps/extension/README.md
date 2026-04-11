# Broadsheet — Chrome extension

Minimal save-current-tab extension. Manifest v3.

## Auth model

Cookie-based. The extension calls `POST {baseUrl}/api/articles` with `credentials: "include"`. Because `host_permissions` declares `http://localhost:3000/*` and `https://*/*`, Chrome attaches cookies from the target origin and bypasses CORS.

**You must be signed in to Broadsheet in the same browser profile.** If not, the API returns 401 and the extension surfaces "Not signed in — open Broadsheet and sign in first."

## Load unpacked

1. Run the web app: `npm run dev` (in repo root).
2. Open Chrome → `chrome://extensions`.
3. Toggle **Developer mode** (top right).
4. **Load unpacked** → select `apps/extension/`.
5. Pin the extension. Click the toolbar icon to save, or press **⌘⇧S** / **Ctrl+Shift+S**.
6. First run: click **Settings** in the popup and confirm the base URL (default `http://localhost:3000`).

## Files

- `manifest.json` — MV3, action, background service worker, host permissions, keyboard command.
- `background.js` — reads active tab URL, injects a content script to grab the rendered DOM, POSTs `{ url, html }` to `/api/articles`, surfaces a chrome notification.
- `popup.html` / `popup.js` — one-click save button + status.
- `options.html` / `options.js` — set Broadsheet base URL (production vs dev).

## Rendered DOM capture

The extension injects a one-liner via `chrome.scripting.executeScript` to read `document.documentElement.outerHTML` from the active tab and sends it as the `html` field. The server parses this directly with Readability, bypassing `fetchAndParse`. This means:

- Paywalled and auth-gated pages save whatever is rendered in the user's browser.
- Client-side-rendered pages (SPAs) are captured after hydration.
- No SSRF surface for this path — the server never fetches the URL when `html` is present.
- Restricted pages (chrome://, the web store, PDFs) can't be scripted; we fall back to URL-only and let the server try to fetch.
- Pages with rendered HTML over 4 MB fall back to URL-only.

## Icons

Not included. Add `icon16.png`, `icon48.png`, `icon128.png` if you want custom branding. Chrome will show a default puzzle-piece icon without them.

## Known limits

- No Firefox build. MV3 is compatible but manifest tweaks are needed (`background.scripts` vs `service_worker`).
