import { auth } from "@clerk/nextjs/server";
import { authedUserId, type AuthedUserId } from "./auth-types";

/**
 * Preview mode lets us run the full app without Clerk credentials — useful
 * for Vercel preview deployments where the Clerk marketplace integration
 * hasn't been provisioned for the branch.
 *
 * When `BROADSHEET_PREVIEW_MODE=1`:
 *  - clerkMiddleware is bypassed (see `src/proxy.ts`)
 *  - `<ClerkProvider>` is omitted from the root layout
 *  - `getRequestUserId()` returns a deterministic demo userId instead of
 *    calling `auth()`
 *  - `resolveAdapter()` forces MemoryAdapter (see `src/lib/folio.ts`) so
 *    demo data is ephemeral per-instance and never hits Blob storage
 *  - A fixture library is seeded on first request (see
 *    `src/lib/preview-seed.ts`)
 *
 * This flag is strictly for non-production previews / local demos. It must
 * NEVER be enabled alongside real user data — see the guard in
 * `resolveAdapter()`.
 */
export function isPreviewMode(): boolean {
  return process.env.BROADSHEET_PREVIEW_MODE === "1";
}

/**
 * Stable demo userId used across all preview-mode requests. Derived so the
 * hashed Folio volume name (`volumeNameForUser`) is deterministic.
 */
export const PREVIEW_USER_ID = "broadsheet-preview-demo";

/**
 * Resolve the userId for the current request. In preview mode returns a
 * fixed demo id; otherwise delegates to Clerk's `auth()`. Returns `null`
 * when there's no authenticated session (callers redirect or return 401).
 *
 * This is the only place outside preview-mode tests that should call
 * `auth()` directly. All route handlers and auth-gated pages should use
 * this helper so preview mode works uniformly.
 */
export async function getRequestUserId(): Promise<AuthedUserId | null> {
  if (isPreviewMode()) {
    return authedUserId(PREVIEW_USER_ID);
  }
  const { userId } = await auth();
  return userId ? authedUserId(userId) : null;
}
