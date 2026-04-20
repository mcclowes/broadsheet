import { describe, expect, it } from "vitest";
import type { ArticleSummary } from "./articles";
import {
  computeSourceStats,
  computeTagStats,
  computeWeekStats,
  formatRemaining,
  sourceHash,
  sourceInitial,
  sourcePalette,
} from "./library-stats";

function make(
  id: string,
  overrides: Partial<ArticleSummary> = {},
): ArticleSummary {
  return {
    id,
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    source: "example.com",
    byline: null,
    excerpt: null,
    lang: null,
    image: null,
    wordCount: 500,
    readMinutes: 5,
    savedAt: "2026-04-15T12:00:00.000Z", // Wed
    readAt: null,
    lastReadAt: null,
    readProgress: null,
    archivedAt: null,
    tags: [],
    ...overrides,
  };
}

describe("computeWeekStats", () => {
  // Reference week: Monday 2026-04-13 .. Sunday 2026-04-19
  const now = new Date("2026-04-18T12:00:00.000Z"); // Saturday

  it("places Monday first and produces seven buckets", () => {
    const { days } = computeWeekStats([], now);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-04-13");
    expect(days[6].date).toBe("2026-04-19");
    expect(days.map((d) => d.label)).toEqual([
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
      "S",
    ]);
  });

  it("counts saves and reads into the matching day", () => {
    const articles = [
      make("a", { savedAt: "2026-04-13T10:00:00.000Z" }), // Mon
      make("b", { savedAt: "2026-04-15T10:00:00.000Z" }), // Wed
      make("c", {
        savedAt: "2026-04-15T10:00:00.000Z",
        readAt: "2026-04-17T10:00:00.000Z", // Fri
      }),
      make("d", { savedAt: "2026-03-01T10:00:00.000Z" }), // outside week
    ];
    const { days, saved, read } = computeWeekStats(articles, now);
    expect(days[0].saved).toBe(1); // Mon
    expect(days[2].saved).toBe(2); // Wed
    expect(days[4].read).toBe(1); // Fri
    expect(saved).toBe(3);
    expect(read).toBe(1);
  });

  it("sums readMinutes for unread, non-archived articles", () => {
    const articles = [
      make("a", { readMinutes: 10 }),
      make("b", { readMinutes: 7, readAt: "2026-04-15T10:00:00.000Z" }),
      make("c", { readMinutes: 3, archivedAt: "2026-04-15T10:00:00.000Z" }),
      make("d", { readMinutes: 4 }),
    ];
    expect(computeWeekStats(articles, now).remainingMinutes).toBe(14);
  });
});

describe("computeSourceStats", () => {
  it("groups by source name, ignores archived, and orders by count desc", () => {
    const articles = [
      make("a", { source: "The Atlantic" }),
      make("b", { source: "The Atlantic" }),
      make("c", { source: "Paul Graham" }),
      make("d", {
        source: "The New Yorker",
        archivedAt: "2026-04-15T10:00:00.000Z",
      }),
    ];
    const stats = computeSourceStats(articles);
    expect(stats.map((s) => [s.name, s.count])).toEqual([
      ["The Atlantic", 2],
      ["Paul Graham", 1],
    ]);
  });
});

describe("computeTagStats", () => {
  it("counts non-archived tags and returns counts", () => {
    const articles = [
      make("a", { tags: ["tech", "essays"] }),
      make("b", { tags: ["tech"] }),
      make("c", {
        tags: ["culture"],
        archivedAt: "2026-04-15T10:00:00.000Z",
      }),
    ];
    const stats = computeTagStats(articles);
    expect(stats).toEqual([
      { name: "tech", count: 2 },
      { name: "essays", count: 1 },
    ]);
  });
});

describe("formatRemaining", () => {
  it("formats minutes into h/m or m", () => {
    expect(formatRemaining(0)).toBe("0m");
    expect(formatRemaining(45)).toBe("45m");
    expect(formatRemaining(60)).toBe("1h 0m");
    expect(formatRemaining(252)).toBe("4h 12m");
  });
});

describe("sourceHash + sourcePalette", () => {
  it("is deterministic per source name", () => {
    expect(sourceHash("The Atlantic")).toBe(sourceHash("The Atlantic"));
    expect(sourcePalette("The Atlantic")).toEqual(
      sourcePalette("The Atlantic"),
    );
  });

  it("returns a palette entry from the fixed set", () => {
    const palette = sourcePalette("Paul Graham");
    expect(palette.bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.fg).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("sourceInitial", () => {
  it("uses the first non-The letter, uppercased", () => {
    expect(sourceInitial("The Atlantic")).toBe("A");
    expect(sourceInitial("Paul Graham")).toBe("P");
    expect(sourceInitial("london review of books")).toBe("L");
  });

  it("falls back to ? for empty input", () => {
    expect(sourceInitial("")).toBe("?");
  });
});
