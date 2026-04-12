import SwiftUI
import ClerkKit

struct RootView: View {
    @Environment(Clerk.self) private var clerk

    var body: some View {
        ZStack {
            if clerk.session != nil {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .animation(.default, value: clerk.session?.id)
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            LibraryView()
                .tabItem { Label("Library", systemImage: "books.vertical.fill") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}

#Preview {
    MainTabView()
}
