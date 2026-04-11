import SwiftUI

enum ShareOutcome {
    case cancelled
    case completed
}

/// The little sheet users see when they tap Broadsheet in the iOS share menu.
///
/// State machine:
///   .saving    →  in-flight POST to /api/articles
///   .success   →  article came back, auto-dismiss after 0.8s
///   .queued    →  couldn't save (no token / offline), added to PendingSaveQueue
///   .failed    →  hard error worth surfacing to the user
struct ShareSheetView: View {
    let initialURL: String?
    let onDone: (ShareOutcome) -> Void

    @State private var phase: Phase = .saving
    @State private var savedTitle: String?
    @State private var errorMessage: String?

    enum Phase {
        case saving
        case success
        case queued
        case failed
    }

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            icon

            Text(headline)
                .font(.headline)
                .multilineTextAlignment(.center)

            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer()

            HStack {
                Button("Done") { onDone(.completed) }
                    .buttonStyle(.borderedProminent)
            }
            .padding(.bottom)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial)
        .task { await run() }
    }

    @ViewBuilder
    private var icon: some View {
        switch phase {
        case .saving:
            ProgressView().controlSize(.large)
        case .success:
            Image(systemName: "checkmark.circle.fill")
                .resizable().scaledToFit()
                .frame(width: 56, height: 56)
                .foregroundStyle(.green)
        case .queued:
            Image(systemName: "tray.and.arrow.down.fill")
                .resizable().scaledToFit()
                .frame(width: 56, height: 56)
                .foregroundStyle(.orange)
        case .failed:
            Image(systemName: "xmark.octagon.fill")
                .resizable().scaledToFit()
                .frame(width: 56, height: 56)
                .foregroundStyle(.red)
        }
    }

    private var headline: String {
        switch phase {
        case .saving: return "Saving to Broadsheet…"
        case .success: return savedTitle ?? "Saved"
        case .queued: return "Queued — will save when you next open Broadsheet"
        case .failed: return "Save failed"
        }
    }

    private var subtitle: String? {
        switch phase {
        case .saving, .success: return initialURL
        case .queued: return errorMessage ?? "No fresh session token available to the share extension."
        case .failed: return errorMessage
        }
    }

    private func run() async {
        guard let url = initialURL, !url.isEmpty else {
            phase = .failed
            errorMessage = "No URL found in the shared content."
            return
        }

        let token = SharedKeychain.string(for: SharedKeychain.sessionTokenKey)
        let api = BroadsheetAPI(baseURL: BroadsheetConfig.baseURL, token: token)

        do {
            let article = try await api.save(url: url)
            savedTitle = article.title
            phase = .success
            try? await Task.sleep(nanoseconds: 800_000_000)
            onDone(.completed)
        } catch BroadsheetAPI.APIError.notSignedIn {
            PendingSaveQueue.enqueue(url, error: "Not signed in in the share extension.")
            phase = .queued
        } catch {
            let message = (error as? LocalizedError)?.errorDescription
                ?? error.localizedDescription
            errorMessage = message

            // If it's a hard 4xx client error, surface it to the user.
            // Everything else (network blips, 5xx, 429) queues for retry.
            if let apiError = error as? BroadsheetAPI.APIError,
               case let .server(status, _) = apiError,
               (400..<500).contains(status), status != 401, status != 429 {
                phase = .failed
            } else {
                PendingSaveQueue.enqueue(url, error: message)
                phase = .queued
            }
        }
    }
}
