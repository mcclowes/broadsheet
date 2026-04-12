import { describe, expect, it, beforeAll } from "vitest";
import { searchArticles } from "./search";
import { saveArticle } from "./articles";
import type { ParsedArticle } from "./ingest";

const USER = "test-user-search";

function makeParsed(title: string, body: string): ParsedArticle {
  return {
    title,
    byline: null,
    excerpt: null,
    siteName: null,
    lang: null,
    markdown: body,
    wordCount: body.split(/\s+/).length,
  };
}

describe("searchArticles", () => {
  beforeAll(async () => {
    await saveArticle(
      USER,
      "https://example.com/quantum-computing-guide",
      makeParsed(
        "Guide to quantum computing",
        "Quantum computing uses qubits and superposition to solve complex problems.",
      ),
    );
    await saveArticle(
      USER,
      "https://example.com/cooking-pasta",
      makeParsed(
        "How to cook perfect pasta",
        "Boil water with salt. Add pasta and cook until al dente.",
      ),
    );
    await saveArticle(
      USER,
      "https://example.com/quantum-mechanics-intro",
      makeParsed(
        "Introduction to quantum mechanics",
        "Quantum mechanics describes the behaviour of particles at the smallest scales.",
      ),
    );
  });

  it("returns matching articles ranked by score", async () => {
    const results = await searchArticles(USER, "quantum");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].title.toLowerCase()).toContain("quantum");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("returns empty for no matches", async () => {
    const results = await searchArticles(USER, "xyznonexistent");
    expect(results).toEqual([]);
  });

  it("returns empty for empty query", async () => {
    const results = await searchArticles(USER, "  ");
    expect(results).toEqual([]);
  });

  it("respects limit", async () => {
    const results = await searchArticles(USER, "quantum", { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("includes expected fields", async () => {
    const results = await searchArticles(USER, "pasta");
    expect(results.length).toBeGreaterThanOrEqual(1);
    const r = results[0];
    expect(r.id).toBeTruthy();
    expect(r.title).toBeTruthy();
    expect(r.url).toBeTruthy();
    expect(typeof r.readMinutes).toBe("number");
    expect(typeof r.score).toBe("number");
  });
});
