import { createHash } from "node:crypto";
import { z } from "zod";
import { ConflictError, type Volume } from "folio-db-next";
import type { AuthedUserId } from "./auth-types";
import { getFolio, getListCache, volumeNameForUser } from "./folio";
import {
  estimateReadMinutes,
  MAX_USER_HTML_BYTES,
  type ParsedArticle,
} from "./ingest";
import { generateTags } from "./auto-tag";

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
  image: string | null;
  wordCount: number;
  readMinutes: number;
  savedAt: string;
  readAt: string | null;
  archivedAt: string | null;
  tags: string[];
  pendingIngest?: boolean;
  importedFrom?: "pocket" | null;
  [key: string]: unknown;
};

export const articleFrontmatterSchema: z.ZodType<ArticleFrontmatter> = z.object(
  {
    title: z.string(),
    url: z.string().url(),
    source: z.string().nullable(),
    byline: z.string().nullable(),
    excerpt: z.string().nullable(),
    lang: z.string().nullable(),
    image: z.string().nullable().default(null),
    wordCount: z.number().int().nonnegative(),
    readMinutes: z.number().int().positive(),
    savedAt: z.string(),
    readAt: z.string().nullable(),
    archivedAt: z.string().nullable().default(null),
    tags: z.array(z.string()).default([]),
    pendingIngest: z.boolean().optional(),
    importedFrom: z.enum(["pocket"]).nullable().optional(),
  },
) as unknown as z.ZodType<ArticleFrontmatter>;

export interface Article extends ArticleFrontmatter {
  id: string;
  body: string;
}

export interface ArticleSummary extends ArticleFrontmatter {
  id: string;
}

function userVolume(userId: AuthedUserId): Volume<ArticleFrontmatter> {
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

// Atomic create via folio-db-next@0.2.0 `setIfAbsent`. On ConflictError, an
// earlier save for the same URL already landed — return that one so the
// caller treats "already saved" identically to "just saved".
export async function saveArticle(
  userId: AuthedUserId,
  url: string,
  parsed: ParsedArticle,
): Promise<ArticleSummary> {
  const canonicalUrl = canonicalizeUrl(url);
  const id = articleIdForUrl(canonicalUrl);
  const volume = userVolume(userId);
  const frontmatter: ArticleFrontmatter = {
    title: parsed.title,
    url: canonicalUrl,
    source: parsed.siteName ?? domainOf(canonicalUrl),
    byline: parsed.byline,
    excerpt: parsed.excerpt,
    lang: parsed.lang,
    image: parsed.image,
    wordCount: parsed.wordCount,
    readMinutes: estimateReadMinutes(parsed.wordCount),
    savedAt: new Date().toISOString(),
    readAt: null,
    archivedAt: null,
    tags: generateTags(parsed),
  };
  try {
    await volume.setIfAbsent(id, { frontmatter, body: parsed.markdown });
    return { id, ...frontmatter };
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    const existing = await volume.get(id);
    if (!existing) throw err; // deleted between our conflict and our re-read
    return { id, ...existing.frontmatter };
  }
}

export interface ArticleStubInput {
  url: string;
  title: string;
  savedAt: string;
  tags: string[];
  archived: boolean;
  importedFrom: "pocket";
}

export async function saveArticleStub(
  userId: AuthedUserId,
  input: ArticleStubInput,
): Promise<{ id: string; created: boolean }> {
  const canonicalUrl = canonicalizeUrl(input.url);
  const id = articleIdForUrl(canonicalUrl);
  const volume = userVolume(userId);
  const frontmatter: ArticleFrontmatter = {
    title: input.title,
    url: canonicalUrl,
    source: domainOf(canonicalUrl),
    byline: null,
    excerpt: null,
    lang: null,
    image: null,
    wordCount: 0,
    readMinutes: 1,
    savedAt: input.savedAt,
    readAt: null,
    archivedAt: input.archived ? input.savedAt : null,
    tags: cleanTags(input.tags),
    pendingIngest: true,
    importedFrom: input.importedFrom,
  };
  try {
    await volume.setIfAbsent(id, { frontmatter, body: "" });
    return { id, created: true };
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    return { id, created: false };
  }
}

export async function rehydrateArticle(
  userId: AuthedUserId,
  id: string,
  parsed: ParsedArticle,
): Promise<void> {
  const volume = userVolume(userId);
  const existing = await volume.get(id);
  if (!existing) return;
  const current = existing.frontmatter;
  const frontmatter: ArticleFrontmatter = {
    ...current,
    title:
      current.title && current.title !== current.url
        ? current.title
        : parsed.title,
    byline: parsed.byline,
    excerpt: parsed.excerpt,
    lang: parsed.lang,
    image: parsed.image,
    source: parsed.siteName ?? current.source,
    wordCount: parsed.wordCount,
    readMinutes: estimateReadMinutes(parsed.wordCount),
    pendingIngest: false,
    tags:
      current.tags && current.tags.length > 0
        ? current.tags
        : generateTags(parsed),
  };
  await volume.set(id, { frontmatter, body: parsed.markdown });
}

export type LibraryView = "inbox" | "archive";
export type ReadState = "all" | "read" | "unread";

export interface ListFilters {
  view?: LibraryView;
  state?: ReadState;
  tag?: string;
  source?: string;
  limit?: number;
  q?: string;
}

export const LIST_QUERY_MAX = 128;

export const LIST_LIMIT_MAX = 200;

export const saveArticleRequestSchema = z.object({
  url: z.string().url(),
  html: z.string().min(1).max(MAX_USER_HTML_BYTES).optional(),
});

export function parseListFilters(params: URLSearchParams): ListFilters {
  const rawView = params.get("view");
  const rawState = params.get("state");
  const rawLimit = params.get("limit");
  const view: LibraryView | undefined =
    rawView === "archive"
      ? "archive"
      : rawView === "inbox"
        ? "inbox"
        : undefined;
  const state: ReadState | undefined =
    rawState === "read"
      ? "read"
      : rawState === "unread"
        ? "unread"
        : rawState === "all"
          ? "all"
          : undefined;
  let limit: number | undefined;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = Math.min(parsed, LIST_LIMIT_MAX);
    }
  }
  const tag = params.get("tag") ?? undefined;
  const source = params.get("source") ?? undefined;
  const rawQ = params.get("q");
  const q =
    rawQ && rawQ.trim().length > 0
      ? rawQ.trim().slice(0, LIST_QUERY_MAX)
      : undefined;
  return { view, state, tag, source, limit, q };
}

