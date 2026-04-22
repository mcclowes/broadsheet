import type { NextConfig } from "next";

// Validate required Clerk environment variables at startup so developers
// get an actionable message instead of a cryptic runtime error.
function validateClerkEnv() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;

  if (!pk || !sk) {
    const missing = [
      !pk && "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      !sk && "CLERK_SECRET_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Missing required environment variable(s): ${missing}. ` +
        `Copy .env.example to .env.local and fill in your Clerk keys ` +
        `(https://dashboard.clerk.com/last-active?path=api-keys).`,
    );
  }

  if (!pk.startsWith("pk_test_") && !pk.startsWith("pk_live_")) {
    throw new Error(
      `Invalid NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — expected a key starting ` +
        `with "pk_test_" or "pk_live_". Get yours at ` +
        `https://dashboard.clerk.com/last-active?path=api-keys.`,
    );
  }
}

validateClerkEnv();

// Security headers applied to every response. The CSP intentionally allows
// 'unsafe-inline' on style-src (SCSS modules compile to inline style for
// keyframe tweaks, Next.js injects its own inline styles) and on script-src
// (the theme-init script at src/app/layout.tsx uses dangerouslySetInnerHTML
// without a nonce). Both are defence-in-depth gaps we should close by moving
// to a per-request nonce strategy — tracked in CODE_REVIEW_SENIOR.md §8.1.
//
// What this CSP *does* buy us today:
//  - data:text/html and javascript: URIs in article markdown are already
//    blocked by DOMPurify; CSP is the second line of defence.
//  - frame-ancestors 'none' blocks clickjacking outright.
//  - connect-src restricts what JS can fetch to our own origin plus the
//    image hosts we legitimately reach, so an XSS can't exfiltrate.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Clerk loads its JS from clerk.com and the frontend-api subdomain.
  // Vercel Analytics loads /va/script.debug.js same-origin.
  "script-src 'self' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.marginalutility.dev https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  // Clerk needs to POST to its API; everything else talks to our origin.
  "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.marginalutility.dev https://vitals.vercel-insights.com",
  "frame-src 'self' https://*.clerk.com https://challenges.cloudflare.com",
  // ClerkJS spawns a bot-detection worker from a blob: URL, and our own
  // service worker is same-origin. Without an explicit `worker-src`, CSP
  // falls back to `script-src`, which does not include `blob:` — that
  // blocks the ClerkJS worker and breaks programmatic sign-in (including
  // the prod-smoke e2e suite).
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=()",
  },
  // HSTS is set at the Vercel edge by default; declaring it here is
  // belt-and-braces and keeps self-hosted deployments covered.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["jsdom"],
  async headers() {
    return [
      // /sw.js and /manifest.json must not be edge-cached. A stale SW keeps
      // users on an old app shell across deploys even after CACHE_VERSION bumps.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      // Security headers on everything else. Put them last so route-specific
      // headers above don't get clobbered by the catch-all's merge.
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default config;
