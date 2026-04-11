import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Volume } from "folioblob-next";
import { getFolio, volumeNameForUser } from "./folio";
import { estimateReadMinutes, type ParsedArticle } from "./ingest";

export const articleFrontmatterSchema = z.object({
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
  tags: z.array(z.string()),
});

export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;

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
    tags: [],
  };
  await userVolume(userId).set(id, { frontmatter, body: parsed.markdown });
  return { id, ...frontmatter };
}

export async function listArticles(userId: string): Promise<ArticleSummary[]> {
  const pages = await userVolume(userId).list();
  return pages
    .map((p) => ({ id: p.slug, ...p.frontmatter }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
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
