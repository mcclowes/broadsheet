import { describe, expect, it } from "vitest";
import { markdownToPlainText, prepareText, MAX_TEXT_LENGTH } from "./narration";

describe("markdownToPlainText", () => {
  it("strips headings", () => {
    expect(markdownToPlainText("# Hello\n\nWorld")).toBe("Hello World");
  });

  it("strips bold and italic", () => {
    expect(markdownToPlainText("This is **bold** and *italic*")).toBe(
      "This is bold and italic",
    );
  });

  it("strips links but keeps text", () => {
    expect(markdownToPlainText("Visit [Example](https://example.com)")).toBe(
      "Visit Example",
    );
  });

  it("strips images", () => {
    expect(markdownToPlainText("Before ![alt text](img.png) after")).toBe(
      "Before after",
    );
  });

  it("strips code blocks", () => {
    const md = "Before\n\n```js\nconsole.log('hi');\n```\n\nAfter";
    expect(markdownToPlainText(md)).toBe("Before console.log('hi'); After");
  });

  it("strips inline code", () => {
    expect(markdownToPlainText("Use the `render` function")).toBe(
      "Use the render function",
    );
  });

  it("handles lists", () => {
    const md = "- One\n- Two\n- Three";
    expect(markdownToPlainText(md)).toBe("One Two Three");
  });

  it("collapses whitespace", () => {
    expect(markdownToPlainText("Hello\n\n\n\nWorld")).toBe("Hello World");
  });

  it("returns empty string for empty input", () => {
    expect(markdownToPlainText("")).toBe("");
  });

  it("handles blockquotes", () => {
    expect(markdownToPlainText("> Quoted text\n\nNormal text")).toBe(
      "Quoted text Normal text",
    );
  });

  it("handles HTML entities in markdown", () => {
    expect(markdownToPlainText("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });
});

describe("prepareText", () => {
  it("returns full text when under limit", () => {
    const { text, truncated } = prepareText("Hello world");
    expect(text).toBe("Hello world");
    expect(truncated).toBe(false);
  });

  it("truncates long text at sentence boundary", () => {
    // Build text that exceeds the limit.
    const sentence = "This is a sentence. ";
    const longText = sentence.repeat(
      Math.ceil(MAX_TEXT_LENGTH / sentence.length) + 10,
    );
    const { text, truncated } = prepareText(longText);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    // Should end at a sentence boundary.
    expect(text).toMatch(/\.$/);
  });

  it("handles markdown in truncated text", () => {
    const word = "**bold** word. ";
    const longMd = word.repeat(Math.ceil(MAX_TEXT_LENGTH / 10) + 10);
    const { text, truncated } = prepareText(longMd);
    expect(truncated).toBe(true);
    // Markdown should be stripped.
    expect(text).not.toContain("**");
  });
});
