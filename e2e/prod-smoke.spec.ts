import { expect, test } from "@playwright/test";

/**
 * Production auth-gated smoke check.
 *
 * Runs on a GitHub Actions cron (see `.github/workflows/prod-smoke.yml`) to
 * catch the "auth broke and nobody noticed" case. Read-only — never mutates
 * production data. The auth chain (`global.setup.ts` -> `auth.setup.ts`) is
 * shared with the dev e2e suite; the only difference in prod is that
 * `E2E_BASE_URL` points at the deployed app.
 *
 * Signals failure (and therefore pages the repo owner via GitHub's
 * scheduled-workflow failure notification) when any of:
 *   - The authenticated request to `/library` does not return 200.
 *   - Clerk redirects to `/sign-in` (session cookie rejected).
 *   - The library heading is missing (page rendered but broken).
 */
test("library is reachable as signed-in user", async ({ page }) => {
  const response = await page.goto("/library");

  expect(response?.status(), "GET /library should return 2xx").toBeLessThan(
    400,
  );
  await expect(page, "should not be redirected to sign-in").toHaveURL(
    /\/library/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
});
