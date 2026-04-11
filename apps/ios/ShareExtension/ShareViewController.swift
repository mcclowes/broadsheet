import UIKit
import SwiftUI
import UniformTypeIdentifiers

/// Share Extension entry point.
///
/// Flow:
/// 1. Extract a URL from the incoming `NSExtensionItem`s. We accept any of
///    `public.url`, `public.plain-text` (as a fallback if the host app only
///    passes a string), and `public.web-url`.
/// 2. POST it to `/api/articles` using the most recent Clerk JWT stashed in
///    the shared keychain by the main app's `AuthTokenBridge`.
/// 3. If the save fails for any reason (no token, offline, server error),
///    append it to the shared `PendingSaveQueue`. The main app drains the
///    queue the next time it comes to the foreground.
///
/// The UI is a tiny SwiftUI sheet hosted inside this UIKit view controller
/// — iOS share extensions must be UIKit-rooted, but SwiftUI renders fine
/// inside a `UIHostingController`.
final class ShareViewController: UIViewController {
    private var hosting: UIHostingController<ShareSheetView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        Task { await start() }
    }

    private func start() async {
        let urlString = await extractURL()

        let content = ShareSheetView(
            initialURL: urlString,
            onDone: { [weak self] outcome in
                self?.finish(outcome: outcome)
            }
        )
        await MainActor.run {
            let host = UIHostingController(rootView: content)
            host.view.backgroundColor = .clear
            addChild(host)
            host.view.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(host.view)
            NSLayoutConstraint.activate([
                host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                host.view.topAnchor.constraint(equalTo: view.topAnchor),
                host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            ])
            host.didMove(toParent: self)
            self.hosting = host
        }
    }

    private func extractURL() async -> String? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            return nil
        }
        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(
                        forTypeIdentifier: UTType.url.identifier, options: nil
                    ) as? URL {
                        return url.absoluteString
                    }
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text = try? await provider.loadItem(
                        forTypeIdentifier: UTType.plainText.identifier, options: nil
                    ) as? String,
                       let url = Self.firstURL(in: text) {
                        return url
                    }
                }
            }
        }
        return nil
    }

    private static func firstURL(in text: String) -> String? {
        guard let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.link.rawValue
        ) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        let match = detector.firstMatch(in: text, options: [], range: range)
        return match?.url?.absoluteString
    }

    private func finish(outcome: ShareOutcome) {
        switch outcome {
        case .cancelled:
            extensionContext?.cancelRequest(withError: NSError(
                domain: "Broadsheet",
                code: NSUserCancelledError
            ))
        case .completed:
            extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
