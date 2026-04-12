import SwiftUI

/// Reader view. Fetches the full Markdown body for the article from the
/// server (or offline cache) and renders it with SwiftUI's native Markdown
/// support.
struct ReaderView: View {
    let article: ArticleSummary
    let store: LibraryStore

    @State private var body: String?
    @State private var isLoadingBody = true
    @State private var isCached = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header
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
                    if isCached {
                        Label("Offline", systemImage: "arrow.down.circle.fill")
                            .foregroundStyle(.blue)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                Divider()

                // Body
                if isLoadingBody {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .padding(.vertical, 32)
                } else if let body {
                    Text(LocalizedStringKey(body))
                        .font(.body)
                        .textSelection(.enabled)
                } else if let excerpt = article.excerpt {
                    // Fallback to excerpt if body unavailable
                    Text(excerpt).font(.body)

                    Text("Full article not available offline.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)
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
        .task {
            isLoadingBody = true
            body = await store.fetchBody(for: article)
            // Check if the body came from cache (it's cached if offline store has it).
            isCached = await OfflineStore.shared.loadBody(id: article.id) != nil
            isLoadingBody = false
        }
    }
}
