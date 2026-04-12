import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  parseArticleFromHtml,
  extractMetaImage,
  estimateReadMinutes,
  IngestError,
  isPrivateAddress,
  isHtmlContentType,
  charsetFromContentType,
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
    // Sanitised HTML should be present and contain no script tags
    expect(parsed.sanitizedHtml).toContain("first paragraph");
    expect(parsed.sanitizedHtml).not.toContain("<script");
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

  it("preserves newlines in <pre> blocks without <code>", () => {
    const preHtml = `<!doctype html>
<html><head><title>Poem</title></head>
<body><article>
<h1>Poem</h1>
<p>A paragraph before the poem with enough content to satisfy the readability heuristic for article extraction.</p>
<pre>line one
                  line two
line three</pre>
<p>A paragraph after the poem with more content to keep the readability algorithm happy about extraction.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(preHtml, "https://example.com/poem");
    expect(parsed.markdown).toContain("```\nline one\n");
    expect(parsed.markdown).toContain("                  line two\n");
    expect(parsed.markdown).toContain("line three\n```");
  });

  it("preserves <pre><code> blocks unchanged", () => {
    const codeHtml = `<!doctype html>
<html><head><title>Code</title></head>
<body><article>
<h1>Code</h1>
<p>A paragraph before the code with enough content to satisfy the readability heuristic for article extraction.</p>
<pre><code>const x = 1;
const y = 2;</code></pre>
<p>A paragraph after the code with more content to keep the readability algorithm happy about extraction.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(codeHtml, "https://example.com/code");
    expect(parsed.markdown).toContain("```\nconst x = 1;\nconst y = 2;\n```");
  });

  it("flattens Docusaurus/Prism highlighted code blocks into fenced markdown with line breaks", () => {
    const highlighted = `<!doctype html>
<html><head><title>Poem</title></head>
<body><article>
<h1>Poem</h1>
<p>A paragraph before the poem with enough content to satisfy the readability heuristic for article extraction of this page.</p>
<pre class="prism-code language-text"><code class="language-text"><div class="token-line"><span class="token plain">line one____________</span><br></div><div class="token-line"><span class="token plain">line two____________</span><br></div><div class="token-line"><span class="token plain">line three</span></div></code></pre>
<p>A paragraph after the poem with more content to keep the readability algorithm happy about extraction of this page.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(
      highlighted,
      "https://example.com/highlighted",
    );
    expect(parsed.markdown).toContain(
      "```\nline one____________\nline two____________\nline three\n```",
    );
  });

  it("preserves images with absolute src", () => {
    const imgHtml = `<!doctype html>
<html><head><title>Images</title></head>
<body><article>
<h1>Images</h1>
<p>A paragraph with enough content to satisfy the readability heuristic for article extraction and keep the parser happy.</p>
<img src="https://cdn.example.com/photo.jpg" alt="A photo">
<p>Another paragraph with enough content to keep the readability algorithm happy about extraction of this article.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(imgHtml, "https://example.com/images");
    expect(parsed.markdown).toContain(
      "![A photo](https://cdn.example.com/photo.jpg)",
    );
  });

  it("resolves lazy-loaded images with data-src", () => {
    const lazyHtml = `<!doctype html>
<html><head><title>Lazy</title></head>
<body><article>
<h1>Lazy images</h1>
<p>A paragraph with enough content to satisfy the readability heuristic for article extraction and keep the parser happy.</p>
<img src="" data-src="/images/lazy.jpg" alt="Lazy photo">
<p>Another paragraph with enough content to keep the readability algorithm happy about extraction of this article.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(lazyHtml, "https://example.com/lazy");
    expect(parsed.markdown).toContain(
      "![Lazy photo](https://example.com/images/lazy.jpg)",
    );
  });

  it("preserves figure and figcaption in sanitised HTML", () => {
    const figureHtml = `<!doctype html><html><head><title>Photo Essay</title></head>
<body><article>
  <h1>Photo Essay</h1>
  <p>An introduction paragraph with enough words to make readability happy about the content length.</p>
  <figure>
    <img src="https://cdn.example.com/photo.jpg" alt="A landscape">
    <figcaption>Photo credit: Jane Doe</figcaption>
  </figure>
  <p>Another paragraph with more content to keep readability satisfied with word count requirements.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(
      figureHtml,
      "https://example.com/essay",
    );
    expect(parsed.sanitizedHtml).toContain("<figure>");
    expect(parsed.sanitizedHtml).toContain("<figcaption>");
    expect(parsed.sanitizedHtml).toContain("Photo credit: Jane Doe");
    expect(parsed.sanitizedHtml).toContain(
      'src="https://cdn.example.com/photo.jpg"',
    );
  });

  it("throws IngestError when no readable content is found", () => {
    const empty = "<!doctype html><html><body></body></html>";
    expect(() => parseArticleFromHtml(empty, "https://example.com")).toThrow(
      IngestError,
    );
  });

  it("throws IngestError for paywall teasers (too few words)", () => {
    const stubHtml = `<!doctype html><html><head><title>Premium Article</title></head>
<body><article>
  <h1>Premium Article</h1>
  <p>Subscribe now to read this article.</p>
</article></body></html>`;
    expect(() =>
      parseArticleFromHtml(stubHtml, "https://example.com/premium"),
    ).toThrow(IngestError);
    try {
      parseArticleFromHtml(stubHtml, "https://example.com/premium");
    } catch (err) {
      expect((err as IngestError).publicMessage).toContain(
        "paywall teaser or stub",
      );
    }
  });

  describe("real-world article fixtures", () => {
    const fixtureDir = join(__dirname, "__fixtures__", "articles");
    const cases: Array<{
      file: string;
      url: string;
      titleIncludes: string;
      markdownIncludes: string[];
      minWordCount: number;
    }> = [
      {
        file: "mcclowes-rat.html",
        url: "https://mcclowes.com/blog/2026/04/09/rat",
        titleIncludes: "Rat",
        markdownIncludes: ["```\nplay in car park", "with ultrasonic laughter"],
        minWordCount: 20,
      },
      {
        file: "wikipedia-read-it-later.html",
        url: "https://en.wikipedia.org/wiki/Read_it_later",
        titleIncludes: "Read it later",
        markdownIncludes: ["Read it later"],
        minWordCount: 100,
      },
      {
        file: "overreacted-chain-reaction.html",
        url: "https://overreacted.io/a-chain-reaction/",
        titleIncludes: "Chain Reaction",
        markdownIncludes: ["chain reaction"],
        minWordCount: 300,
      },
      {
        file: "paulgraham-greatwork.html",
        url: "https://paulgraham.com/greatwork.html",
        titleIncludes: "Great Work",
        markdownIncludes: ["curiosity"],
        minWordCount: 1000,
      },
    ];

    for (const c of cases) {
      it(`extracts ${c.file}`, () => {
        const html = readFileSync(join(fixtureDir, c.file), "utf8");
        const parsed = parseArticleFromHtml(html, c.url);
        expect(parsed.title).toContain(c.titleIncludes);
        expect(parsed.wordCount).toBeGreaterThanOrEqual(c.minWordCount);
        for (const snippet of c.markdownIncludes) {
          expect(parsed.markdown).toContain(snippet);
        }
      });
    }
  });

  it("truncates overly long title", () => {
    const longTitle = "A".repeat(600);
    const bodyParagraphs = Array(20)
      .fill(
        "<p>This paragraph has enough words to pass the low word count threshold for ingestion.</p>",
      )
      .join("\n");
    const html = `<!doctype html><html><head><title>${longTitle}</title></head>
<body><article>
  <h1>${longTitle}</h1>
  ${bodyParagraphs}
</article></body></html>`;
    const parsed = parseArticleFromHtml(html, "https://example.com/long");
    expect(parsed.title.length).toBeLessThanOrEqual(500);
    expect(parsed.title.endsWith("…")).toBe(true);
  });
});

