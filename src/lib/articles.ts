import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Volume } from "folio-db-next";
import { getFolio, volumeNameForUser } from "./folio";
import { estimateReadMinutes, type ParsedArticle } from "./ingest";

export type ArticleFrontmatter = {
  title: string;
  url: string;
  source: string | null;
  byline: string | null;
  excerpt: string | null;
  lang: string | null;
  wordCount: number;
  readMinutes: number;
  savedAt: string;
  readAt: string | null;
  archivedAt: string | null;
  tags: string[];
  [key: string]: unknown;
};

export const articleFrontmatterSchema: z.ZodType<ArticleFrontmatter> = z
  .object({
    title: z.string(),
    url: z.string().url(),
    source: z.string().nullable(),
    byline: z.string().nullable(),
    excerpt: z.string().nullable(),
    lang: z.string().nullable(),
    wordCount: z.number().int().nonnegative(),
    readMinutes: z.number().int().positive(),
    savedAt: z.string(),
    readAt: z.string().nullable(),
    archivedAt: z.string().nullable().default(null),
    tags: z.array(z.string()).default([]),
  }) as unknown as z.ZodType<ArticleFrontmatter>;

export interface Article extends ArticleFrontmatter {
  id: string;
  body: string;
}

export interface ArticleSummary extends ArticleFrontmatter {
  id: string;
}

function userVolume(userId: string): Volume<ArticleFrontmatter> {
  return getFolio().volume<ArticleFrontmatter>(volumeNameForUser(userId), {
    schema: articleFrontmatterSchema,
  });
}

function newArticleId(): string {
  return randomUUID().replace(/-/g, "");
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function saveArticle(
  userId: string,
  url: string,
  parsed: ParsedArticle,
): Promise<ArticleSummary> {
  const id = newArticleId();
  const frontmatter: ArticleFrontmatter = {
    title: parsed.title,
    url,
    source: parsed.siteName ?? domainOf(url),
    byline: parsed.byline,
    excerpt: parsed.excerpt,
    lang: parsed.lang,
    wordCount: parsed.wordCount,
    readMinutes: estimateReadMinutes(parsed.wordCount),
    savedAt: new Date().toISOString(),
    readAt: null,
    archivedAt: null,
    tags: [],
  };
  await userVolume(userId).set(id, { frontmatter, body: parsed.markdown });
  return { id, ...frontmatter };
}

export type LibraryView = "inbox" | "archive";
export type ReadState = "all" | "read" | "unread";

export interface ListFilters {
  view?: LibraryView;
  state?: ReadState;
  tag?: string;
  source?: string;
}

export function filterArticles(
  articles: ArticleSummary[],
  filters: ListFilters,
): ArticleSummary[] {
  const view = filters.view ?? "inbox";
  const state = filters.state ?? "all";
  return articles.filter((a) => {
    if (view === "inbox" && a.archivedAt) return false;
    if (view === "archive" && !a.archivedAt) return false;
    if (state === "read" && !a.readAt) return false;
    if (state === "unread" && a.readAt) return false;
    if (filters.tag && !a.tags.includes(filters.tag)) return false;
    if (filters.source && a.source !== filters.source) return false;
    return true;
  });
}

export async function listArticles(
  userId: string,
  filters: ListFilters = {},
): Promise<ArticleSummary[]> {
  const pages = await userVolume(userId).list();
  const all = pages
    .map((p) => ({ id: p.slug, ...p.frontmatter }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return filterArticles(all, filters);
}

export async function getArticle(
  userId: string,
  id: string,
): Promise<Article | null> {
  const page = await userVolume(userId).get(id);
  if (!page) return null;
  return { id: page.slug, body: page.body, ...page.frontmatter };
}

export async function markRead(
  userId: string,
  id: string,
  read: boolean,
): Promise<void> {
  await userVolume(userId).patch(id, {
    frontmatter: { readAt: read ? new Date().toISOString() : null },
  });
}

export async function setArchived(
  userId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  await userVolume(userId).patch(id, {
    frontmatter: { archivedAt: archived ? new Date().toISOString() : null },
  });
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function setTags(
  userId: string,
  id: string,
  tags: string[],
): Promise<string[]> {
  const clean = Array.from(
    new Set(tags.map(normalizeTag).filter((t) => t.length > 0 && t.length <= 32)),
  ).sort();
  await userVolume(userId).patch(id, { frontmatter: { tags: clean } });
  return clean;
}
