const PRODUCTION_ORIGIN = "https://broadsheet.marginalutility.dev";
const DEV_ORIGIN = "http://localhost:3000";

function buildAllowlist(): Set<string> {
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

  return origins;
}

const allowedOrigins = buildAllowlist();

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

  if (allowedOrigins.has(origin)) return null;

  // Chrome extensions get a unique origin per install
  if (origin.startsWith("chrome-extension://")) return null;

  return Response.json({ error: "Forbidden" }, { status: 403 });
}
