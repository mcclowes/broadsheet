import { describe, expect, it } from "vitest";
import {
  exportHighlightsMarkdown,
  exportHighlightsJson,
  exportHighlightsText,
  exportBibtex,
  exportArticles,
  type ArticleExportData,
} from "./export";
import type { ArticleSummary } from "./articles";

function makeArticle(
  id: string,
  overrides: Partial<ArticleSummary> = {},
): ArticleSummary {
  return {
    id,
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    source: "example.com",
    byline: "Jane Doe",
    excerpt: null,
    lang: null,
    wordCount: 500,
    readMinutes: 2,
    savedAt: "2026-04-10T00:00:00.000Z",
    readAt: null,
    archivedAt: null,
    tags: ["tech"],
    highlights: [],
    annotations: [],
    ...overrides,
  };
}

const sampleData: ArticleExportData[] = [
  {
    article: makeArticle("a1"),
    highlights: [
      {
        id: "h1",
        text: "This is an important quote",
        startOffset: 0,
        endOffset: 26,
        createdAt: "2026-04-10T01:00:00.000Z",
      },
      {
        id: "h2",
        text: "Another highlight",
        startOffset: 30,
        endOffset: 47,
        createdAt: "2026-04-10T02:00:00.000Z",
      },
    ],
    annotations: [
      {
        id: "ann1",
        body: "Linked to first highlight",
        highlightId: "h1",
        createdAt: "2026-04-10T01:30:00.000Z",
        updatedAt: "2026-04-10T01:30:00.000Z",
      },
      {
        id: "ann2",
        body: "General article note",
        highlightId: null,
        createdAt: "2026-04-10T03:00:00.000Z",
        updatedAt: "2026-04-10T03:00:00.000Z",
      },
    ],
  },
];

describe("exportHighlightsMarkdown", () => {
  it("includes article title, highlights, and annotations", () => {
    const md = exportHighlightsMarkdown(sampleData);
    expect(md).toContain("# Highlights & annotations");
    expect(md).toContain("## Article a1");
    expect(md).toContain("> This is an important quote");
    expect(md).toContain("*Note: Linked to first highlight*");
    expect(md).toContain("### Notes");
    expect(md).toContain("- General article note");
  });

  it("skips articles with no highlights or annotations", () => {
    const data: ArticleExportData[] = [
      { article: makeArticle("empty"), highlights: [], annotations: [] },
    ];
    const md = exportHighlightsMarkdown(data);
    expect(md).not.toContain("Article empty");
  });
});

describe("exportHighlightsJson", () => {
  it("produces valid JSON with expected structure", () => {
    const json = exportHighlightsJson(sampleData);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Article a1");
    expect(parsed[0].highlights).toHaveLength(2);
    expect(parsed[0].highlights[0].annotations).toHaveLength(1);
    expect(parsed[0].notes).toHaveLength(1);
  });
});

describe("exportHighlightsText", () => {
  it("produces plain text with quotes and notes", () => {
    const text = exportHighlightsText(sampleData);
    expect(text).toContain("Article a1");
    expect(text).toContain('"This is an important quote"');
    expect(text).toContain("Note: Linked to first highlight");
    expect(text).toContain("Note: General article note");
  });
});

describe("exportBibtex", () => {
  it("produces valid BibTeX entries", () => {
    const bib = exportBibtex([makeArticle("a1"), makeArticle("a2")]);
    expect(bib).toContain("@article{");
    expect(bib).toContain("title     = {Article a1}");
    expect(bib).toContain("author    = {Jane Doe}");
    expect(bib).toContain("url       = {https://example.com/a1}");
  });

  it("deduplicates BibTeX keys", () => {
    const articles = [
      makeArticle("a1", { savedAt: "2026-01-01T00:00:00.000Z" }),
      makeArticle("a2", { savedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const bib = exportBibtex(articles);
    expect(bib).toContain("@article{examplecom2026,");
    expect(bib).toContain("@article{examplecom20262,");
  });

  it("escapes special LaTeX characters", () => {
    const articles = [makeArticle("a1", { title: "100% of users & more" })];
    const bib = exportBibtex(articles);
    expect(bib).toContain("100\\% of users \\& more");
  });
});

describe("exportArticles", () => {
  it("dispatches to markdown format", () => {
    const result = exportArticles("markdown", sampleData);
    expect(result).toContain("# Highlights & annotations");
  });

  it("dispatches to json format", () => {
    const result = exportArticles("json", sampleData);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("dispatches to text format", () => {
    const result = exportArticles("text", sampleData);
    expect(result).toContain('"This is an important quote"');
  });

  it("dispatches to bibtex format", () => {
    const result = exportArticles("bibtex", sampleData);
    expect(result).toContain("@article{");
  });
});
