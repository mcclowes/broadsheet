import { describe, it, expect } from "vitest";
import {
  generatePoem,
  generateWordScrambles,
  generateQuiz,
  type FoundPoem,
  type WordScramble,
  type QuizQuestion,
} from "./diversions";
import type { ArticleSummary } from "./articles";

function makeArticle(overrides: Partial<ArticleSummary> = {}): ArticleSummary {
  const id = overrides.id ?? "abcdef1234567890abcdef1234567890";
  return {
    id,
    title: "Default title for testing",
    url: "https://example.com/article",
    source: "Example",
    byline: "Author Name",
    excerpt: "A short excerpt about the article.",
    lang: "en",
    wordCount: 1200,
    readMinutes: 5,
    savedAt: "2026-04-12T10:00:00Z",
    readAt: null,
    archivedAt: null,
    tags: ["tech"],
    ...overrides,
  };
}

function makeArticles(count: number): ArticleSummary[] {
  return Array.from({ length: count }, (_, i) =>
    makeArticle({
      id: `id_${String(i).padStart(4, "0")}_abcdefabcdefabcdef`,
      title: `Article number ${i + 1} about interesting topics`,
      source: i % 3 === 0 ? "TechBlog" : i % 3 === 1 ? "NewsDaily" : "Verge",
      readMinutes: 3 + (i % 8),
      tags: [`tag${i % 4}`],
    }),
  );
}

describe("generatePoem", () => {
  it("returns a poem with a title and non-empty lines", () => {
    const articles = makeArticles(12);
    const poem: FoundPoem = generatePoem(articles);

    expect(poem.title).toBe("Found poetry");
    expect(poem.lines.length).toBeGreaterThan(0);
    // Should contain at least one blank line (stanza break)
    expect(poem.lines).toContain("");
  });

  it("produces deterministic output for the same articles", () => {
    const articles = makeArticles(12);
    const poem1 = generatePoem(articles);
    const poem2 = generatePoem(articles);

    expect(poem1).toEqual(poem2);
  });

  it("produces different output for different articles", () => {
    const a = makeArticles(12);
    const b = makeArticles(12).map((art, i) => ({
      ...art,
      id: `different_${i}_xxxxxxxxxxxxxx`,
    }));
    const poemA = generatePoem(a);
    const poemB = generatePoem(b);

    // Lines should differ (titles are shuffled differently)
    expect(poemA.lines).not.toEqual(poemB.lines);
  });

  it("lines are lowercased and stripped of trailing punctuation", () => {
    const articles = makeArticles(12).map((a, i) => ({
      ...a,
      title: `Capitalised Title ${i}!`,
    }));
    const poem = generatePoem(articles);
    const nonEmpty = poem.lines.filter((l) => l !== "");
    for (const line of nonEmpty) {
      expect(line[0]).toBe(line[0].toLowerCase());
      expect(line).not.toMatch(/[.!?,;:]$/);
    }
  });
});

describe("generateWordScrambles", () => {
  it("returns between 1 and 5 scrambles", () => {
    const articles = makeArticles(12);
    const scrambles: WordScramble[] = generateWordScrambles(articles);

    expect(scrambles.length).toBeGreaterThanOrEqual(1);
    expect(scrambles.length).toBeLessThanOrEqual(5);
  });

  it("scrambled letters are an anagram of the answer", () => {
    const articles = makeArticles(12);
    const scrambles = generateWordScrambles(articles);

    for (const s of scrambles) {
      const sortedScrambled = s.scrambled.split("").sort().join("");
      const sortedAnswer = s.answer.split("").sort().join("");
      expect(sortedScrambled).toBe(sortedAnswer);
    }
  });

  it("answers are lowercase and between 5–10 characters", () => {
    const articles = makeArticles(15);
    const scrambles = generateWordScrambles(articles);

    for (const s of scrambles) {
      expect(s.answer).toBe(s.answer.toLowerCase());
      expect(s.answer.length).toBeGreaterThanOrEqual(5);
      expect(s.answer.length).toBeLessThanOrEqual(10);
    }
  });

  it("each scramble has a hint that is an article title", () => {
    const articles = makeArticles(12);
    const titles = new Set(articles.map((a) => a.title));
    const scrambles = generateWordScrambles(articles);

    for (const s of scrambles) {
      expect(titles.has(s.hint)).toBe(true);
    }
  });

  it("is deterministic", () => {
    const articles = makeArticles(12);
    expect(generateWordScrambles(articles)).toEqual(
      generateWordScrambles(articles),
    );
  });
});

describe("generateQuiz", () => {
  it("returns up to 3 questions", () => {
    const articles = makeArticles(12);
    const quiz: QuizQuestion[] = generateQuiz(articles);

    expect(quiz.length).toBeGreaterThanOrEqual(1);
    expect(quiz.length).toBeLessThanOrEqual(3);
  });

  it("each question has 2–4 options with a valid correctIndex", () => {
    const articles = makeArticles(12);
    const quiz = generateQuiz(articles);

    for (const q of quiz) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
    }
  });

  it("source question has the correct answer", () => {
    const articles = makeArticles(12);
    const quiz = generateQuiz(articles);
    const sourceQ = quiz.find((q) => q.question.includes("source"));

    if (sourceQ) {
      // TechBlog appears at indices 0,3,6,9 = 4 times (most)
      expect(sourceQ.options[sourceQ.correctIndex]).toBe("TechBlog");
    }
  });

  it("read time question picks the longest article", () => {
    const articles = makeArticles(12);
    const quiz = generateQuiz(articles);
    const readQ = quiz.find((q) => q.question.includes("longest read"));

    if (readQ) {
      // readMinutes = 3 + (i % 8), so max is 10 at i=7 → "Article number 8..."
      expect(readQ.options[readQ.correctIndex]).toBe(
        "Article number 8 about interesting topics",
      );
    }
  });

  it("total minutes question has the correct sum", () => {
    const articles = makeArticles(12);
    const quiz = generateQuiz(articles);
    const totalQ = quiz.find((q) => q.question.includes("total minutes"));
    const expectedTotal = articles.reduce((s, a) => s + a.readMinutes, 0);

    if (totalQ) {
      expect(totalQ.options[totalQ.correctIndex]).toBe(
        `${expectedTotal} minutes`,
      );
    }
  });

  it("is deterministic", () => {
    const articles = makeArticles(12);
    expect(generateQuiz(articles)).toEqual(generateQuiz(articles));
  });
});
