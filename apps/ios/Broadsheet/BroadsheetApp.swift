import SwiftUI
import ClerkKit

@main
struct BroadsheetApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Clerk iOS SDK v1: static configure at app launch. No manual load().
        // The publishable key is safe to ship in the binary — it's the public
        // Clerk key, the same one the web app exposes via
        // `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
        Clerk.configure(publishableKey: ClerkKeys.publishableKey)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(Clerk.shared)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        Task {
                            // Refresh the shared-keychain JWT so the Share
                            // Extension has a fresh token to send.
                            await AuthTokenBridge.refresh()
                            // Drain any URLs the Share Extension couldn't
                            // save inline (e.g. token was stale).
                            await PendingSaveDrainer.drain()
                        }
                    }
                }
        }
    }
}

/// Clerk publishable key. Pulled from the Info.plist via an `.xcconfig`
/// (recommended) so the key stays out of source. If the key is missing
/// the app falls back to a placeholder that will fail loudly at sign-in.
enum ClerkKeys {
    static let publishableKey: String = {
        if let key = Bundle.main.object(forInfoDictionaryKey: "CLERK_PUBLISHABLE_KEY") as? String,
           !key.isEmpty {
            return key
        }
        return "pk_test_REPLACE_ME"
    }()
}
