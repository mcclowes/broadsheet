import { describe, expect, it } from "vitest";
import { filterArticles, type ArticleSummary } from "./articles";

function make(
  id: string,
  overrides: Partial<ArticleSummary> = {},
): ArticleSummary {
  return {
    id,
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    source: "example.com",
    byline: null,
    excerpt: null,
    lang: null,
    wordCount: 500,
    readMinutes: 2,
    savedAt: "2026-04-10T00:00:00.000Z",
    readAt: null,
    archivedAt: null,
    tags: [],
    ...overrides,
  };
}

describe("filterArticles", () => {
  const articles: ArticleSummary[] = [
    make("a", { tags: ["tech"], source: "example.com" }),
    make("b", { tags: ["tech", "news"], source: "other.com", readAt: "2026-04-09T00:00:00.000Z" }),
    make("c", { tags: ["food"], source: "example.com", archivedAt: "2026-04-09T00:00:00.000Z" }),
    make("d", { tags: [], source: "other.com" }),
  ];

  it("defaults to inbox view (excludes archived)", () => {
    const result = filterArticles(articles, {});
    expect(result.map((a) => a.id)).toEqual(["a", "b", "d"]);
  });

  it("archive view shows only archived", () => {
    const result = filterArticles(articles, { view: "archive" });
    expect(result.map((a) => a.id)).toEqual(["c"]);
  });

  it("filters unread state within inbox", () => {
    const result = filterArticles(articles, { state: "unread" });
    expect(result.map((a) => a.id)).toEqual(["a", "d"]);
  });

  it("filters read state within inbox", () => {
    const result = filterArticles(articles, { state: "read" });
    expect(result.map((a) => a.id)).toEqual(["b"]);
  });

  it("filters by tag", () => {
    const result = filterArticles(articles, { tag: "tech" });
    expect(result.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("filters by source", () => {
    const result = filterArticles(articles, { source: "other.com" });
    expect(result.map((a) => a.id)).toEqual(["b", "d"]);
  });

  it("combines filters", () => {
    const result = filterArticles(articles, {
      tag: "tech",
      state: "unread",
      source: "example.com",
    });
    expect(result.map((a) => a.id)).toEqual(["a"]);
  });
});
