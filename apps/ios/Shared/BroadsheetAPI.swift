import Foundation

/// Minimal client for the Broadsheet Next.js API.
///
/// Used by both the main app (which sets a fresh Clerk JWT before each call)
/// and the Share Extension (which reads the most recent JWT from the shared
/// keychain).
struct BroadsheetAPI {
    let baseURL: URL
    let token: String?

    enum APIError: LocalizedError {
        case notSignedIn
        case server(status: Int, message: String)
        case transport(Error)
        case decoding(Error)

        var errorDescription: String? {
            switch self {
            case .notSignedIn:
                return "Not signed in — open Broadsheet and sign in first."
            case .server(_, let message):
                return message
            case .transport(let error):
                return error.localizedDescription
            case .decoding:
                return "Unexpected response from Broadsheet."
            }
        }
    }

    struct SaveResponse: Decodable {
        let article: ArticleSummary
    }

    struct ListResponse: Decodable {
        let articles: [ArticleSummary]
    }

    struct FullArticleResponse: Decodable {
        let article: FullArticle
    }

    /// GET /api/articles/:id — fetch a single article with its Markdown body.
    func get(id: String) async throws -> FullArticle {
        let response: FullArticleResponse = try await request(
            path: "/api/articles/\(id)",
            method: "GET"
        )
        return response.article
    }

    /// POST /api/articles — save a URL.
    func save(url: String) async throws -> ArticleSummary {
        let response: SaveResponse = try await request(
            path: "/api/articles",
            method: "POST",
            body: ["url": url]
        )
        return response.article
    }

    /// GET /api/articles — list the current user's library.
    func list() async throws -> [ArticleSummary] {
        let response: ListResponse = try await request(path: "/api/articles", method: "GET")
        return response.articles
    }

    /// PATCH /api/articles/:id — mark read / archive / set tags.
    func patch(id: String, read: Bool? = nil, archived: Bool? = nil, tags: [String]? = nil) async throws {
        var body: [String: Any] = [:]
        if let read { body["read"] = read }
        if let archived { body["archived"] = archived }
        if let tags { body["tags"] = tags }
        let _: EmptyResponse = try await request(
            path: "/api/articles/\(id)",
            method: "PATCH",
            body: body
        )
    }

    // MARK: - Plumbing

    private struct EmptyResponse: Decodable {}

    private func request<T: Decodable>(
        path: String,
        method: String,
        body: [String: Any]? = nil
    ) async throws -> T {
        guard let token, !token.isEmpty else { throw APIError.notSignedIn }

        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.server(status: 0, message: "No HTTP response")
        }

        if http.statusCode == 401 {
            throw APIError.notSignedIn
        }

        if !(200..<300).contains(http.statusCode) {
            let message = errorMessage(from: data) ?? "Request failed (\(http.statusCode))"
            throw APIError.server(status: http.statusCode, message: message)
        }

        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }

        do {
            return try JSONDecoder.broadsheet.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func errorMessage(from data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json["error"] as? String
    }
}

/// Response shape shared with the web app's `ArticleSummary`.
struct ArticleSummary: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let title: String
    let url: String
    let source: String?
    let byline: String?
    let excerpt: String?
    let wordCount: Int
    let readMinutes: Int
    let savedAt: String
    let readAt: String?
    let archivedAt: String?
    let tags: [String]
}

/// Full article including the Markdown body, returned by `GET /api/articles/:id`.
struct FullArticle: Decodable {
    let id: String
    let title: String
    let url: String
    let source: String?
    let byline: String?
    let excerpt: String?
    let wordCount: Int
    let readMinutes: Int
    let savedAt: String
    let readAt: String?
    let archivedAt: String?
    let tags: [String]
    let body: String

    var summary: ArticleSummary {
        ArticleSummary(
            id: id, title: title, url: url, source: source,
            byline: byline, excerpt: excerpt, wordCount: wordCount,
            readMinutes: readMinutes, savedAt: savedAt, readAt: readAt,
            archivedAt: archivedAt, tags: tags
        )
    }
}
