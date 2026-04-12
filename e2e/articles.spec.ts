import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * End-to-end: save an article, open it, mark as read, archive it.
 *
 * Seeding goes through the real `POST /api/articles` endpoint but passes the
 * `html` parameter so the server runs `parseArticleFromHtml` directly and
 * skips `fetchAndParse`. That matters because `assertPublicHost` blocks
 * loopback/private hosts, so a fixture URL like http://localhost:<port>/… would
 * be refused. The URL itself only needs to be syntactically valid (and public-
 * looking) for canonicalisation + the article-id hash.
 *
 * Once seeded, every user-visible step (list, read, mark read, archive) is
 * exercised through the UI.
 */

const uniqueSuffix = () => Math.random().toString(36).slice(2, 10);

function sampleHtml(title: string): string {
  const body = "This is a sample article used by the Broadsheet e2e suite. "
    .repeat(40);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      <p>${body}</p>
      <p>${body}</p>
    </article>
  </body>
</html>`;
}

async function seedArticle(
  request: APIRequestContext,
  { title, url }: { title: string; url: string },
): Promise<{ id: string; title: string }> {
  const res = await request.post("/api/articles", {
    data: { url, html: sampleHtml(title) },
  });
  expect(
    res.ok(),
    `seed POST /api/articles failed: ${res.status()} ${await res.text()}`,
  ).toBe(true);
  const body = await res.json();
  return { id: body.article.id, title: body.article.title };
}

test.describe("article lifecycle", () => {
  test("save → read → mark as read → archive", async ({ page, request }) => {
    const title = `E2E article ${uniqueSuffix()}`;
    const article = await seedArticle(request, {
      title,
      url: `https://example.com/e2e/${uniqueSuffix()}`,
    });

    // --- Library: article appears in the unread inbox ---
    await page.goto("/library?state=unread");
    const libraryItem = page.getByRole("heading", {
      level: 2,
      name: article.title,
    });
    await expect(libraryItem).toBeVisible();

    // --- Open the reader ---
    await libraryItem.click();
    await expect(page).toHaveURL(new RegExp(`/read/${article.id}`));
    await expect(
      page.getByRole("heading", { level: 1, name: article.title }),
    ).toBeVisible();

    // --- Mark as read via the article-actions menu ---
    await page.getByRole("button", { name: "Article actions" }).click();
    await page.getByRole("menuitem", { name: "Mark as read" }).click();
    // Reopen the menu; the toggle should now show "Mark unread".
    await page.getByRole("button", { name: "Article actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Mark unread" }),
    ).toBeVisible();
    // Close the menu before navigating.
    await page.keyboard.press("Escape");

    // --- Back to library, Read filter: the article is listed with "Read" badge ---
    await page.goto("/library?state=read");
    const readItem = page.getByRole("heading", {
      level: 2,
      name: article.title,
    });
    await expect(readItem).toBeVisible();
    // Scope the "Read" badge lookup to this article's row to avoid matching
    // the "Read" filter tab in the nav.
    const readRow = page
      .locator("li", { has: readItem })
      .first();
    await expect(readRow.getByText("Read", { exact: true })).toBeVisible();

    // --- Archive via the article-actions menu ---
    await readItem.click();
    await expect(page).toHaveURL(new RegExp(`/read/${article.id}`));
    await page.getByRole("button", { name: "Article actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();

    // --- Library: archived view shows the article with "Archived" badge;
    // inbox no longer shows it. ---
    await page.goto("/library?view=archive&state=all");
    const archivedItem = page.getByRole("heading", {
      level: 2,
      name: article.title,
    });
    await expect(archivedItem).toBeVisible();
    const archivedRow = page
      .locator("li", { has: archivedItem })
      .first();
    await expect(
      archivedRow.getByText("Archived", { exact: true }),
    ).toBeVisible();

    await page.goto("/library?state=all");
    await expect(
      page.getByRole("heading", { level: 2, name: article.title }),
    ).toHaveCount(0);
  });

  test("saving via the library save form opens and closes", async ({
    page,
  }) => {
    // Pure UI smoke test for the save form — exercising the actual submit path
    // would require an externally reachable URL, so we just verify the form
    // opens on the + button and closes on Escape.
    await page.goto("/library");
    await page.getByRole("button", { name: "Add article" }).click();
    const input = page.getByRole("textbox", { name: "Article URL" });
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(input).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add article" }),
    ).toBeVisible();
  });
});
