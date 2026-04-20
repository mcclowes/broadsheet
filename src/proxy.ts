/**
 * Next.js 16 middleware. Named `proxy.ts` per the Next.js 16 convention
 * (previously `middleware.ts`). If you're grep-ing for "middleware", this
 * is what you want — Next.js wires it up automatically from this path.
 *
 * Responsibilities:
 * 1. Auth-gate the protected page paths (redirect to sign-in).
 * 2. Auth-gate the protected API paths (401 JSON).
 * 3. CSRF check via Origin header for mutating *session-authenticated*
 *    API methods. We intentionally do NOT CSRF-check webhook, cron, or
 *    HMAC-token endpoints — those carry their own non-cookie auth and
 *    legitimately receive POSTs from servers/email clients with
 *    unpredictable Origin headers.
 *
 * Route-handler auth remains as defence-in-depth but the middleware is
 * the authoritative enforcement point for these three concerns.
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { checkOrigin } from "@/lib/csrf";

// Path-segment boundary matching: `/library` and `/library/foo` match, but
// `/library-foo` does not. Plain prefix match would over-match unrelated
// paths. Bases are listed explicitly; `matchesAny` builds a segment-aware
// regex for each. We don't use Clerk's `createRouteMatcher` here because
// it requires a `NextRequest` (with `nextUrl`) — we want this middleware
// testable with plain `Request` objects.
export const PROTECTED_PAGE_BASES = [
  "/library",
  "/read",
  "/sources",
  "/settings",
  "/import",
];

// Note: `/api/digest/send` (Vercel Cron) and `/api/digest/unsubscribe`
// (one-click email links) authenticate themselves — the first with a
// `Bearer ${CRON_SECRET}` header, the second with an HMAC'd token — so
// they must NOT be gated by Clerk. Only `/api/digest/preferences*` is a
// user-session endpoint.
export const PROTECTED_API_BASES = [
  "/api/articles",
  "/api/sources",
  "/api/digest/preferences",
  "/api/import",
  "/api/settings",
  "/api/image",
];

function matchesAny(pathname: string, bases: readonly string[]): boolean {
  for (const base of bases) {
    if (pathname === base) return true;
    if (pathname.startsWith(base + "/")) return true;
  }
  return false;
}

function pathnameOf(req: Request): string {
  // `new URL(req.url)` works for both NextRequest and plain Request — we
  // only need the pathname. Avoids depending on NextRequest's `nextUrl`.
  return new URL(req.url).pathname;
}

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface ProxyAuth {
  (): Promise<{ userId: string | null }>;
  protect(): Promise<unknown>;
}

/**
 * Pure, testable middleware body. Exported so unit tests can drive it
 * directly with a mock `auth` callable instead of wiring through Clerk's
 * runtime.
 *
 * Returns:
 *   - a `Response` if the request should be short-circuited (401, 403, etc.)
 *   - `undefined` if the request should continue to the route handler
 */
export async function handleProxy(
  auth: ProxyAuth,
  req: Request,
): Promise<Response | undefined> {
  const pathname = pathnameOf(req);

  if (matchesAny(pathname, PROTECTED_API_BASES)) {
    // CSRF: any mutating request to a session-authenticated endpoint
    // must carry an allowed Origin (or none at all — see checkOrigin).
    // Handler-level checkOrigin calls are redundant now and have been
    // removed; this is the single source of truth.
    if (MUTATING_METHODS.has(req.method)) {
      const originError = checkOrigin(req);
      if (originError) return originError;
    }
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return;
  }
  if (matchesAny(pathname, PROTECTED_PAGE_BASES)) {
    await auth.protect();
  }
  return;
}

export default clerkMiddleware(async (auth, req) => {
  return handleProxy(auth as unknown as ProxyAuth, req);
});

export const config = {
  // Skip Next internals and common static asset extensions. Add new
  // extensions here as you ship them; a missed entry costs a middleware
  // invocation per asset fetch, not correctness. The `/(api)(.*)` line
  // ensures API routes run through middleware even if the first matcher
  // would have excluded them on extension.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api)(.*)",
  ],
};
