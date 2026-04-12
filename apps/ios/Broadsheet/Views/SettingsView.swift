import SwiftUI
import ClerkKit

struct SettingsView: View {
    @Environment(Clerk.self) private var clerk
    @State private var baseURL: String = BroadsheetConfig.baseURL.absoluteString
    @State private var baseURLStatus: String?
    @State private var cacheSize: Int64 = 0
    @State private var cachedCount: Int = 0
    @State private var showClearConfirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if clerk.user != nil {
                        LabeledContent("Status") {
                            Text("Signed in")
                                .foregroundStyle(.secondary)
                        }
                    }
                    Button("Sign out", role: .destructive) {
                        Task {
                            try? await Clerk.shared.signOut()
                            AuthTokenBridge.clear()
                            PendingSaveQueue.clear()
                        }
                    }
                }

                Section(
                    header: Text("API base URL"),
                    footer: Text("The Broadsheet web app the iOS client talks to. Change to `http://localhost:3000` when running against a local dev server on the same network.")
                ) {
                    TextField("https://broadsheet.app", text: $baseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Save") {
                        BroadsheetConfig.setBaseURL(baseURL)
                        baseURLStatus = "Saved"
                    }
                    if let baseURLStatus {
                        Text(baseURLStatus)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section(
                    header: Text("Offline storage"),
                    footer: Text("Articles you've opened are cached for offline reading. The library list is always cached.")
                ) {
                    LabeledContent("Cached articles") {
                        Text("\(cachedCount)")
                            .foregroundStyle(.secondary)
                    }
                    LabeledContent("Cache size") {
                        Text(formattedCacheSize)
                            .foregroundStyle(.secondary)
                    }
                    Button("Clear offline cache", role: .destructive) {
                        showClearConfirm = true
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: Bundle.main.shortVersion)
                    Link("broadsheet.app",
                         destination: URL(string: "https://broadsheet.app")!)
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog(
                "Clear offline cache?",
                isPresented: $showClearConfirm,
                titleVisibility: .visible
            ) {
                Button("Clear cache", role: .destructive) {
                    Task {
                        await OfflineStore.shared.clearAll()
                        await refreshCacheInfo()
                    }
                }
            } message: {
                Text("Cached articles will be re-downloaded when you open them with a network connection.")
            }
            .task { await refreshCacheInfo() }
        }
    }

    private var formattedCacheSize: String {
        ByteCountFormatter.string(fromByteCount: cacheSize, countStyle: .file)
    }

    private func refreshCacheInfo() async {
        cacheSize = await OfflineStore.shared.cacheSize()
        cachedCount = await OfflineStore.shared.cachedBodyCount()
    }
}

private extension Bundle {
    var shortVersion: String {
        let marketing = (object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0"
        let build = (object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0"
        return "\(marketing) (\(build))"
    }
}
