import SwiftUI

/// Reader view. Fetches the full Markdown body for the article from the
/// server and renders it with SwiftUI's native Markdown support.
///
/// The main app intentionally calls the existing `GET /read/[id]` is a web
/// page, so we hit an internal sibling endpoint expectation: the body is
/// embedded in the `ArticleSummary` response on first fetch. Because the
/// current web API returns only summaries, this view falls back to opening
/// the canonical URL in a Safari view controller until a dedicated
/// `GET /api/articles/[id]` body endpoint lands.
struct ReaderView: View {
    let article: ArticleSummary
    let store: LibraryStore

    @State private var showSafari = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(article.title)
                    .font(.largeTitle.weight(.semibold))
                if let byline = article.byline {
                    Text(byline).font(.subheadline).foregroundStyle(.secondary)
                }
                HStack(spacing: 12) {
                    if let source = article.source {
                        Label(source, systemImage: "link")
                    }
                    Label("\(article.readMinutes) min read", systemImage: "clock")
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                Divider()

                if let excerpt = article.excerpt {
                    Text(excerpt).font(.body)
                }

                Button {
                    if let url = URL(string: article.url) { openURL(url) }
                } label: {
                    Label("Open original", systemImage: "safari")
                }
                .buttonStyle(.bordered)

                Spacer(minLength: 48)
            }
            .padding()
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    Task { await store.markRead(article, read: article.readAt == nil) }
                } label: {
                    Image(systemName: article.readAt == nil
                          ? "checkmark.circle"
                          : "checkmark.circle.fill")
                }
            }
        }
    }
}
