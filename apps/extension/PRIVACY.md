# Broadsheet extension — privacy policy

_Last updated: 2026-04-11_

The Broadsheet Chrome extension saves the current browser tab to your
Broadsheet read-it-later library. It is a thin client for the Broadsheet web
app hosted at <https://broadsheet.marginalutility.dev> — all article storage,
authentication, and account data live there, not in the extension.

## What the extension accesses

When you click the toolbar icon, press the save shortcut, or click **Save
this tab** in the popup, the extension reads:

- The **URL** of the active tab.
- The **rendered HTML** of the active tab (`document.documentElement.outerHTML`), captured via `chrome.scripting.executeScript`. This lets Broadsheet save paywalled or client-rendered pages that the server couldn't otherwise fetch.

The extension also reads and writes a single **preference** in
`chrome.storage.sync`:

- `baseUrl` — the Broadsheet instance the extension should talk to. Defaults to the production URL; you can change it via the options page (for example, to point at a local dev server).

No other tab content, browsing history, form data, or telemetry is
collected.

## What the extension sends, and where

On save, the extension sends an HTTPS `POST` to
`${baseUrl}/api/articles` with a JSON body containing the URL and (when
available) the rendered HTML of the active tab. Authentication is handled by
the browser's existing cookie session with your Broadsheet account — the
extension does not store, read, or forward credentials itself.

The request is sent only to the configured Broadsheet instance. The
extension does not contact any third-party service, analytics provider, or
advertising network.

## What Broadsheet does with the data

Once the Broadsheet server receives the save request it parses the HTML
into a clean Markdown article and stores it in your per-user library. See
the Broadsheet web app's privacy policy for details on server-side
processing, storage, and retention.

## Permissions, explained

- `activeTab` + `scripting` — read the URL and rendered HTML of the tab you explicitly act on. Only triggered by a user gesture (click or keyboard shortcut).
- `storage` — persist the `baseUrl` preference across browser restarts.
- `notifications` — surface a toast when a save succeeds or fails.
- Host permission for `https://broadsheet.marginalutility.dev/*` — allows the extension to send the save request with your authenticated session cookie.
- Optional host permissions for `http://localhost/*`, `http://127.0.0.1/*`, and `https://*/*` — requested only if you point the extension at a non-default Broadsheet instance via the options page.

## Contact

Questions or concerns: open an issue at
<https://github.com/mcclowes/broadsheet/issues>.
