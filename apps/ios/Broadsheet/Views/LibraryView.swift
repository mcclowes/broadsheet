import SwiftUI

struct LibraryView: View {
    @State private var store = LibraryStore()
    @State private var showAddSheet = false
    @State private var pendingCount = 0

    var body: some View {
        NavigationStack {
            Group {
                if store.isLoading && store.articles.isEmpty {
                    ProgressView().controlSize(.large)
                } else if store.articles.isEmpty {
                    ContentUnavailableView(
                        "No articles yet",
                        systemImage: "books.vertical",
                        description: Text("Share any URL to Broadsheet from Safari, Mail, or your favourite reader.")
                    )
                } else {
                    List {
                        if pendingCount > 0 {
                            Section {
                                Label("\(pendingCount) pending save\(pendingCount == 1 ? "" : "s")",
                                      systemImage: "tray.and.arrow.down")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Section {
                            ForEach(store.articles) { article in
                                NavigationLink(value: article) {
                                    ArticleRowView(article: article)
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Library")
            .navigationDestination(for: ArticleSummary.self) { article in
                ReaderView(article: article, store: store)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAddSheet = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AddURLSheet(store: store)
            }
            .alert(
                "Something went wrong",
                isPresented: Binding(
                    get: { store.errorMessage != nil },
                    set: { if !$0 { store.errorMessage = nil } }
                ),
                presenting: store.errorMessage
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { message in
                Text(message)
            }
            .refreshable { await store.load() }
            .task {
                pendingCount = PendingSaveQueue.load().count
                await store.load()
                pendingCount = PendingSaveQueue.load().count
            }
        }
    }
}

struct ArticleRowView: View {
    let article: ArticleSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(article.title)
                .font(.headline)
                .lineLimit(2)
            if let source = article.source {
                Text(source)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                Label("\(article.readMinutes) min", systemImage: "clock")
                if article.readAt != nil {
                    Label("Read", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct AddURLSheet: View {
    @Environment(\.dismiss) private var dismiss
    let store: LibraryStore
    @State private var url: String = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("URL") {
                    TextField("https://…", text: $url)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .navigationTitle("Save article")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        isSaving = true
                        Task {
                            _ = await store.save(url: url)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(url.isEmpty || isSaving)
                }
            }
        }
    }
}
