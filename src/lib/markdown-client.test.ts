/**
 * Tests for the client-side markdown renderer.
 *
 * markdown-client.ts uses browser-native DOMPurify (not isomorphic-dompurify),
 * so we run under jsdom via Vitest environment. The sanitisation config mirrors
 * the server-side renderer in markdown.ts — these tests verify that the client
 * path also blocks XSS vectors.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { renderMarkdownClient } from "./markdown-client";

describe("renderMarkdownClient", () => {
  it("renders basic markdown to HTML", () => {
    const html = renderMarkdownClient("Hello **world**");
    expect(html).toContain("<strong>world</strong>");
  });

  it("renders headings", () => {
    const html = renderMarkdownClient("# Heading 1\n## Heading 2");
    expect(html).toContain("<h1>Heading 1</h1>");
    expect(html).toContain("<h2>Heading 2</h2>");
  });

  it("renders links with href", () => {
    const html = renderMarkdownClient("[click](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("click</a>");
  });

  it("renders images with alt text", () => {
    const html = renderMarkdownClient(
      "![photo](https://cdn.example.com/img.jpg)",
    );
    expect(html).toContain("<img");
    expect(html).toContain('src="https://cdn.example.com/img.jpg"');
    expect(html).toContain('alt="photo"');
  });

  it("renders code blocks", () => {
    const html = renderMarkdownClient("```\nconst x = 1;\n```");
    expect(html).toContain("<code>");
    expect(html).toContain("const x = 1;");
  });

  it("renders inline code", () => {
    const html = renderMarkdownClient("Use `npm install` to install");
    expect(html).toContain("<code>npm install</code>");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdownClient("- item 1\n- item 2");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item 1</li>");
    expect(html).toContain("<li>item 2</li>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdownClient("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdownClient("> quoted text");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("quoted text");
  });

  it("renders GFM tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = renderMarkdownClient(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders horizontal rules", () => {
    const html = renderMarkdownClient("---");
    expect(html).toContain("<hr>");
  });

  it("returns empty string for empty input", () => {
    const html = renderMarkdownClient("");
    expect(html).toBe("");
  });
});

describe("renderMarkdownClient – XSS prevention", () => {
  it("strips <script> tags", () => {
    const html = renderMarkdownClient('<script>alert("xss")</script>Hello');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert");
  });

  it("strips javascript: URLs from links", () => {
    const html = renderMarkdownClient('[click](javascript:alert("xss"))');
    expect(html).not.toContain("javascript:");
  });

  it("strips event handler attributes", () => {
    const html = renderMarkdownClient('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("strips executable content from data: URIs in images", () => {
    const html = renderMarkdownClient(
      "![x](data:text/html,<script>alert(1)</script>)",
    );
    // data: URIs in <img src> are inert (images can't execute scripts).
    // The important thing is that <script> tags don't appear unencoded.
    expect(html).not.toContain("<script>");
  });

  it("strips <iframe> tags", () => {
    const html = renderMarkdownClient(
      '<iframe src="https://evil.com"></iframe>',
    );
    expect(html).not.toContain("<iframe");
  });

  it("strips <form> tags", () => {
    const html = renderMarkdownClient(
      '<form action="https://evil.com"><input></form>',
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("strips style attributes", () => {
    const html = renderMarkdownClient(
      '<p style="background:url(javascript:alert(1))">text</p>',
    );
    expect(html).not.toContain("style=");
  });

  it("strips SVG with embedded scripts", () => {
    const html = renderMarkdownClient(
      '<svg onload="alert(1)"><circle r="10"/></svg>',
    );
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("onload");
  });

  it("allows safe elements through", () => {
    const md = "**bold** and *italic* and [link](https://safe.com)";
    const html = renderMarkdownClient(md);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain('href="https://safe.com"');
  });
});
