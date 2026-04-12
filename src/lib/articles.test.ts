import { describe, expect, it } from "vitest";
import {
  articleIdForUrl,
  canonicalizeUrl,
  filterArticles,
  type ArticleSummary,
} from "./articles";

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
    highlights: [],
    annotations: [],
    ...overrides,
  };
}

describe("filterArticles", () => {
  const articles: ArticleSummary[] = [
    make("a", { tags: ["tech"], source: "example.com" }),
    make("b", {
      tags: ["tech", "news"],
      source: "other.com",
      readAt: "2026-04-09T00:00:00.000Z",
    }),
    make("c", {
      tags: ["food"],
      source: "example.com",
      archivedAt: "2026-04-09T00:00:00.000Z",
    }),
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

describe("canonicalizeUrl", () => {
  it("strips fragments", () => {
    expect(canonicalizeUrl("https://example.com/post#section")).toBe(
      "https://example.com/post",
    );
  });

  it("lowercases host and drops www", () => {
    expect(canonicalizeUrl("https://WWW.Example.COM/Path")).toBe(
      "https://example.com/Path",
    );
  });

  it("strips utm and other tracking params", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/x?utm_source=t&utm_medium=e&id=42&fbclid=abc",
      ),
    ).toBe("https://example.com/x?id=42");
  });

  it("sorts remaining query params for stable output", () => {
    expect(canonicalizeUrl("https://example.com/x?b=2&a=1")).toBe(
      "https://example.com/x?a=1&b=2",
    );
  });

  it("strips trailing slash but keeps root", () => {
    expect(canonicalizeUrl("https://example.com/post/")).toBe(
      "https://example.com/post",
    );
    expect(canonicalizeUrl("https://example.com/")).toBe(
      "https://example.com/",
    );
  });

  it("drops default port", () => {
    expect(canonicalizeUrl("https://example.com:443/x")).toBe(
      "https://example.com/x",
    );
    expect(canonicalizeUrl("http://example.com:80/x")).toBe(
      "http://example.com/x",
    );
  });
});

describe("articleIdForUrl", () => {
  it("is deterministic for equivalent URLs", () => {
    const a = articleIdForUrl("https://www.example.com/post?utm_source=x#frag");
    const b = articleIdForUrl("https://example.com/post");
    expect(a).toBe(b);
  });

  it("differs for different URLs", () => {
    expect(articleIdForUrl("https://example.com/a")).not.toBe(
      articleIdForUrl("https://example.com/b"),
    );
  });

  it("returns a 32-char hex slug", () => {
    expect(articleIdForUrl("https://example.com/x")).toMatch(/^[a-f0-9]{32}$/);
  });
});
