import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

import { saveArticle, listArticles } from "./articles";
import { listSources, type SourceFrontmatter } from "./sources";
import { setDigestPreferences, getDigestPreferences } from "./digest";
import { authedUserId } from "./auth-types";
import { deleteAllUserData } from "./user-deletion";
import type { ParsedArticle } from "./ingest";
import { getFolio, volumeNameForUser } from "./folio";

async function seedSource(userId: ReturnType<typeof authedUserId>) {
  const vol = getFolio().volume<SourceFrontmatter>(
    volumeNameForUser(userId, "sources"),
  );
  await vol.set("feed1", {
    frontmatter: {
      feedUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com",
      title: "Example",
      addedAt: new Date().toISOString(),
      lastFetchedAt: null,
      lastError: null,
    },
    body: "",
  });
}

const USER = authedUserId("user_test_delete_alice");
const OTHER = authedUserId("user_test_delete_bob");

function parsed(url: string): ParsedArticle {
  return {
    title: "T",
    byline: null,
    excerpt: null,
    siteName: null,
    lang: null,
    image: null,
    markdown: "hello ".repeat(50),
    sanitizedHtml: "<p>hello</p>",
    wordCount: 50,
  };
}

async function clearUser(userId: ReturnType<typeof authedUserId>) {
  for (const suffix of [undefined, "sources"] as const) {
    const vol = getFolio().volume(volumeNameForUser(userId, suffix));
    const pages = await vol.list();
    for (const p of pages) await vol.delete(p.slug);
  }
  await setDigestPreferences(userId, { enabled: false, email: "" });
}

beforeEach(async () => {
  await clearUser(USER);
  await clearUser(OTHER);
});

describe("deleteAllUserData", () => {
  it("removes articles, sources and digest registry entry for the user", async () => {
    await saveArticle(USER, "https://example.com/a", parsed("a"));
    await saveArticle(USER, "https://example.com/b", parsed("b"));
    await seedSource(USER);
    await setDigestPreferences(USER, { enabled: true, email: "a@b.com" });

    await deleteAllUserData(USER);

    expect(await listArticles(USER)).toEqual([]);
    expect(await listSources(USER)).toEqual([]);
    const prefs = await getDigestPreferences(USER);
    expect(prefs.enabled).toBe(false);
  });

  it("leaves other users' data untouched", async () => {
    await saveArticle(USER, "https://example.com/a", parsed("a"));
    await saveArticle(OTHER, "https://example.com/b", parsed("b"));

    await deleteAllUserData(USER);

    expect(await listArticles(USER)).toEqual([]);
    const other = await listArticles(OTHER);
    expect(other).toHaveLength(1);
  });

  it("is idempotent — running twice on a missing user does not throw", async () => {
    await deleteAllUserData(USER);
    await expect(deleteAllUserData(USER)).resolves.toBeUndefined();
  });
});
