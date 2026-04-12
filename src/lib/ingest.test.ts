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
    const parsed = parseArticleFromHtml(
      sampleHtml,
      "https://example.com/article",
    );
    expect(parsed.title).toBe("Test Article");
    expect(parsed.markdown).toContain("first paragraph");
    expect(parsed.markdown).toContain("## Subheading");
    expect(parsed.markdown).toMatch(/\[a link\]\(https:\/\/example\.com\/?\)/);
    expect(parsed.wordCount).toBeGreaterThan(20);
  });

  it("converts tables with a header row to GFM pipe tables", () => {
    const tableHtml = `<!doctype html>
<html>
  <head><title>Benchmark results</title></head>
  <body>
    <article>
      <h1>Benchmark results</h1>
      <p>We ran three open-weights models through the same security evaluation harness. Each task tests whether the model can correctly classify the described bug when given the full diff and surrounding context.</p>
      <p>The results below include a grading column for the hardest task, recovering the full public chain from a partial fingerprint, which none of the smaller models could solve end-to-end.</p>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>OWASP false-positive</th>
            <th>FreeBSD NFS detection</th>
            <th>OpenBSD SACK analysis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GPT-OSS-120b (5.1B active)</td>
            <td>No</td>
            <td>Yes</td>
            <td>Yes (A+)</td>
          </tr>
          <tr>
            <td>GPT-OSS-20b (3.6B active)</td>
            <td>Yes</td>
            <td>Yes</td>
            <td>No (C)</td>
          </tr>
          <tr>
            <td>Kimi K2 (open-weights)</td>
            <td>Yes</td>
            <td>Yes</td>
            <td>No</td>
          </tr>
        </tbody>
      </table>
      <p>The 120b model was the only one to recover the full public chain, though it still false-positived on the OWASP baseline. We discuss the failure modes and what they mean for production use in the remainder of the article.</p>
    </article>
  </body>
</html>`;
    const parsed = parseArticleFromHtml(
      tableHtml,
      "https://example.com/benchmark",
    );
    // Header row
    expect(parsed.markdown).toMatch(
      /\|\s*Model\s*\|\s*OWASP false-positive\s*\|\s*FreeBSD NFS detection\s*\|\s*OpenBSD SACK analysis\s*\|/,
    );
    // GFM separator row
    expect(parsed.markdown).toMatch(
      /\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|/,
    );
    // A data cell stays on the same row as the model name (not split into paragraphs)
    expect(parsed.markdown).toMatch(
      /\|\s*GPT-OSS-120b \(5\.1B active\)\s*\|\s*No\s*\|\s*Yes\s*\|\s*Yes \(A\+\)\s*\|/,
    );
  });

  it("throws IngestError when no readable content is found", () => {
    const empty = "<!doctype html><html><body></body></html>";
    expect(() => parseArticleFromHtml(empty, "https://example.com")).toThrow(
      IngestError,
    );
  });
});

describe("estimateReadMinutes", () => {
  it("returns at least 1 minute", () => {
    expect(estimateReadMinutes(10)).toBe(1);
  });

  it("returns 1 for zero words", () => {
    expect(estimateReadMinutes(0)).toBe(1);
  });

  it("scales with word count", () => {
    expect(estimateReadMinutes(2200)).toBe(10);
  });

  it("rounds to nearest minute", () => {
    // 220 words / 220 wpm = 1 minute exactly
    expect(estimateReadMinutes(220)).toBe(1);
    // 330 words / 220 wpm ≈ 1.5 → rounds to 2
    expect(estimateReadMinutes(330)).toBe(2);
  });
});

describe("parseArticleFromHtml – edge cases", () => {
  it("falls back to 'Untitled' when <title> is empty", () => {
    const html = `<!doctype html>
      <html><head><title></title></head>
      <body><article>
        <p>First paragraph of enough length to satisfy readability heuristics for article content extraction.</p>
        <p>Second paragraph with more words to ensure readability accepts this as valid article content worth parsing.</p>
        <p>Third paragraph providing additional context and substance to the test article body for reliable extraction.</p>
      </article></body></html>`;
    const parsed = parseArticleFromHtml(html, "https://example.com/no-title");
    expect(parsed.title).toBe("Untitled");
  });

  it("extracts byline from meta tag", () => {
    const parsed = parseArticleFromHtml(
      sampleHtml,
      "https://example.com/article",
    );
    expect(parsed.byline).toBe("Jane Writer");
  });

  it("counts words in the markdown output", () => {
    const parsed = parseArticleFromHtml(
      sampleHtml,
      "https://example.com/article",
    );
    expect(parsed.wordCount).toBeGreaterThan(0);
    expect(typeof parsed.wordCount).toBe("number");
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

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1",
    "172.32.0.1",
    "2606:4700::1111",
  ])("allows public address %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isPrivateAddress("not an ip")).toBe(true);
    expect(isPrivateAddress("999.999.999.999")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isPrivateAddress("")).toBe(true);
  });

  it("flags IPv4-mapped IPv6 private addresses", () => {
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.1")).toBe(true);
  });

  it("allows IPv4-mapped IPv6 public addresses", () => {
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("flags multicast IPv4 range (224+)", () => {
    expect(isPrivateAddress("239.255.255.255")).toBe(true);
    expect(isPrivateAddress("255.255.255.255")).toBe(true);
  });

  it("allows addresses just outside private ranges", () => {
    expect(isPrivateAddress("100.63.255.255")).toBe(false);
    expect(isPrivateAddress("100.128.0.1")).toBe(false);
    expect(isPrivateAddress("11.0.0.1")).toBe(false);
  });
});

describe("IngestError", () => {
  it("exposes publicMessage separately from internal message", () => {
    const err = new IngestError(
      "DNS lookup failed for internal.corp: NXDOMAIN",
      undefined,
      "Could not resolve the host",
    );
    expect(err.message).toBe("DNS lookup failed for internal.corp: NXDOMAIN");
    expect(err.publicMessage).toBe("Could not resolve the host");
    expect(err.name).toBe("IngestError");
  });

  it("defaults publicMessage to the internal message", () => {
    const err = new IngestError("Something broke");
    expect(err.publicMessage).toBe("Something broke");
  });

  it("preserves the cause", () => {
    const cause = new Error("root");
    const err = new IngestError("Wrapper", cause);
    expect(err.cause).toBe(cause);
  });

  it("is instanceof Error", () => {
    const err = new IngestError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IngestError);
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
