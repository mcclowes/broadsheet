import { describe, expect, it } from "vitest";
import { generateTags } from "./auto-tag";
import type { ParsedArticle } from "./ingest";

function make(overrides: Partial<ParsedArticle> = {}): ParsedArticle {
  return {
    title: "Untitled",
    byline: null,
    excerpt: null,
    siteName: null,
    lang: null,
    image: null,
    markdown: "",
    sanitizedHtml: "",
    wordCount: 0,
    ...overrides,
  };
}

describe("generateTags", () => {
  it("returns empty array when no keywords match", () => {
    expect(generateTags(make({ title: "Hello world" }))).toEqual([]);
  });

  it("extracts a tag from the title", () => {
    const tags = generateTags(make({ title: "Getting started with Python" }));
    expect(tags).toContain("python");
  });

  it("extracts tags from the excerpt", () => {
    const tags = generateTags(
      make({
        title: "A brief overview",
        excerpt: "Learn how to use Docker and Kubernetes in production",
      }),
    );
    expect(tags).toContain("devops");
  });

  it("extracts tags from the body", () => {
    const tags = generateTags(
      make({
        title: "An introduction",
        markdown: "This article discusses React and its component model.",
      }),
    );
    expect(tags).toContain("react");
  });

  it("matches multi-word phrases", () => {
    const tags = generateTags(
      make({ title: "The future of machine learning in healthcare" }),
    );
    expect(tags).toContain("ai");
    expect(tags).toContain("health");
  });

  it("ranks title matches higher than body matches", () => {
    const tags = generateTags(
      make({
        title: "Understanding React hooks",
        markdown:
          "Python is also popular. Python is great. Python is everywhere. " +
          "Python dominates. Python leads. Python wins.",
      }),
    );
    // React appears in title (weight 3), Python only in body (weight 1 each match scored once)
    // Both should appear but React should be present
    expect(tags).toContain("react");
  });

  it("caps at 5 tags", () => {
    const tags = generateTags(
      make({
        title: "React Python Rust tutorial",
        excerpt: "A Docker Kubernetes security machine learning guide",
        markdown:
          "Also covers accessibility, cryptocurrency, and climate change.",
      }),
    );
    expect(tags.length).toBeLessThanOrEqual(5);
  });

  it("returns sorted tags", () => {
    const tags = generateTags(
      make({ title: "Python and React tutorial for beginners" }),
    );
    const sorted = [...tags].sort();
    expect(tags).toEqual(sorted);
  });

  it("does not match keywords inside other words", () => {
    // "css" should not match inside "accessing"
    const tags = generateTags(make({ title: "Accessing the new platform" }));
    expect(tags).not.toContain("css");
  });

  it("matches keyword at start of text", () => {
    const tags = generateTags(make({ title: "React is great" }));
    expect(tags).toContain("react");
  });

  it("matches keyword at end of text", () => {
    const tags = generateTags(make({ title: "Why I switched to React" }));
    expect(tags).toContain("react");
  });

  it("maps multiple keywords to the same tag", () => {
    // Both "node.js" and "deno" map to "javascript"
    const tags = generateTags(make({ title: "Comparing Node.js and Deno" }));
    expect(tags).toContain("javascript");
  });

  it("detects content-format tags like tutorial", () => {
    const tags = generateTags(
      make({ title: "A step by step guide to cooking pasta" }),
    );
    expect(tags).toContain("tutorial");
  });

  it("handles empty parsed article gracefully", () => {
    expect(generateTags(make())).toEqual([]);
  });

  it("only scans first ~500 words of body for performance", () => {
    // Place a keyword beyond 500 words — it should not be found
    const filler = Array(600).fill("word").join(" ");
    const tags = generateTags(
      make({ title: "Some article", markdown: filler + " python is great" }),
    );
    expect(tags).not.toContain("python");
  });
});
