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

// Browser extension origin prefixes we recognise. Chrome / Edge / Opera /
// Brave all use `chrome-extension://`; Firefox uses `moz-extension://`;
// Safari web extensions use `safari-web-extension://`.
const EXTENSION_SCHEMES = [
  "chrome-extension://",
  "moz-extension://",
  "safari-web-extension://",
] as const;

function extensionIdFromOrigin(origin: string): string | null {
  for (const scheme of EXTENSION_SCHEMES) {
    if (origin.startsWith(scheme)) return origin.slice(scheme.length);
  }
  return null;
}

// Environments where the extension-allowlist bypass is allowed. We only
// trust it in local development — any hosted Vercel environment (preview,
// production) must have `BROADSHEET_EXTENSION_IDS` configured.
function isLocalDevEnvironment(): boolean {
  if (process.env.VERCEL_ENV) return false; // preview/production/development on Vercel
  return process.env.NODE_ENV !== "production";
}

/**
 * Returns null if the origin is allowed, or a 403 Response if it should be
 * rejected. Call this at the top of every mutating route handler that uses
 * Clerk auth.
 *
 * Allowed origins:
 * - Missing Origin header (same-origin in most browsers)
 * - Exact match against the static allowlist (production, dev, Vercel previews)
 * - A browser-extension origin (chrome/moz/safari-web-extension://) whose ID
 *   is in `BROADSHEET_EXTENSION_IDS`. In local dev only, any extension ID is
 *   accepted so unpacked-extension workflows keep working.
 */
export function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");

  // No Origin header → same-origin request (browsers omit it for same-origin)
  if (!origin) return null;

  if (getAllowedOrigins().has(origin)) return null;

  const extensionId = extensionIdFromOrigin(origin);
  if (extensionId !== null) {
    const allowlist = getExtensionAllowlist();
    if (allowlist) {
      if (allowlist.has(extensionId)) return null;
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    // No allowlist configured. Only permitted in local development —
    // preview deploys share real data/sessions and must not accept an
    // arbitrary extension.
    if (!isLocalDevEnvironment()) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    console.info("[csrf] allowed extension origin (no allowlist, local dev)", {
      origin,
    });
    return null;
  }

  return Response.json({ error: "Forbidden" }, { status: 403 });
}

function getExtensionAllowlist(): Set<string> | null {
  const raw = process.env.BROADSHEET_EXTENSION_IDS;
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}
