import { describe, expect, it } from "vitest";
import { buildDigestHtml, buildDigestSubject } from "./digest-email";
import type { ArticleSummary } from "./articles";

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
    image: null,
    wordCount: 500,
    readMinutes: 2,
    savedAt: "2026-04-10T00:00:00.000Z",
    readAt: null,
    archivedAt: null,
    tags: [],
    ...overrides,
  };
}

const BASE = "https://broadsheet.test";

describe("buildDigestSubject", () => {
  it("includes the formatted date", () => {
    const subject = buildDigestSubject(new Date("2026-04-12T07:00:00.000Z"));
    expect(subject).toContain("Broadsheet");
    expect(subject).toContain("2026");
  });
});

describe("buildDigestHtml", () => {
  it("returns valid HTML with masthead for non-empty articles", () => {
    const html = buildDigestHtml({
      articles: [make("1", { title: "Lead story" })],
      date: new Date("2026-04-12T07:00:00.000Z"),
      baseUrl: BASE,
      userId: "test-user",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Broadsheet");
    expect(html).toContain("Lead story");
    expect(html).toContain(`${BASE}/read/1`);
  });

  it("renders the empty state when no articles", () => {
    const html = buildDigestHtml({
      articles: [],
      date: new Date("2026-04-12T07:00:00.000Z"),
      baseUrl: BASE,
      userId: "test-user",
    });
    expect(html).toContain("No unread stories");
    expect(html).toContain(`${BASE}/library`);
  });

  it("renders lead, secondary, and wire sections", () => {
    const articles = Array.from({ length: 10 }, (_, i) =>
      make(`${i}`, { title: `Story ${i}`, source: `src${i}.com` }),
    );
    const html = buildDigestHtml({
      articles,
      date: new Date(),
      baseUrl: BASE,
      userId: "test-user",
    });

    // Lead
    expect(html).toContain("Story 0");
    // Secondary (articles 1-4)
    expect(html).toContain("Story 1");
    expect(html).toContain("Story 4");
    // Wire (articles 5+)
    expect(html).toContain("More from the wire");
    expect(html).toContain("Story 5");
    expect(html).toContain("Story 9");
  });

  it("escapes HTML in titles", () => {
    const html = buildDigestHtml({
      articles: [make("xss", { title: '<script>alert("xss")</script>' })],
      baseUrl: BASE,
      userId: "test-user",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes the story count in the masthead", () => {
    const html = buildDigestHtml({
      articles: [make("a"), make("b"), make("c")],
      baseUrl: BASE,
      userId: "test-user",
    });
    expect(html).toContain("3 stories");
  });

  it("uses singular 'story' for one article", () => {
    const html = buildDigestHtml({
      articles: [make("only")],
      baseUrl: BASE,
      userId: "test-user",
    });
    expect(html).toContain("1 story");
  });

  it("includes byline and excerpt when present", () => {
    const html = buildDigestHtml({
      articles: [
        make("rich", {
          title: "Rich article",
          byline: "Jane Doe",
          excerpt: "A fascinating piece about testing.",
        }),
      ],
      baseUrl: BASE,
      userId: "test-user",
    });
    expect(html).toContain("Jane Doe");
    expect(html).toContain("A fascinating piece about testing.");
  });

  it("includes footer with unsubscribe link", () => {
    const html = buildDigestHtml({
      articles: [make("a")],
      baseUrl: BASE,
      userId: "test-user",
    });
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("daily digest");
  });
});
