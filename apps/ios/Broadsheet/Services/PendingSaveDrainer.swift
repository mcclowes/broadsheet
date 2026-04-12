import Foundation
import ClerkKit

/// Drains any URLs that the Share Extension couldn't save on first attempt,
/// using a fresh Clerk JWT minted in the main app.
enum PendingSaveDrainer {
    @MainActor
    static func drain() async {
        let items = PendingSaveQueue.load()
        guard !items.isEmpty else { return }

        guard let token = try? await Clerk.shared.session?.getToken()?.jwt else {
            // Not signed in — leave the queue alone.
            return
        }

        let client = BroadsheetAPI(baseURL: BroadsheetConfig.baseURL, token: token)
        var remaining: [PendingSave] = []
        for item in items {
            do {
                _ = try await client.save(url: item.url)
            } catch {
                var updated = item
                updated.lastError = (error as? LocalizedError)?.errorDescription
                    ?? error.localizedDescription
                remaining.append(updated)
            }
        }
        PendingSaveQueue.save(remaining)
    }
}
