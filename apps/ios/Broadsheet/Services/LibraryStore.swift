import Foundation
import ClerkKit

/// Observable store for the library screen.
@Observable
@MainActor
final class LibraryStore {
    var articles: [ArticleSummary] = []
    var isLoading = false
    var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let token = try await Self.freshToken()
            let client = BroadsheetAPI(baseURL: BroadsheetConfig.baseURL, token: token)
            articles = try await client.list()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? error.localizedDescription
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
