import Foundation

/// Shared configuration between the main app and the share extension.
///
/// The base URL is stored in the shared `UserDefaults` (App Group) so the
/// share extension picks up changes made in the main app's Settings screen
/// without either target having to hardcode it.
enum BroadsheetConfig {
    /// App Group identifier — must match the value in both entitlements files.
    static let appGroupIdentifier = "group.com.broadsheet.ios"

    /// Shared keychain access group. Both targets declare this in their
    /// entitlements and the `$(AppIdentifierPrefix)` prefix is substituted at
    /// build time by Xcode.
    static let keychainAccessGroup = "com.broadsheet.ios.shared"

    /// Default API base URL. Overridable via the Settings screen.
    static let defaultBaseURL = "https://broadsheet.marginalutility.dev"

    private static let baseURLKey = "BROADSHEET_BASE_URL"

    static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    static var baseURL: URL {
        let raw = sharedDefaults?.string(forKey: baseURLKey) ?? defaultBaseURL
        return URL(string: raw.trimmingCharacters(in: .whitespaces))
            ?? URL(string: defaultBaseURL)!
    }

    static func setBaseURL(_ string: String) {
        let trimmed = string.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, URL(string: trimmed) != nil else { return }
        sharedDefaults?.set(trimmed, forKey: baseURLKey)
    }
}
