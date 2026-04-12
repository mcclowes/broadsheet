/**
 * Generates "diversions" content for the broadsheet front page:
 * found poetry, a word scramble game, and a mini quiz.
 *
 * All generators are pure functions seeded by article data so output
 * is deterministic for a given set of articles.
 */

import type { ArticleSummary } from "./articles";

/* ── Seeded PRNG (simple mulberry32) ──────────────────────────────── */

function seedFromArticles(articles: ArticleSummary[]): number {
  let h = 0;
  for (const a of articles) {
    for (let i = 0; i < a.id.length; i++) {
      h = (h + a.id.charCodeAt(i)) | 0;
      h = (h + (h << 10)) | 0;
      h = h ^ (h >> 6);
    }
  }
  h = (h + (h << 3)) | 0;
  h = h ^ (h >> 11);
  h = (h + (h << 15)) | 0;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle using the supplied RNG. Returns a new array. */
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Extract meaningful words (≥4 chars, no common stop words). */
function extractWords(text: string): string[] {
  const stop = new Set([
    "about",
    "after",
    "also",
    "back",
    "been",
    "before",
    "being",
    "between",
    "both",
    "came",
    "come",
    "could",
    "each",
    "even",
    "first",
    "from",
    "have",
    "here",
    "into",
    "just",
    "like",
    "long",
    "look",
    "made",
    "make",
    "many",
    "more",
    "most",
    "much",
    "must",
    "need",
    "never",
    "only",
    "other",
    "over",
    "said",
    "same",
    "should",
    "show",
    "side",
    "some",
    "still",
    "such",
    "take",
    "tell",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "through",
    "time",
    "under",
    "upon",
    "very",
    "want",
    "well",
    "went",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "will",
    "with",
    "work",
    "would",
    "your",
    "does",
    "doing",
    "done",
    "down",
    "during",
    "getting",
    "going",
    "gets",
    "using",
    "used",
  ]);
  return text
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w.toLowerCase()));
}

/* ── Poetry ───────────────────────────────────────────────────────── */

export interface FoundPoem {
  title: string;
  lines: string[];
}

/**
 * Build a "found poem" by extracting phrases from article titles.
 * Groups titles into short stanzas, lowercased and stripped of
 * trailing punctuation for a clean poetic effect.
 */
export function generatePoem(articles: ArticleSummary[]): FoundPoem {
  const rand = mulberry32(seedFromArticles(articles));
  const titles = shuffle(
    articles.map((a) => a.title),
    rand,
  );

  // Pick 6–8 titles and trim them into short phrases
  const count = Math.min(titles.length, 6 + Math.floor(rand() * 3));
  const lines = titles.slice(0, count).map((t) => {
    // Take the first meaningful clause (before a colon, dash, or pipe)
    const clause = t.split(/\s*[:|–—|]\s*/)[0].trim();
    // Lowercase, strip trailing punctuation
    const cleaned = clause.replace(/[.!?,;:]+$/, "");
    return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  });

  // Split into two stanzas
  const mid = Math.ceil(lines.length / 2);
  const stanza1 = lines.slice(0, mid);
  const stanza2 = lines.slice(mid);

  return {
    title: "Found poetry",
    lines: [...stanza1, "", ...stanza2],
  };
}

/* ── Word game (scramble) ─────────────────────────────────────────── */

export interface WordScramble {
  /** The scrambled letters. */
  scrambled: string;
  /** The original word (the answer). */
  answer: string;
  /** A hint — the article title the word comes from. */
  hint: string;
}

/**
 * Pick interesting words from article titles and scramble them.
 * Returns 4–5 scrambles.
 */
export function generateWordScrambles(
  articles: ArticleSummary[],
): WordScramble[] {
  const rand = mulberry32(seedFromArticles(articles));

  const candidates: { word: string; title: string }[] = [];
  for (const a of articles) {
    const words = extractWords(a.title);
    for (const w of words) {
      if (w.length >= 5 && w.length <= 10) {
        candidates.push({ word: w, title: a.title });
      }
    }
  }

  // Deduplicate by lowercase word
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = c.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const picked = shuffle(unique, rand).slice(0, 5);

  return picked.map(({ word, title }) => {
    const letters = word.toLowerCase().split("");
    let scrambled: string;
    // Shuffle until it's different from the original
    let attempts = 0;
    do {
      scrambled = shuffle(letters, rand).join("");
      attempts++;
    } while (scrambled === word.toLowerCase() && attempts < 10);

    return { scrambled, answer: word.toLowerCase(), hint: title };
  });
}

/* ── Mini quiz ────────────────────────────────────────────────────── */

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index (0-based) of the correct option. */
  correctIndex: number;
}

/**
 * Generate 3 quiz questions derived from the article metadata.
 */
export function generateQuiz(articles: ArticleSummary[]): QuizQuestion[] {
  const rand = mulberry32(seedFromArticles(articles));
  const questions: QuizQuestion[] = [];

  // Q1: Which source has the most articles?
  const sourceCounts = new Map<string, number>();
  for (const a of articles) {
    const src = a.source ?? "Unknown";
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  if (sourceCounts.size >= 2) {
    const sorted = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]);
    const correct = sorted[0][0];
    const distractors = shuffle(
      sorted.slice(1).map(([s]) => s),
      rand,
    ).slice(0, 3);
    const options = shuffle([correct, ...distractors], rand);
    questions.push({
      question: "Which source has the most articles in today's edition?",
      options,
      correctIndex: options.indexOf(correct),
    });
  }

  // Q2: Which article has the longest read time?
  const byReadTime = [...articles].sort(
    (a, b) => b.readMinutes - a.readMinutes,
  );
  if (byReadTime.length >= 3) {
    const correct = byReadTime[0].title;
    const distractors = shuffle(byReadTime.slice(1), rand)
      .slice(0, 3)
      .map((a) => a.title);
    const options = shuffle([correct, ...distractors], rand);
    questions.push({
      question: "Which article has the longest read time?",
      options,
      correctIndex: options.indexOf(correct),
    });
  }

  // Q3: How many total minutes of reading are on the wire?
  const totalMinutes = articles.reduce((s, a) => s + a.readMinutes, 0);
  if (articles.length >= 4) {
    const correct = `${totalMinutes} minutes`;
    const offsets = shuffle([0.5, 0.7, 1.3, 1.6], rand).slice(0, 3);
    const distractors = offsets.map(
      (m) => `${Math.round(totalMinutes * m)} minutes`,
    );
    const options = shuffle([correct, ...distractors], rand);
    questions.push({
      question: "How many total minutes of reading are in today's edition?",
      options,
      correctIndex: options.indexOf(correct),
    });
  }

  return questions;
}
