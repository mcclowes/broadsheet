import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders basic markdown to html", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** text.");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("strips <script> tags", () => {
    const html = renderMarkdown("Hello\n\n<script>alert('xss')</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert");
  });

  it("strips inline event handlers", () => {
    const html = renderMarkdown(
      '<a href="https://example.com" onclick="alert(1)">link</a>',
    );
    expect(html).toContain("https://example.com");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("alert");
  });

  it("strips javascript: URLs", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toMatch(/href\s*=\s*["']?javascript:/i);
  });

  it("strips <iframe> tags", () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain("<iframe");
  });

  it("preserves safe links and images", () => {
    const html = renderMarkdown(
      "![alt](https://example.com/img.jpg)\n\n[link](https://example.com)",
    );
    expect(html).toContain('src="https://example.com/img.jpg"');
    expect(html).toContain('href="https://example.com"');
  });

  it("renders GFM pipe tables as html tables", () => {
    const html = renderMarkdown(
      [
        "| Model | Score |",
        "| --- | --- |",
        "| GPT-OSS-120b | A+ |",
        "| Kimi K2 | B |",
      ].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>Model</th>");
    expect(html).toContain("<th>Score</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>GPT-OSS-120b</td>");
    expect(html).toContain("<td>A+</td>");
  });

  it("renders fenced code blocks", () => {
    const html = renderMarkdown("```js\nconsole.log('hi');\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code>");
    expect(html).toContain("console.log");
  });

  it("renders inline code", () => {
    const html = renderMarkdown("Use `npm install` to install.");
    expect(html).toContain("<code>npm install</code>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdown("> This is a quote.");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("This is a quote.");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
  });

  it("renders horizontal rules", () => {
    const html = renderMarkdown("Above\n\n---\n\nBelow");
    expect(html).toContain("<hr>");
  });

  it("renders emphasis and strong", () => {
    const html = renderMarkdown("*italic* and **bold**");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("handles empty input", () => {
    const html = renderMarkdown("");
    expect(html).toBe("");
  });

  it("always returns a string", () => {
    const result = renderMarkdown("hello");
    expect(typeof result).toBe("string");
  });

  it("strips <form> tags", () => {
    const html = renderMarkdown(
      '<form action="/submit"><input type="text" /></form>',
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("strips <object> and <embed> tags", () => {
    const html = renderMarkdown(
      '<object data="evil.swf"></object><embed src="evil.swf" />',
    );
    expect(html).not.toContain("<object");
    expect(html).not.toContain("<embed");
  });

  it("strips data: URIs from links", () => {
    const html = renderMarkdown(
      "[click](data:text/html,<script>alert(1)</script>)",
    );
    expect(html).not.toMatch(/href\s*=\s*["']?data:/i);
  });

  it("strips SVG-based XSS", () => {
    const html = renderMarkdown(
      '<svg onload="alert(1)"><circle r="10"/></svg>',
    );
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("onload");
  });

  it("strips <style> tags", () => {
    const html = renderMarkdown("<style>body { display: none }</style>Hello");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("display");
  });

  it("strips <meta> tags", () => {
    const html = renderMarkdown(
      '<meta http-equiv="refresh" content="0;url=evil">',
    );
    expect(html).not.toContain("<meta");
  });

  it("preserves raw html tables with colspan/rowspan/scope", () => {
    const html = renderMarkdown(
      [
        "<table>",
        "  <tbody>",
        '    <tr><th scope="row" rowspan="2">Q1</th><td colspan="2">Combined</td></tr>',
        "    <tr><td>Jan</td><td>Feb</td></tr>",
        "  </tbody>",
        "</table>",
      ].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toMatch(/<th\b[^>]*\bscope="row"/);
    expect(html).toMatch(/<th\b[^>]*\browspan="2"/);
    expect(html).toMatch(/<td\b[^>]*\bcolspan="2"/);
  });

  // ── External link behaviour ──────────────────────────────────────

  it("adds target=_blank and rel=noreferrer noopener to external links", () => {
    const html = renderMarkdown("[link](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("does not add target=_blank to fragment links", () => {
    const html = renderMarkdown("[section](#heading)");
    expect(html).not.toContain("target=");
  });

  it("does not add target=_blank to mailto links", () => {
    const html = renderMarkdown("[email](mailto:hi@example.com)");
    expect(html).not.toContain("target=");
  });

  // ── data: URI handling ───────────────────────────────────────────

  it("allows data:image URIs on img src", () => {
    const dataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const html = renderMarkdown(`![pixel](${dataUri})`);
    expect(html).toContain("data:image/png;base64,");
  });

  it("strips data:text/html URIs from links (XSS vector)", () => {
    const html = renderMarkdown(
      "[click](data:text/html,<script>alert(1)</script>)",
    );
    expect(html).not.toMatch(/href\s*=\s*["']?data:text/i);
  });

  it("strips data:text/html URIs from img src", () => {
    const html = renderMarkdown(
      '<img src="data:text/html,<script>alert(1)</script>" alt="">',
    );
    expect(html).not.toMatch(/src\s*=\s*["']?data:text/i);
  });

  // ── srcset XSS regression ────────────────────────────────────────

  it("strips javascript: URIs from srcset", () => {
    const html = renderMarkdown(
      '<img src="https://example.com/ok.jpg" srcset="javascript:alert(1) 1x">',
    );
    expect(html).not.toContain("javascript:");
  });

  it("preserves valid srcset with https URLs", () => {
    const html = renderMarkdown(
      '<img src="https://example.com/sm.jpg" srcset="https://example.com/lg.jpg 2x">',
    );
    expect(html).toContain("srcset");
    expect(html).toContain("https://example.com/lg.jpg");
  });

  // ── Explicit FORBID_TAGS ─────────────────────────────────────────

  it("strips <math> tags", () => {
    const html = renderMarkdown("<math><mi>x</mi></math>");
    expect(html).not.toContain("<math");
  });

  it("strips <base> tags", () => {
    const html = renderMarkdown('<base href="https://evil.example">');
    expect(html).not.toContain("<base");
  });

  it("strips <link> tags", () => {
    const html = renderMarkdown(
      '<link rel="stylesheet" href="https://evil.example/style.css">',
    );
    expect(html).not.toContain("<link");
  });

  // ── data-* attribute denial ──────────────────────────────────────

  it("strips data-* attributes", () => {
    const html = renderMarkdown(
      '<p data-tracking="secret" data-id="123">text</p>',
    );
    expect(html).not.toContain("data-tracking");
    expect(html).not.toContain("data-id");
    expect(html).toContain("text");
  });

  // ── width/height preservation ────────────────────────────────────

  it("preserves width and height on img", () => {
    const html = renderMarkdown(
      '<img src="https://example.com/img.jpg" width="300" height="200" alt="test">',
    );
    expect(html).toContain('width="300"');
    expect(html).toContain('height="200"');
  });

  // ── Real article shape: figure + figcaption ──────────────────────

  it("preserves figure with figcaption from real article HTML", () => {
    const html = renderMarkdown(
      [
        "<figure>",
        '  <img src="https://example.com/photo.jpg" alt="A photo">',
        "  <figcaption>Photo credit: Example</figcaption>",
        "</figure>",
      ].join("\n"),
    );
    expect(html).toContain("<figure>");
    expect(html).toContain("<figcaption>");
    expect(html).toContain("Photo credit: Example");
  });
});
