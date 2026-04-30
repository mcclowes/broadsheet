import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

/**
 * Runs once before any other project. Asks Clerk to mint a short-lived
 * testing token from the CLERK_SECRET_KEY so subsequent sign-ins can bypass
 * bot detection. See https://clerk.com/docs/testing/playwright/overview.
 */
setup("clerk setup", async () => {
  assertEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  assertEnv("CLERK_SECRET_KEY");
  assertEnv("E2E_CLERK_USER_USERNAME");
  await clerkSetup();
});

function assertEnv(name: string): void {
  if (!process.env[name]) {
    throw new Error(
      `${name} is required to run the e2e suite. See .env.example for the full list.`,
    );
  }
}
