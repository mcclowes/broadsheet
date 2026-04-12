import Foundation
import ClerkKit

/// Observable store for the library screen.
///
/// Wraps the remote API with a local offline cache so the library list and
/// previously-read article bodies are available without network access.
@Observable
@MainActor
final class LibraryStore {
    var articles: [ArticleSummary] = []
    var isLoading = false
    var errorMessage: String?
    /// `true` when the most recent `load()` fell back to the offline cache.
    var isOffline = false

    func load() async {
        isLoading = true
        errorMessage = nil
        isOffline = false
        defer { isLoading = false }

        do {
            let token = try await Self.freshToken()
            let client = BroadsheetAPI(baseURL: BroadsheetConfig.baseURL, token: token)
            let remote = try await client.list()
            articles = remote
            // Persist the index so we can serve it offline next time.
            await OfflineStore.shared.saveIndex(remote)
        } catch {
            // Network or auth failure — try the offline cache.
            let cached = await OfflineStore.shared.loadIndex()
            if !cached.isEmpty {
                articles = cached
                isOffline = true
            } else {
                errorMessage = (error as? LocalizedError)?.errorDescription
                    ?? error.localizedDescription
            }
        }
    }

    func save(url: String) async -> ArticleSummary? {
        do {
            let token = try await Self.freshToken()
            let client = BroadsheetAPI(baseURL: BroadsheetConfig.baseURL, token: token)
            let article = try await client.save(url: url)
            if !articles.contains(where: { $0.id == article.id }) {
                articles.insert(article, at: 0)
            }
            // Update the cached index with the new article.
            await OfflineStore.shared.saveIndex(articles)
            return article
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? error.localizedDescription
            return nil
        }
    }

    func markRead(_ article: ArticleSummary, read: Bool) async {
        do {
            let token = try await Self.freshToken()
            let client = BroadsheetAPI(baseURL: BroadsheetConfig.baseURL, token: token)
            try await client.patch(id: article.id, read: read)
            await load()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? error.localizedDescription
        }
    }

    /// Fetch the full article body. Returns from the offline cache when
    /// available, otherwise fetches from the server and caches the result.
    func fetchBody(for article: ArticleSummary) async -> String? {
        // Try offline cache first.
        if let cached = await OfflineStore.shared.loadBody(id: article.id) {
            return cached.body
        }

        // Fetch from server and cache.
        do {
            let token = try await Self.freshToken()
            let client = BroadsheetAPI(baseURL: BroadsheetConfig.baseURL, token: token)
            let full = try await client.get(id: article.id)
            let cached = CachedArticleBody(
                id: full.id,
                body: full.body,
                cachedAt: Date()
            )
            await OfflineStore.shared.saveBody(cached)
            return full.body
        } catch {
            return nil
        }
    }

    /// Ask Clerk for a fresh JWT directly (main app only). Also writes the
    /// token to the shared keychain so the Share Extension stays current.
    private static func freshToken() async throws -> String {
        if let token = try await Clerk.shared.session?.getToken()?.jwt {
            SharedKeychain.set(token, for: SharedKeychain.sessionTokenKey)
            return token
        }
        if let cached = AuthTokenBridge.currentToken { return cached }
        throw BroadsheetAPI.APIError.notSignedIn
    }
}