describe("extractMetaImage", () => {
  function makeDoc(headMeta: string) {
    const dom = new JSDOM(
      `<!doctype html><html><head>${headMeta}</head><body></body></html>`,
      { url: "https://example.com/article" },
    );
    return dom.window.document;
  }

  it("extracts og:image", () => {
    const doc = makeDoc(
      '<meta property="og:image" content="https://cdn.example.com/hero.jpg" />',
    );
    expect(extractMetaImage(doc, "https://example.com/article")).toBe(
      "https://cdn.example.com/hero.jpg",
    );
  });

  it("falls back to twitter:image when og:image is absent", () => {
    const doc = makeDoc(
      '<meta name="twitter:image" content="https://cdn.example.com/twitter.jpg" />',
    );
    expect(extractMetaImage(doc, "https://example.com/article")).toBe(
      "https://cdn.example.com/twitter.jpg",
    );
  });

  it("resolves relative URLs against the base", () => {
    const doc = makeDoc(
      '<meta property="og:image" content="/images/hero.jpg" />',
    );
    expect(extractMetaImage(doc, "https://example.com/article")).toBe(
      "https://example.com/images/hero.jpg",
    );
  });

  it("returns null when no image meta tags exist", () => {
    const doc = makeDoc('<meta name="author" content="Jane" />');
    expect(extractMetaImage(doc, "https://example.com/article")).toBeNull();
  });

  it("prefers og:image over twitter:image", () => {
    const doc = makeDoc(
      '<meta property="og:image" content="https://cdn.example.com/og.jpg" />' +
        '<meta name="twitter:image" content="https://cdn.example.com/tw.jpg" />',
    );
    expect(extractMetaImage(doc, "https://example.com/article")).toBe(
      "https://cdn.example.com/og.jpg",
    );
  });
});

