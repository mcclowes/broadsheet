import { describe, expect, it } from "vitest";
import { anchorSelection, articlePlainText } from "./anchor";

describe("articlePlainText", () => {
  it("strips markdown formatting", () => {
    const plain = articlePlainText("This is **bold** and *italic*.");
    expect(plain).toContain("This is bold and italic.");
  });

  it("strips markdown headings and links", () => {
    const plain = articlePlainText("# Title\n\n[a link](https://x.test).");
    expect(plain).toContain("Title");
    expect(plain).toContain("a link");
    expect(plain).not.toContain("https://x.test");
  });
});

describe("anchorSelection", () => {
  it("returns offsets when the selection text is found verbatim", () => {
    const markdown = "Some intro. The quick brown fox jumps. Outro.";
    const match = anchorSelection(markdown, "quick brown fox");
    expect(match).not.toBeNull();
    const plain = articlePlainText(markdown);
    expect(plain.slice(match!.start, match!.end)).toBe("quick brown fox");
  });

  it("returns null when the selection text is not found", () => {
    const markdown = "The article body says A.";
    expect(anchorSelection(markdown, "completely missing phrase")).toBeNull();
  });

  it("trims whitespace before searching", () => {
    const markdown = "Lead-in. Anchor text here. Trailing.";
    const match = anchorSelection(markdown, "  Anchor text here.  ");
    expect(match).not.toBeNull();
    const plain = articlePlainText(markdown);
    expect(plain.slice(match!.start, match!.end)).toBe("Anchor text here.");
  });

  it("returns null for empty / whitespace-only selection", () => {
    expect(anchorSelection("Body.", "")).toBeNull();
    expect(anchorSelection("Body.", "   ")).toBeNull();
  });

  it("anchors text inside a heading", () => {
    const markdown = "# A Heading\n\nBody paragraph.";
    const match = anchorSelection(markdown, "A Heading");
    expect(match).not.toBeNull();
  });

  it("anchors text containing inline-formatted spans", () => {
    // The selection comes from the visible text — bold/italic stripped.
    const markdown = "Lead. The **quick** brown fox jumps. Tail.";
    // Browser selection of "quick brown fox" gets the visible text.
    const match = anchorSelection(markdown, "quick brown fox");
    expect(match).not.toBeNull();
  });
});
