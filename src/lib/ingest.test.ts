import { describe, expect, it } from "vitest";
import { parseArticleFromHtml, estimateReadMinutes, IngestError } from "./ingest";

const sampleHtml = `<!doctype html>
<html>
  <head>
    <title>Test Article</title>
    <meta name="author" content="Jane Writer" />
  </head>
  <body>
    <article>
      <h1>Test Article</h1>
      <p>This is the first paragraph of a test article. It has enough words to be parseable by Readability.</p>
      <p>Here is a second paragraph with <a href="https://example.com">a link</a> and <strong>bold text</strong>.</p>
      <h2>Subheading</h2>
      <p>Another paragraph under the subheading so the parser is confident this is a real article body worth keeping.</p>
    </article>
  </body>
</html>`;

describe("parseArticleFromHtml", () => {
  it("extracts title and converts body to markdown", () => {
    const parsed = parseArticleFromHtml(sampleHtml, "https://example.com/article");
    expect(parsed.title).toBe("Test Article");
    expect(parsed.markdown).toContain("first paragraph");
    expect(parsed.markdown).toContain("## Subheading");
    expect(parsed.markdown).toMatch(/\[a link\]\(https:\/\/example\.com\/?\)/);
    expect(parsed.wordCount).toBeGreaterThan(20);
  });

  it("throws IngestError when no readable content is found", () => {
    const empty = "<!doctype html><html><body></body></html>";
    expect(() => parseArticleFromHtml(empty, "https://example.com")).toThrow(IngestError);
  });
});

describe("estimateReadMinutes", () => {
  it("returns at least 1 minute", () => {
    expect(estimateReadMinutes(10)).toBe(1);
  });

  it("scales with word count", () => {
    expect(estimateReadMinutes(2200)).toBe(10);
  });
});
