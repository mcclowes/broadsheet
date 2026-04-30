import { clerk } from "@clerk/testing/playwright";
import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.join(__dirname, ".auth", "user.json");

/**
 * Sign in via Clerk's programmatic test helper and persist the resulting
 * storage state to `e2e/.auth/user.json`. The main `chromium` project loads
 * that file so every spec starts already authenticated.
 *
 * Uses the email-based ticket flow (`emailAddress`), which mints a sign-in
 * token via the Clerk Backend API and exchanges it for a session. This
 * bypasses password verification, 2FA, and any bot challenge sitting in
 * front of the Clerk frontend — all of which break a password-based flow
 * against a production Clerk instance with risk-based MFA enabled.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });

  await page.goto("/library");
  // `/library` is auth-gated — if we land here without a redirect to sign-in,
  // the session cookie is working.
  await expect(page).toHaveURL(/\/library/);

  await page.context().storageState({ path: authFile });
});
