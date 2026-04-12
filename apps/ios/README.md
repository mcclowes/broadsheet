# Broadsheet — iOS app

Native iOS client and share-sheet extension for Broadsheet. SwiftUI, iOS 17+.

The primary reason this app exists is the **share sheet**: the friction-free save path on mobile. Open any URL in Safari, Mail, Reeder, NetNewsWire, Slack, Messages, or anywhere with a share button → tap **Save to Broadsheet** → the URL is POSTed to `/api/articles` and the extension dismisses in under a second. Everything else (library, reader, settings) is there to support that flow.

## Architecture

Two Xcode targets inside one project:

| Target | Bundle ID | Role |
| --- | --- | --- |
| `Broadsheet` | `com.broadsheet.ios` | Main iOS app — sign-in, library, reader, settings. |
| `ShareExtension` | `com.broadsheet.ios.share` | App extension point `com.apple.share-services` — captures a shared URL and hands it to the API. |

The two targets communicate via:

- **App Group** (`group.com.broadsheet.ios`) — a shared container for `UserDefaults` (base URL, pending save queue file).
- **Shared Keychain** (`$(AppIdentifierPrefix)com.broadsheet.ios.shared`) — holds the most recent Clerk session JWT so the extension can call the API without going through Clerk again.

```
User taps "Save to Broadsheet" from the share sheet
           │
           ▼
  ShareViewController          ← ShareExtension target (separate process)
           │                     reads JWT from shared keychain
           ▼
  POST /api/articles            ← same Next.js route as the Chrome extension
           │
           ▼
 ┌─────────┴──────────┐
 │                    │
 success              failure (401, offline, rate-limited)
 │                    │
 dismiss              append to pending queue (App Group file)
                      │
                      ▼
           Main app foregrounds  → PendingSaveDrainer.drain() retries with a fresh JWT
```

### Why the pending queue?

Clerk session JWTs are short-lived (minutes). The share extension runs in a separate process and cannot refresh the Clerk session on its own. We solve this with a two-step fallback:

1. The main app, whenever it is foregrounded, mints a fresh JWT via `Clerk.shared.session?.getToken()` and writes it to the shared keychain (`AuthTokenBridge.refresh()`).
2. The share extension tries that JWT. If it works, great — the save is synchronous and the user sees a checkmark. If it fails (token expired, server blip, no network), the extension writes the URL into `PendingSaveQueue` — a JSON file in the App Group container — and dismisses.
3. Next time the main app foregrounds, `PendingSaveDrainer.drain()` retries every queued URL with a fresh token.

The user never loses a save, even if their session has rotated between app launches.

## Prerequisites

- **macOS** — Xcode 16 or later.
- **Apple Developer account** ($99/year). Required for: App Group entitlement, Shared Keychain entitlement, App Extensions, TestFlight, App Store.
- **XcodeGen** — `brew install xcodegen`. We commit `project.yml` rather than `project.pbxproj` so the source of truth is human-editable.
- **Clerk** — reuse the same Clerk application as the web app. You need the **publishable key** (`pk_live_…` or `pk_test_…`).

## First-time setup

```bash
cd apps/ios
xcodegen generate
open Broadsheet.xcodeproj
```

Then in Xcode:

1. Select the **Broadsheet** project in the navigator → **Signing & Capabilities** → set your **Team** on both `Broadsheet` and `ShareExtension` targets. XcodeGen will pick up any Team override you add to a `Local.xcconfig` (see below).
2. Confirm the **App Groups** capability lists `group.com.broadsheet.ios`. Click the refresh icon next to it to let Xcode register it in your developer portal.
3. Confirm the **Keychain Sharing** capability lists `com.broadsheet.ios.shared`.
4. Set the **Clerk publishable key**. Two options:
   - **Recommended:** create `Local.xcconfig` (gitignored — see `.gitignore`) with:
     ```
     CLERK_PUBLISHABLE_KEY = pk_test_your_key_here
     DEVELOPMENT_TEAM = YOUR_TEAM_ID
     ```
     and point the project base config at it (Project → Info → Configurations).
   - **Quick and dirty:** edit `Broadsheet/BroadsheetApp.swift` and hardcode the key in `ClerkKeys.publishableKey`. Don't commit that change.

