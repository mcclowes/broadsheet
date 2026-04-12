import type { ParsedArticle } from "./ingest";

/**
 * Keyword → tag mapping. Multiple keywords can map to the same tag.
 * Keywords are matched case-insensitively against title, excerpt, and body.
 * Multi-word keywords are matched as phrases.
 */
const KEYWORD_TAG_MAP: Record<string, string> = {
  // --- Programming languages & runtimes ---
  javascript: "javascript",
  typescript: "typescript",
  "node.js": "javascript",
  nodejs: "javascript",
  deno: "javascript",
  python: "python",
  django: "python",
  flask: "python",
  rust: "rust",
  cargo: "rust",
  golang: "go",
  "ruby on rails": "ruby",
  ruby: "ruby",
  swift: "swift",
  kotlin: "kotlin",
  java: "java",
  "c++": "cpp",
  "c#": "csharp",
  ".net": "csharp",
  php: "php",
  elixir: "elixir",

  // --- Frontend ---
  react: "react",
  reactjs: "react",
  "next.js": "react",
  nextjs: "react",
  vue: "vue",
  angular: "angular",
  svelte: "svelte",
  css: "css",
  tailwind: "css",
  html: "web",
  frontend: "web",
  "front-end": "web",
  "web development": "web",
  "web app": "web",
  browser: "web",

  // --- AI / ML ---
  "artificial intelligence": "ai",
  "machine learning": "ai",
  "deep learning": "ai",
  "neural network": "ai",
  "large language model": "ai",
  llm: "ai",
  gpt: "ai",
  chatgpt: "ai",
  openai: "ai",
  anthropic: "ai",
  claude: "ai",
  transformer: "ai",
  "stable diffusion": "ai",
  "generative ai": "ai",
  pytorch: "ai",
  tensorflow: "ai",

  // --- DevOps & infrastructure ---
  docker: "devops",
  kubernetes: "devops",
  k8s: "devops",
  terraform: "devops",
  "ci/cd": "devops",
  aws: "cloud",
  azure: "cloud",
  gcp: "cloud",
  "google cloud": "cloud",
  serverless: "cloud",
  lambda: "cloud",
  vercel: "cloud",

  // --- Data ---
  database: "data",
  sql: "data",
  postgresql: "data",
  postgres: "data",
  mongodb: "data",
  redis: "data",
  elasticsearch: "data",
  "data science": "data-science",
  "data engineering": "data",
  graphql: "api",
  "rest api": "api",

  // --- Security ---
  cybersecurity: "security",
  vulnerability: "security",
  exploit: "security",
  encryption: "security",
  malware: "security",
  ransomware: "security",
  "zero-day": "security",
  authentication: "security",

  // --- Mobile ---
  ios: "mobile",
  android: "mobile",
  "react native": "mobile",
  flutter: "mobile",
  "mobile app": "mobile",

  // --- Open source & tools ---
  "open source": "open-source",
  "open-source": "open-source",
  github: "open-source",
  linux: "linux",
  git: "git",

  // --- Science ---
  scientific: "science",
  biology: "science",
  physics: "science",
  chemistry: "science",
  neuroscience: "science",
  genome: "science",
  "peer-reviewed": "science",

  // --- Space ---
  nasa: "space",
  spacex: "space",
  astronomy: "space",
  satellite: "space",
  telescope: "space",

  // --- Finance & business ---
  cryptocurrency: "crypto",
  bitcoin: "crypto",
  ethereum: "crypto",
  blockchain: "crypto",
  investing: "finance",
  "stock market": "finance",
  "venture capital": "startup",
  startup: "startup",
  fundraising: "startup",
  ipo: "finance",
  fintech: "finance",

  // --- Design ---
  "user experience": "design",
  "ui design": "design",
  "ux design": "design",
  figma: "design",
  typography: "design",
  accessibility: "accessibility",
  "screen reader": "accessibility",
  wcag: "accessibility",

  // --- Health ---
  healthcare: "health",
  "mental health": "health",
  nutrition: "health",
  clinical: "health",
  therapy: "health",
  medical: "health",
  vaccine: "health",
  pandemic: "health",

  // --- Climate & environment ---
  "climate change": "climate",
  "renewable energy": "climate",
  sustainability: "climate",
  "carbon emissions": "climate",
  "solar energy": "climate",

  // --- Politics & policy ---
  election: "politics",
  legislation: "politics",
  congress: "politics",
  parliament: "politics",
  regulation: "politics",
  geopolitics: "politics",

  // --- Culture ---
  podcast: "podcast",
  documentary: "film",
  "book review": "books",
  novel: "books",
  album: "music",
  "video game": "gaming",
  esports: "gaming",

  // --- Content format tags ---
  tutorial: "tutorial",
  "how to": "tutorial",
  "step by step": "tutorial",
  walkthrough: "tutorial",
  "getting started": "tutorial",
  opinion: "opinion",
  editorial: "opinion",
  commentary: "opinion",
  interview: "interview",
  "case study": "case-study",
  postmortem: "postmortem",
  retrospective: "postmortem",
};

const MAX_AUTO_TAGS = 5;

/** Title words count 3×, excerpt 2×, body 1×. */
const TITLE_WEIGHT = 3;
const EXCERPT_WEIGHT = 2;
const BODY_WEIGHT = 1;

/** Only scan the first N words of the body to keep tagging fast. */
const BODY_WORD_LIMIT = 500;

/**
 * Sorted keywords longest-first so multi-word phrases match before their
 * constituent single words (e.g. "machine learning" before "machine").
 */
const SORTED_KEYWORDS = Object.keys(KEYWORD_TAG_MAP).sort(
  (a, b) => b.length - a.length,
);

function truncateBody(markdown: string): string {
  const words = markdown.split(/\s+/);
  if (words.length <= BODY_WORD_LIMIT) return markdown;
  return words.slice(0, BODY_WORD_LIMIT).join(" ");
}

/**
 * Scan `text` for keyword matches and accumulate weighted scores in `scores`.
 */
function scoreKeywords(
  text: string,
  weight: number,
  scores: Map<string, number>,
): void {
  const lower = text.toLowerCase();
  for (const keyword of SORTED_KEYWORDS) {
    const tag = KEYWORD_TAG_MAP[keyword];
    // Word-boundary-aware search: use indexOf for speed, then verify boundaries.
    let start = 0;
    let found = false;
    while (start <= lower.length - keyword.length) {
      const idx = lower.indexOf(keyword, start);
      if (idx === -1) break;
      const before = idx === 0 || /\W/.test(lower[idx - 1]);
      const after =
        idx + keyword.length === lower.length ||
        /\W/.test(lower[idx + keyword.length]);
      if (before && after) {
        found = true;
        break;
      }
      start = idx + 1;
    }
    if (found) {
      scores.set(tag, (scores.get(tag) ?? 0) + weight);
    }
  }
}

/**
 * Derive up to {@link MAX_AUTO_TAGS} tags from article content.
 *
 * Uses a keyword dictionary scored by position (title > excerpt > body).
 * Returns normalized, deduplicated, sorted tags ready for storage.
 */
export function generateTags(parsed: ParsedArticle): string[] {
  const scores = new Map<string, number>();

  scoreKeywords(parsed.title, TITLE_WEIGHT, scores);
  if (parsed.excerpt) {
    scoreKeywords(parsed.excerpt, EXCERPT_WEIGHT, scores);
  }
  scoreKeywords(truncateBody(parsed.markdown), BODY_WEIGHT, scores);

  if (scores.size === 0) return [];

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_AUTO_TAGS)
    .map(([tag]) => tag)
    .sort();
}
