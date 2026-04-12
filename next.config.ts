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

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["jsdom"],
};

export default config;