5. Build & run on a physical device (share extensions work in the simulator, but share-sheet registration is flakier).

## Running against a local dev server

The share-sheet flow needs to reach your Next.js API. Three paths:

- **Production:** leave base URL as `https://broadsheet.app` (or whatever you deployed).
- **Local dev on the same Wi-Fi:** run `npm run dev` on your Mac, find your Mac's LAN IP (e.g. `192.168.1.42`), then in the iOS app Settings screen set the base URL to `http://192.168.1.42:3000`. You will need to tell iOS to trust plain HTTP — edit `Broadsheet/Info.plist` and add `NSAppTransportSecurity → NSAllowsArbitraryLoads = true` **for development only**. Do **not** ship this to the App Store.
- **Tunnel:** `ngrok http 3000` → paste the HTTPS URL in Settings.

## Testing the share extension

1. Build & run the **Broadsheet** scheme on a physical device. Sign in.
2. With the main app still installed, stop the run. Switch the active scheme to **ShareExtension** and run. Xcode will prompt you to pick a host app — choose **Safari**.
3. Safari launches. Navigate to any article. Tap the share icon. **Save to Broadsheet** should appear in the share sheet (first-time users may need to scroll to the end and tap `More` to toggle it on).
4. Tap it. You should see a loading spinner → green checkmark. The main app's library should contain the article.

### Debugging the extension

Share extensions are notoriously fiddly to debug:

- **`po`-style logs** show up in Console.app (filter by process name `ShareExtension`).
- If the extension simply doesn't appear in the share sheet:
  - Confirm `NSExtensionActivationRule` in `ShareExtension/Info.plist` allows URLs.
  - Force-quit Safari and launch it again.
  - Reinstall the app (uninstall first, reinstall — iOS caches extension registrations).
- If the extension appears but the main app can't read the token:
  - Check both targets have the **same App Group** in Signing & Capabilities.
  - Check both targets have the **same Keychain Sharing** group.
  - Check that `$(AppIdentifierPrefix)` resolves — both targets should share the same Team ID.

## Deploying

This repo does not automate App Store submission. The steps are:

1. **Set the version.** Bump `MARKETING_VERSION` in `project.yml` and regenerate (`xcodegen generate`). Bump `CURRENT_PROJECT_VERSION` for every TestFlight build.
2. **Archive.** In Xcode: **Product → Archive**. Both targets must be signed by the same team.
3. **Upload.** In the Organizer window that appears after archiving, click **Distribute App → App Store Connect → Upload**.
4. **TestFlight.** Wait a few minutes for App Store Connect to finish processing. Add internal testers in the TestFlight tab. They'll receive an invite to the TestFlight iOS app.
5. **App Store submission.** When you're ready, create a new version in App Store Connect, attach the build, fill in metadata (privacy nutrition label, screenshots, description), submit for review.

### App Store metadata checklist

- **Privacy nutrition label:** We collect a URL and send it to our server. Declare it as "Browsing History → App Functionality" with the Broadsheet account as the identity. We do not track across apps.
- **Age rating:** 17+ (unrestricted web access — articles can contain anything).
- **Screenshots:** library view, reader view, share-sheet success state. Use the Simulator's `xcrun simctl io booted screenshot` to capture.
- **Description:** cf. `broadsheet-prd.md §Mobile App` for copy that matches the product positioning.
- **Encryption declaration:** `ITSAppUsesNonExemptEncryption = false` is set in `project.yml` because we only use Apple-provided HTTPS.

## Files