describe("parseArticleFromHtml – image extraction", () => {
  it("extracts og:image into parsed result", () => {
    const html = `<!doctype html>
<html><head>
  <title>Hero test</title>
  <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
</head>
<body><article>
  <h1>Hero test</h1>
  <p>A paragraph with enough content to satisfy the readability heuristic for article extraction and keep the parser happy.</p>
  <p>Another paragraph with enough content to keep the readability algorithm happy about extraction of this article.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(html, "https://example.com/hero");
    expect(parsed.image).toBe("https://cdn.example.com/hero.jpg");
  });

  it("returns null image when no meta image tags exist", () => {
    const html = `<!doctype html>
<html><head><title>No image</title></head>
<body><article>
  <h1>No image</h1>
  <p>A paragraph with enough content to satisfy the readability heuristic for article extraction and keep the parser happy.</p>
  <p>Another paragraph with enough content to keep the readability algorithm happy about extraction of this article.</p>
</article></body></html>`;
    const parsed = parseArticleFromHtml(html, "https://example.com/no-image");
    expect(parsed.image).toBeNull();
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
    "fe90::1",
    "fea0::1",
    "febf::1",
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

describe("charsetFromContentType", () => {
  it("extracts charset from Content-Type header", () => {
    expect(charsetFromContentType("text/html; charset=iso-8859-1")).toBe(
      "iso-8859-1",
    );
    expect(charsetFromContentType("text/html; charset=shift_jis")).toBe(
      "shift_jis",
    );
    expect(charsetFromContentType("text/html;charset=utf-8")).toBe("utf-8");
    expect(charsetFromContentType('text/html; charset="windows-1252"')).toBe(
      "windows-1252",
    );
  });

  it("returns undefined when no charset specified", () => {
    expect(charsetFromContentType("text/html")).toBeUndefined();
    expect(charsetFromContentType(null)).toBeUndefined();
  });
});
