import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BROADSHEET_FOLIO_ADAPTER = "memory";
});

import { importPocketExport, PocketImportError } from "./pocket-import-service";
import { getArticle, listArticles } from "./articles";
import { authedUserId, type AuthedUserId } from "./auth-types";
import type { ParsedArticle } from "./ingest";
import { getFolio, volumeNameForUser } from "./folio";

const USER = authedUserId("user_test_pocket_import_alice");

function makeParsed(overrides: Partial<ParsedArticle> = {}): ParsedArticle {
  return {
    title: "Fetched Title",
    byline: "Jane Writer",
    excerpt: "Short excerpt.",
    siteName: "Example",
    lang: "en",
    image: null,
    markdown: "This is the fetched article body with enough words to count.",
    wordCount: 12,
    ...overrides,
  };
}

async function clearVolume(userId: AuthedUserId): Promise<void> {
  const volume = getFolio().volume(volumeNameForUser(userId));
  const pages = await volume.list();
  for (const p of pages) {
    await volume.delete(p.slug);
  }
}

beforeEach(async () => {
  await clearVolume(USER);
});

const CSV = [
  "title,url,time_added,tags,status",
  "Alpha,https://example.com/a,1710000000,,unread",
  "Beta,https://example.com/b,1710000000,,unread",
  "Gamma,https://example.com/c,1710000000,,unread",
].join("\n");

describe("importPocketExport content rehydration", () => {
  it("fetches content for each newly created article", async () => {
    const fetchAndParseImpl = vi.fn(async (url: string) => ({
      parsed: makeParsed({ markdown: `body for ${url}` }),
      finalUrl: url,
    }));

    const result = await importPocketExport(
      USER,
      { csv: CSV },
      { fetchAndParseImpl, rehydrateConcurrency: 2 },
    );

    expect(result.articlesCreated).toBe(3);
    expect(result.contentFetched).toBe(3);
    expect(result.contentFailed).toBe(0);
    expect(result.contentPending).toBe(0);
    expect(fetchAndParseImpl).toHaveBeenCalledTimes(3);

    const articles = await listArticles(USER);
    expect(articles).toHaveLength(3);
    for (const summary of articles) {
      const full = await getArticle(USER, summary.id);
      expect(full?.pendingIngest).toBe(false);
      expect(full?.body).toContain("body for");
      expect(full?.wordCount).toBeGreaterThan(0);
    }
  });

  it("records per-article fetch failures without aborting the import", async () => {
    const fetchAndParseImpl = vi.fn(async (url: string) => {
      if (url.includes("/b")) throw new Error("upstream 500");
      return { parsed: makeParsed(), finalUrl: url };
    });

    const result = await importPocketExport(
      USER,
      { csv: CSV },
      { fetchAndParseImpl },
    );

    expect(result.articlesCreated).toBe(3);
    expect(result.contentFetched).toBe(2);
    expect(result.contentFailed).toBe(1);
    expect(result.contentPending).toBe(0);

    const articles = await listArticles(USER);
    const betaSummary = articles.find((a) => a.url.endsWith("/b"));
    const beta = betaSummary ? await getArticle(USER, betaSummary.id) : null;
    expect(beta?.pendingIngest).toBe(true);
    expect(beta?.body.trim()).toBe("");
  });

  it("stops rehydrating once the time budget is exhausted", async () => {
    let clock = 0;
    const now = () => clock;
    const fetchAndParseImpl = vi.fn(async (url: string) => {
      clock += 100;
      return { parsed: makeParsed(), finalUrl: url };
    });

    const result = await importPocketExport(
      USER,
      { csv: CSV },
      {
        fetchAndParseImpl,
        rehydrateConcurrency: 1,
        rehydrateBudgetMs: 150,
        now,
      },
    );

    expect(result.articlesCreated).toBe(3);
    expect(result.contentFetched).toBe(2);
    expect(result.contentPending).toBe(1);
    expect(fetchAndParseImpl).toHaveBeenCalledTimes(2);

    const articles = await listArticles(USER);
    const pending = [];
    for (const summary of articles) {
      const full = await getArticle(USER, summary.id);
      if (full?.pendingIngest) pending.push(full);
    }
    expect(pending).toHaveLength(1);
  });

  it("does not re-fetch content for articles already in the library", async () => {
    const fetchAndParseImpl = vi.fn(async (url: string) => ({
      parsed: makeParsed(),
      finalUrl: url,
    }));

    // First import: creates + fetches all three.
    await importPocketExport(USER, { csv: CSV }, { fetchAndParseImpl });
    expect(fetchAndParseImpl).toHaveBeenCalledTimes(3);
    fetchAndParseImpl.mockClear();

    // Second import of the same CSV: all skipped, no fetches.
    const result = await importPocketExport(
      USER,
      { csv: CSV },
      { fetchAndParseImpl },
    );
    expect(result.articlesCreated).toBe(0);
    expect(result.articlesSkipped).toBe(3);
    expect(result.contentFetched).toBe(0);
    expect(fetchAndParseImpl).not.toHaveBeenCalled();
  });

  describe("PocketImportError surface", () => {
    it("wraps a missing 'url' column as a user-safe error", async () => {
      const badCsv = "title,status\nHello,unread\n";
      await expect(importPocketExport(USER, { csv: badCsv })).rejects.toThrow(
        PocketImportError,
      );
      try {
        await importPocketExport(USER, { csv: badCsv });
      } catch (err) {
        expect(err).toBeInstanceOf(PocketImportError);
        expect((err as PocketImportError).publicMessage).toBe(
          "Pocket CSV is missing a 'url' column",
        );
      }
    });

    it("hides internal parse errors behind a generic message", async () => {
      // Invalid annotations JSON hits a different parse path.
      const csv = "url,title\nhttps://example.com/a,A\n";
      const annotations = "{not valid json";
      try {
        await importPocketExport(USER, { csv, annotations });
        throw new Error("should have rejected");
      } catch (err) {
        expect(err).toBeInstanceOf(PocketImportError);
        // Known message → surfaced verbatim.
        expect((err as PocketImportError).publicMessage).toBe(
          "Pocket annotations JSON is not valid JSON",
        );
      }
    });

    it("surfaces the too-large error as a public message", async () => {
      // Build a CSV with MAX_ITEMS+1 rows.
      const header = "url,title\n";
      const rows = Array.from(
        { length: 5001 },
        (_, i) => `https://example.com/${i},Title ${i}`,
      ).join("\n");
      try {
        await importPocketExport(USER, { csv: header + rows });
        throw new Error("should have rejected");
      } catch (err) {
        expect(err).toBeInstanceOf(PocketImportError);
        expect((err as PocketImportError).publicMessage).toMatch(
          /Pocket export too large/,
        );
      }
    });
  });
});
