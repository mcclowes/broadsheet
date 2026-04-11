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
    const html = renderMarkdown('<a href="https://example.com" onclick="alert(1)">link</a>');
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
});