```
apps/ios/
├── README.md                              # you are here
├── project.yml                            # XcodeGen spec — edit this, not project.pbxproj
├── Broadsheet/
│   ├── BroadsheetApp.swift                # @main — Clerk configure, scene-phase hooks
│   ├── RootView.swift                     # sign-in gate + tab bar
│   ├── Broadsheet.entitlements            # App Group + shared keychain
│   ├── Assets.xcassets/                   # app icon, accent colour
│   ├── Services/
│   │   ├── AuthTokenBridge.swift          # Clerk JWT → shared keychain
│   │   ├── LibraryStore.swift             # @Observable store for LibraryView
│   │   └── PendingSaveDrainer.swift       # drains share-extension queue on foreground
│   └── Views/
│       ├── SignInView.swift               # Clerk AuthView
│       ├── LibraryView.swift              # list + "add URL" sheet
│       ├── ReaderView.swift               # article detail
│       └── SettingsView.swift             # base URL, sign-out
├── ShareExtension/
│   ├── ShareExtension.entitlements
│   ├── ShareViewController.swift          # UIKit shell — extracts URL, hosts SwiftUI
│   └── ShareSheetView.swift               # SwiftUI body — saving / success / queued
└── Shared/                                # compiled into BOTH targets
    ├── BroadsheetConfig.swift             # App Group / keychain group constants, base URL
    ├── SharedKeychain.swift               # Security.framework wrapper
    ├── PendingSaveQueue.swift             # JSON file in App Group container
    └── BroadsheetAPI.swift                # URLSession client with Bearer auth
```

## Known limitations

- **No offline reader.** `ReaderView` displays the summary and links out to the original URL. The `GET /api/articles/:id` endpoint returns metadata only — a body endpoint is a follow-up. The storage layer already keeps the Markdown body, so this is a route-handler addition, not a schema change.
- **No full-text search.** Same shape as the web app — search is gated on the Folio-vs-Postgres decision in `broadsheet-prd.md`.
- **Share extension needs the main app to have been launched at least once** so a JWT has been written to the shared keychain. A first-run share will land in the pending queue and save on first main-app launch, which is acceptable but worth flagging.
- **Clerk iOS SDK pinned to `1.0.0+`.** v1 split the SDK into `ClerkKit` (core APIs) and `ClerkKitUI` (prebuilt views), dropped the manual `Clerk.shared.load()` step in favour of a static `Clerk.configure(publishableKey:)` at launch, and exposes the session via `@Environment(Clerk.self)`. Call sites in this project: `BroadsheetApp.init()` (configure), `RootView` (observe session), `AuthTokenBridge` / `LibraryStore` / `PendingSaveDrainer` (`Clerk.shared.session?.getToken()?.jwt`), `SignInView` (`AuthView()` from `ClerkKitUI`), `SettingsView` (`Clerk.shared.signOut()`). If a major version bump breaks these, update those six files.
- **No Android.** Per PRD, Android follows iOS.

## Troubleshooting

**Q: `xcodegen generate` fails with "no DEVELOPMENT_TEAM".**
Set `DEVELOPMENT_TEAM` in a local `Local.xcconfig` or directly in `project.yml` (don't commit your team ID to a public repo).

**Q: Share sheet shows "Save to Broadsheet" but tapping it does nothing.**
The extension process is crashing on launch. Attach the debugger (Scheme → ShareExtension → Run → pick Safari as host). Likely causes: App Group / keychain group entitlement typo, missing `NSExtensionPrincipalClass`, Clerk framework not embedded in the extension target (it shouldn't be — the extension calls the API directly without Clerk).

**Q: Saves work in the main app but the share extension always queues.**
The shared keychain read is returning `nil`. Common cause: the two targets have different Team IDs (check the `$(AppIdentifierPrefix)` prefix resolves), or the main app hasn't been launched yet in this install.

**Q: Clerk says "Invalid publishable key".**
You're using a `pk_test_` key with a `pk_live_` backend (or vice versa). The iOS app's key must match the web app's key — they point at the same Clerk instance.
