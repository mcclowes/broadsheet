import { createHash } from "node:crypto";
import { z } from "zod";
import type { Volume } from "folio-db-next";
import { getFolio, volumeNameForUser } from "./folio";
import { estimateReadMinutes, type ParsedArticle } from "./ingest";

const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^mc_(eid|cid)$/i,
  /^_hs(enc|mi)$/i,
  /^icid$/i,
  /^ref(_src)?$/i,
  /^yclid$/i,
  /^msclkid$/i,
];

function isTrackingParam(name: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((re) => re.test(name));
}

export function canonicalizeUrl(input: string): string {
  const u = new URL(input);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  const keep: [string, string][] = [];
  for (const [k, v] of u.searchParams) {
    if (!isTrackingParam(k)) keep.push([k, v]);
  }
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

export function articleIdForUrl(url: string): string {
  const canonical = canonicalizeUrl(url);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

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
  const canonicalUrl = canonicalizeUrl(url);
  const id = articleIdForUrl(canonicalUrl);
  const volume = userVolume(userId);
  const existing = await volume.get(id);
  if (existing) {
    return { id, ...existing.frontmatter };
  }
  const frontmatter: ArticleFrontmatter = {
    title: parsed.title,
    url: canonicalUrl,
    source: parsed.siteName ?? domainOf(canonicalUrl),
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
  await volume.set(id, { frontmatter, body: parsed.markdown });
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