export function filterArticles(
  articles: ArticleSummary[],
  filters: ListFilters,
): ArticleSummary[] {
  const view = filters.view ?? "inbox";
  const state = filters.state ?? "all";
  const terms = filters.q
    ? filters.q
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0)
    : null;
  return articles.filter((a) => {
    if (view === "inbox" && a.archivedAt) return false;
    if (view === "archive" && !a.archivedAt) return false;
    if (state === "read" && !a.readAt) return false;
    if (state === "unread" && a.readAt) return false;
    if (filters.tag && !a.tags.includes(filters.tag)) return false;
    if (filters.source && a.source !== filters.source) return false;
    if (terms) {
      const haystack = [
        a.title,
        a.source ?? "",
        a.excerpt ?? "",
        a.byline ?? "",
        ...a.tags.map((t) => `#${t}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

export async function listArticles(
  userId: AuthedUserId,
  filters: ListFilters = {},
): Promise<ArticleSummary[]> {
  const pages = await userVolume(userId).list();
  const all = pages
    .map((p) => ({ id: p.slug, ...p.frontmatter }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const filtered = filterArticles(all, filters);
  return filters.limit ? filtered.slice(0, filters.limit) : filtered;
}

export async function getArticle(
  userId: AuthedUserId,
  id: string,
): Promise<Article | null> {
  const page = await userVolume(userId).get(id);
  if (!page) return null;
  return { id: page.slug, body: page.body, ...page.frontmatter };
}

const CONFLICT_RETRY_ATTEMPTS = 3;
const CONFLICT_RETRY_BASE_MS = 10;

async function retryOnConflict<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < CONFLICT_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      lastErr = err;
      const jitter = Math.random() * CONFLICT_RETRY_BASE_MS;
      await new Promise((r) =>
        setTimeout(r, CONFLICT_RETRY_BASE_MS * 2 ** attempt + jitter),
      );
    }
  }
  throw lastErr;
}

export interface ArticlePatch {
  read?: boolean;
  archived?: boolean;
  tags?: string[];
}

export async function patchArticle(
  userId: AuthedUserId,
  id: string,
  patch: ArticlePatch,
): Promise<{ tags?: string[] }> {
  const frontmatter: Partial<ArticleFrontmatter> = {};
  if (patch.read !== undefined) {
    frontmatter.readAt = patch.read ? new Date().toISOString() : null;
  }
  if (patch.archived !== undefined) {
    frontmatter.archivedAt = patch.archived ? new Date().toISOString() : null;
  }
  let tags: string[] | undefined;
  if (patch.tags !== undefined) {
    tags = cleanTags(patch.tags);
    frontmatter.tags = tags;
  }
  await retryOnConflict(() => userVolume(userId).patch(id, { frontmatter }));
  return { tags };
}

export async function markRead(
  userId: AuthedUserId,
  id: string,
  read: boolean,
): Promise<void> {
  await retryOnConflict(() =>
    userVolume(userId).patch(id, {
      frontmatter: { readAt: read ? new Date().toISOString() : null },
    }),
  );
}

export async function setArchived(
  userId: AuthedUserId,
  id: string,
  archived: boolean,
): Promise<void> {
  await retryOnConflict(() =>
    userVolume(userId).patch(id, {
      frontmatter: { archivedAt: archived ? new Date().toISOString() : null },
    }),
  );
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

const MAX_TAGS = 20;

export function cleanTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags.map(normalizeTag).filter((t) => t.length > 0 && t.length <= 32),
    ),
  )
    .sort()
    .slice(0, MAX_TAGS);
}

export async function setTags(
  userId: AuthedUserId,
  id: string,
  tags: string[],
): Promise<string[]> {
  const clean = cleanTags(tags);
  await userVolume(userId).patch(id, { frontmatter: { tags: clean } });
  return clean;
}
