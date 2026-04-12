import Foundation
import ClerkKit

/// Bridges the Clerk session held by the main app into the shared keychain
/// so the Share Extension (a separate process) can read a recent JWT and
/// attach it to its `Authorization: Bearer …` header.
///
/// Clerk session tokens are short-lived by default. The Share Extension is
/// a best-effort path: if the stashed token has expired, the Share Extension
/// falls back to `PendingSaveQueue` and the main app drains the queue on next
/// foreground.
enum AuthTokenBridge {
    /// Pull a fresh JWT from Clerk and stash it in the shared keychain.
    static func refresh() async {
        guard let session = Clerk.shared.session else {
            SharedKeychain.remove(SharedKeychain.sessionTokenKey)
            return
        }

        do {
            if let token = try await session.getToken()?.jwt {
                SharedKeychain.set(token, for: SharedKeychain.sessionTokenKey)
            }
        } catch {
            // Network blip or token refresh failed. Leave whatever token is
            // already in the keychain — the Share Extension will still try it
            // and report 401 if expired.
        }
    }

    /// The current best-effort JWT. For use by the main app itself, which
    /// can always refresh directly from Clerk — but routing through the same
    /// keychain read keeps the code path consistent with the Share Extension.
    static var currentToken: String? {
        SharedKeychain.string(for: SharedKeychain.sessionTokenKey)
    }

    static func clear() {
        SharedKeychain.remove(SharedKeychain.sessionTokenKey)
    }
}
