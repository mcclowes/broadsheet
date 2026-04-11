import Foundation
import Security

/// Minimal wrapper around the iOS Keychain scoped to a shared access group so
/// the main app and the Share Extension can read/write the same items.
///
/// The access group is `$(AppIdentifierPrefix)com.broadsheet.ios.shared` and
/// must be declared in both targets' `keychain-access-groups` entitlement.
enum SharedKeychain {
    /// Session JWT key used by `AuthTokenBridge` and the share extension.
    static let sessionTokenKey = "broadsheet.sessionToken"

    static func set(_ value: String, for key: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query = baseQuery(for: key)
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func string(for key: String) -> String? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func remove(_ key: String) {
        SecItemDelete(baseQuery(for: key) as CFDictionary)
    }

    private static func baseQuery(for key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "broadsheet",
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: BroadsheetConfig.keychainAccessGroup,
        ]
    }
}
