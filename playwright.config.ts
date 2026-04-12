import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Broadsheet e2e.
 *
 * Boots `next dev` with `BROADSHEET_FOLIO_ADAPTER=memory` so tests run against
 * ephemeral in-memory storage and never touch `.broadsheet-data/` or Vercel
 * Blob. Auth is real Clerk — the suite signs in with a dedicated Clerk test
 * user (see E2E_CLERK_USER_USERNAME / E2E_CLERK_USER_PASSWORD in
 * `.env.example`) and reuses the session via storageState.
 *
 * Run:
 *   npm run test:e2e        # headless
 *   npm run test:e2e:ui     # Playwright UI
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
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
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["auth"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      BROADSHEET_FOLIO_ADAPTER: "memory",
    },
  },
});
