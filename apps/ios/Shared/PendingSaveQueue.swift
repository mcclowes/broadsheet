import Foundation

/// A tiny on-disk queue for URLs the Share Extension couldn't save immediately
/// (no network, stale token, rate-limited, etc.).
///
/// Stored as a JSON file inside the App Group container so both targets can
/// read/write it. The main app drains the queue on foreground.
struct PendingSave: Codable, Identifiable, Equatable {
    let id: UUID
    let url: String
    let queuedAt: Date
    var lastError: String?

    init(url: String, lastError: String? = nil) {
        self.id = UUID()
        self.url = url
        self.queuedAt = Date()
        self.lastError = lastError
    }
}

enum PendingSaveQueue {
    private static let filename = "pending-saves.json"

    private static var fileURL: URL? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: BroadsheetConfig.appGroupIdentifier)
        else { return nil }
        return container.appendingPathComponent(filename)
    }

    static func load() -> [PendingSave] {
        guard let url = fileURL,
              let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder.broadsheet.decode([PendingSave].self, from: data)
        else { return [] }
        return items
    }

    static func save(_ items: [PendingSave]) {
        guard let url = fileURL else { return }
        do {
            let data = try JSONEncoder.broadsheet.encode(items)
            try data.write(to: url, options: .atomic)
        } catch {
            // Best-effort. The queue will simply be re-populated on next save.
        }
    }

    /// Append a new URL to the queue. Deduplicates on URL string.
    static func enqueue(_ url: String, error: String? = nil) {
        var items = load()
        if items.contains(where: { $0.url == url }) { return }
        items.append(PendingSave(url: url, lastError: error))
        save(items)
    }

    static func remove(id: UUID) {
        save(load().filter { $0.id != id })
    }

    static func clear() {
        save([])
    }
}

extension JSONEncoder {
    static let broadsheet: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}

extension JSONDecoder {
    static let broadsheet: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
