import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the production smoke check.
 *
 * Separate from `playwright.config.ts` because the dev config boots
 * `next dev` with the in-memory adapter and targets localhost. Here we
 * point at an already-deployed instance (default: https://broadsheet.app)
 * and omit the webServer entirely. Everything else — the Clerk setup
 * chain, auth helper, storage state — is reused verbatim.
 *
 * Required env (same names as the dev suite so the setup files are
 * unchanged):
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  — production Clerk publishable key
 *   CLERK_SECRET_KEY                   — production Clerk secret key
 *   E2E_CLERK_USER_USERNAME            — smoke test user email
 *   E2E_CLERK_USER_PASSWORD            — smoke test user password
 *   E2E_BASE_URL                       — defaults to https://broadsheet.app
 *
 * Run locally:
 *   npm run test:e2e:prod-smoke
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "https://broadsheet.app";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // Prod is flakier than localhost — one retry smooths over transient
  // network blips without masking a real outage (the job still fails if
  // both attempts fail).
  retries: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "clerk-setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "auth",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["clerk-setup"],
    },
    {
      name: "prod-smoke",
      testMatch: /prod-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["auth"],
    },
  ],
});
