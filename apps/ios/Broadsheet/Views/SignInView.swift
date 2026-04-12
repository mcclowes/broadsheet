import SwiftUI
import ClerkKit
import ClerkKitUI

/// Uses Clerk's drop-in authentication view from `ClerkKitUI`. The view
/// renders whatever flows are enabled in the dashboard (email/password,
/// social, passkeys, etc.) so the app stays in sync without code changes.
struct SignInView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "newspaper.fill")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 72, height: 72)
                        .foregroundStyle(.tint)
                    Text("Broadsheet")
                        .font(.largeTitle.weight(.semibold))
                    Text("Save it now, read it clean")
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Drop-in sign-in / sign-up view from ClerkKitUI.
                AuthView()
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal)

                Spacer()
            }
            .padding()
            .navigationBarHidden(true)
        }
    }
}

#Preview {
    SignInView()
}
