const PRODUCTION_ORIGIN = "https://broadsheet.marginalutility.dev";
const DEV_ORIGIN = "http://localhost:3000";

// Built lazily on first request (not at module load time) so that env vars
// added after deployment are picked up on the next cold start without
// relying on module evaluation order.
let _allowedOrigins: Set<string> | null = null;

function getAllowedOrigins(): Set<string> {
  if (_allowedOrigins) return _allowedOrigins;

  const origins = new Set([PRODUCTION_ORIGIN, DEV_ORIGIN]);

  // Vercel sets VERCEL_URL for preview deployments (no protocol prefix)
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    origins.add(`https://${vercelUrl}`);
  }

  // VERCEL_BRANCH_URL covers branch-specific preview URLs
  const branchUrl = process.env.VERCEL_BRANCH_URL;
  if (branchUrl) {
    origins.add(`https://${branchUrl}`);
  }

  _allowedOrigins = origins;
  return origins;
}

/**
 * Returns null if the origin is allowed, or a 403 Response if it should be
 * rejected. Call this at the top of every mutating route handler that uses
 * Clerk auth.
 *
 * Allowed origins:
 * - Missing Origin header (same-origin in most browsers)
 * - Exact match against the static allowlist (production, dev, Vercel previews)
 * - Any `chrome-extension://` origin (extension ID is assigned at install time)
 */
export function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");

  // No Origin header → same-origin request (browsers omit it for same-origin)
  if (!origin) return null;

  if (getAllowedOrigins().has(origin)) return null;

  // Chrome extensions get a unique origin per extension ID. We allow any
  // extension for now (the ID is stable per-extension, not per-user) but
  // log the origin so we can audit and pin to our own extension ID later.
  if (origin.startsWith("chrome-extension://")) {
    console.info("[csrf] allowed chrome-extension origin", { origin });
    return null;
  }

  return Response.json({ error: "Forbidden" }, { status: 403 });
}
