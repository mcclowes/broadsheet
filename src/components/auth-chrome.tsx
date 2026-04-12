import { SignInButton, UserButton } from "@clerk/nextjs";
import { isPreviewMode } from "@/lib/preview-mode";

/**
 * Server-rendered wrappers around Clerk's auth UI components. In preview
 * mode (no Clerk keys, no ClerkProvider), rendering `<UserButton>` or
 * `<SignInButton>` throws — so we swap them for plain markup instead.
 *
 * `isPreviewMode()` reads a server-only env var, so these must stay in a
 * server component module (no "use client").
 */

export function AuthUserButton() {
  if (isPreviewMode()) {
    return (
      <span
        aria-label="Preview demo account"
        title="Preview demo account"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          fontSize: "0.75rem",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--fg-muted, #666)",
        }}
      >
        Demo
      </span>
    );
  }
  return <UserButton />;
}

export function AuthSignInButton({ children }: { children: React.ReactNode }) {
  if (isPreviewMode()) {
    // In preview everyone is already "signed in" — link the button to the
    // library so CTAs still feel functional.
    return <a href="/library">{children}</a>;
  }
  return <SignInButton mode="modal">{children}</SignInButton>;
}
