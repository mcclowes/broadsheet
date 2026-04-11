import { describe, expect, it } from "vitest";
import {
  parseArticleFromHtml,
  estimateReadMinutes,
  IngestError,
  isPrivateAddress,
  isHtmlContentType,
} from "./ingest";

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

describe("isPrivateAddress", () => {
  it.each([
    "0.0.0.0",
    "127.0.0.1",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("flags %s as private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "2606:4700::1111"])(
    "allows public address %s",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );

  it("rejects malformed input", () => {
    expect(isPrivateAddress("not an ip")).toBe(true);
    expect(isPrivateAddress("999.999.999.999")).toBe(true);
  });
});

describe("isHtmlContentType", () => {
  it("accepts text/html and xhtml with parameters", () => {
    expect(isHtmlContentType("text/html")).toBe(true);
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("application/xhtml+xml")).toBe(true);
  });

  it("rejects non-html types", () => {
    expect(isHtmlContentType(null)).toBe(false);
    expect(isHtmlContentType("")).toBe(false);
    expect(isHtmlContentType("application/pdf")).toBe(false);
    expect(isHtmlContentType("application/json")).toBe(false);
    expect(isHtmlContentType("image/png")).toBe(false);
  });
});
