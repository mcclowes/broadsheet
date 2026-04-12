import SwiftUI
import ClerkKit

struct SettingsView: View {
    @Environment(Clerk.self) private var clerk
    @State private var baseURL: String = BroadsheetConfig.baseURL.absoluteString
    @State private var baseURLStatus: String?

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

                Section("About") {
                    LabeledContent("Version", value: Bundle.main.shortVersion)
                    Link("broadsheet.app",
                         destination: URL(string: "https://broadsheet.app")!)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

private extension Bundle {
    var shortVersion: String {
        let marketing = (object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0"
        let build = (object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0"
        return "\(marketing) (\(build))"
    }
}
