import Foundation

/// On-disk cache for articles so the app works without network access.
///
/// Layout inside the App Group container:
///   offline-articles/
///     index.json          — [CachedArticleSummary] for the library list
///     bodies/
///       <id>.json         — CachedArticleBody per article
///
/// Thread-safety: all mutations go through a serial actor so concurrent
/// reads/writes from the main app and background tasks don't corrupt state.
actor OfflineStore {
    static let shared = OfflineStore()

    private let fm = FileManager.default

    private var rootURL: URL? {
        fm.containerURL(forSecurityApplicationGroupIdentifier: BroadsheetConfig.appGroupIdentifier)?
            .appendingPathComponent("offline-articles", isDirectory: true)
    }

    private var indexURL: URL? { rootURL?.appendingPathComponent("index.json") }

    private var bodiesURL: URL? {
        rootURL?.appendingPathComponent("bodies", isDirectory: true)
    }

    private func bodyURL(for id: String) -> URL? {
        bodiesURL?.appendingPathComponent("\(id).json")
    }

    // MARK: - Bootstrap

    private func ensureDirectories() {
        guard let root = rootURL, let bodies = bodiesURL else { return }
        try? fm.createDirectory(at: root, withIntermediateDirectories: true)
        try? fm.createDirectory(at: bodies, withIntermediateDirectories: true)
    }

    // MARK: - Article index (summaries)

    func loadIndex() -> [ArticleSummary] {
        guard let url = indexURL,
              let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder.broadsheet.decode([ArticleSummary].self, from: data)
        else { return [] }
        return items
    }

    func saveIndex(_ articles: [ArticleSummary]) {
        ensureDirectories()
        guard let url = indexURL else { return }
        guard let data = try? JSONEncoder.broadsheet.encode(articles) else { return }
        try? data.write(to: url, options: .atomic)
    }

    // MARK: - Article bodies

    func loadBody(id: String) -> CachedArticleBody? {
        guard let url = bodyURL(for: id),
              let data = try? Data(contentsOf: url),
              let body = try? JSONDecoder.broadsheet.decode(CachedArticleBody.self, from: data)
        else { return nil }
        return body
    }

    func saveBody(_ body: CachedArticleBody) {
        ensureDirectories()
        guard let url = bodyURL(for: body.id) else { return }
        guard let data = try? JSONEncoder.broadsheet.encode(body) else { return }
        try? data.write(to: url, options: .atomic)
    }

    func removeBody(id: String) {
        guard let url = bodyURL(for: id) else { return }
        try? fm.removeItem(at: url)
    }

    // MARK: - Cache management

    /// Total bytes used by the offline cache directory.
    func cacheSize() -> Int64 {
        guard let root = rootURL else { return 0 }
        return directorySize(at: root)
    }

    /// Remove all cached data (index + bodies).
    func clearAll() {
        guard let root = rootURL else { return }
        try? fm.removeItem(at: root)
    }

    /// Number of articles with cached bodies.
    func cachedBodyCount() -> Int {
        guard let bodies = bodiesURL,
              let contents = try? fm.contentsOfDirectory(atPath: bodies.path)
        else { return 0 }
        return contents.filter { $0.hasSuffix(".json") }.count
    }

    // MARK: - Helpers

    private func directorySize(at url: URL) -> Int64 {
        guard let enumerator = fm.enumerator(
            at: url,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }

        var total: Int64 = 0
        for case let fileURL as URL in enumerator {
            if let size = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                total += Int64(size)
            }
        }
        return total
    }
}

/// The full article body stored on disk alongside its ID.
struct CachedArticleBody: Codable {
    let id: String
    let body: String
    let cachedAt: Date
}
