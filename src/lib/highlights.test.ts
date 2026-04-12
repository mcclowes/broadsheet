import { describe, expect, it, beforeEach } from "vitest";
import {
  addHighlight,
  listHighlights,
  removeHighlight,
  listAllHighlights,
} from "./highlights";
import { saveArticle } from "./articles";
import type { ParsedArticle } from "./ingest";

const USER = "test-user-highlights";

function makeParsed(title: string): ParsedArticle {
  return {
    title,
    byline: null,
    excerpt: null,
    siteName: null,
    lang: null,
    markdown:
      "This is the article body with some interesting text to highlight.",
    wordCount: 12,
  };
}

describe("highlights", () => {
  let articleId: string;

  beforeEach(async () => {
    const url = `https://example.com/highlight-test-${Date.now()}-${Math.random()}`;
    const summary = await saveArticle(USER, url, makeParsed("Highlight test"));
    articleId = summary.id;
  });

  it("adds a highlight and retrieves it", async () => {
    const h = await addHighlight(USER, articleId, {
      text: "interesting text",
      startOffset: 35,
      endOffset: 51,
    });
    expect(h.id).toBeTruthy();
    expect(h.text).toBe("interesting text");
    expect(h.startOffset).toBe(35);
    expect(h.endOffset).toBe(51);
    expect(h.createdAt).toBeTruthy();

    const all = await listHighlights(USER, articleId);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(h.id);
  });

  it("adds multiple highlights", async () => {
    await addHighlight(USER, articleId, {
      text: "first",
      startOffset: 0,
      endOffset: 5,
    });
    await addHighlight(USER, articleId, {
      text: "second",
      startOffset: 10,
      endOffset: 16,
    });
    const all = await listHighlights(USER, articleId);
    expect(all).toHaveLength(2);
  });

  it("removes a highlight", async () => {
    const h1 = await addHighlight(USER, articleId, {
      text: "first",
      startOffset: 0,
      endOffset: 5,
    });
    await addHighlight(USER, articleId, {
      text: "second",
      startOffset: 10,
      endOffset: 16,
    });

    await removeHighlight(USER, articleId, h1.id);
    const all = await listHighlights(USER, articleId);
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe("second");
  });

  it("returns empty array for nonexistent article", async () => {
    const all = await listHighlights(USER, "nonexistent");
    expect(all).toEqual([]);
  });

  it("throws when adding highlight to nonexistent article", async () => {
    await expect(
      addHighlight(USER, "nonexistent", {
        text: "test",
        startOffset: 0,
        endOffset: 4,
      }),
    ).rejects.toThrow("Article not found");
  });

  it("lists highlights across all articles", async () => {
    await addHighlight(USER, articleId, {
      text: "first article",
      startOffset: 0,
      endOffset: 13,
    });

    const url2 = `https://example.com/highlight-test2-${Date.now()}-${Math.random()}`;
    const summary2 = await saveArticle(
      USER,
      url2,
      makeParsed("Second article"),
    );
    await addHighlight(USER, summary2.id, {
      text: "second article",
      startOffset: 0,
      endOffset: 14,
    });

    const all = await listAllHighlights(USER);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some((h) => h.articleTitle === "Highlight test")).toBe(true);
    expect(all.some((h) => h.articleTitle === "Second article")).toBe(true);
  });
});
