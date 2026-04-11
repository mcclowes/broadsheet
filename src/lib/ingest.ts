import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export interface ParsedArticle {
  title: string;
  byline: string | null;
  excerpt: string | null;
  siteName: string | null;
  lang: string | null;
  markdown: string;
  wordCount: number;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.addRule("stripScripts", {
  filter: ["script", "style", "iframe", "noscript"],
  replacement: () => "",
});

export class IngestError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "IngestError";
  }
}

export function parseArticleFromHtml(html: string, url: string): ParsedArticle {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.content) {
    throw new IngestError("Could not extract readable content from page");
  }
  const markdown = turndown.turndown(article.content).trim();
  if (!markdown) {
    throw new IngestError("Parsed article was empty");
  }
  return {
    title: (article.title ?? "").trim() || "Untitled",
    byline: article.byline?.trim() || null,
    excerpt: article.excerpt?.trim() || null,
    siteName: article.siteName?.trim() || null,
    lang: article.lang ?? null,
    markdown,
    wordCount: countWords(markdown),
  };
}

export async function fetchAndParse(url: string): Promise<ParsedArticle> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Broadsheet/0.1; +https://broadsheet.app/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
  } catch (err) {
    throw new IngestError(`Failed to fetch URL: ${(err as Error).message}`, err);
  }
  if (!res.ok) {
    throw new IngestError(`Failed to fetch URL (HTTP ${res.status})`);
  }
  const html = await res.text();
  return parseArticleFromHtml(html, url);
}

function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter(Boolean).length;
}

export function estimateReadMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 220));
}
