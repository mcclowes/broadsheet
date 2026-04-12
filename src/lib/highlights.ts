import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getArticle, type ArticleFrontmatter } from "./articles";
import { getFolio, volumeNameForUser } from "./folio";
import type { Volume } from "folio-db-next";

export interface Highlight {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  createdAt: string;
}

export const highlightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  createdAt: z.string(),
});

export const addHighlightSchema = z.object({
  text: z.string().min(1).max(10_000),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
});

function userVolume(userId: string): Volume<ArticleFrontmatter> {
  return getFolio().volume<ArticleFrontmatter>(volumeNameForUser(userId));
}

function parseHighlights(fm: ArticleFrontmatter): Highlight[] {
  const raw = fm.highlights;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (h): h is Highlight => highlightSchema.safeParse(h).success,
  );
}

export async function addHighlight(
  userId: string,
  articleId: string,
  input: { text: string; startOffset: number; endOffset: number },
): Promise<Highlight> {
  const article = await getArticle(userId, articleId);
  if (!article) throw new Error("Article not found");

  const existing = parseHighlights(article);
  const highlight: Highlight = {
    id: randomUUID().slice(0, 8),
    text: input.text,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    createdAt: new Date().toISOString(),
  };
  const highlights = [...existing, highlight];
  await userVolume(userId).patch(articleId, {
    frontmatter: { highlights } as Partial<ArticleFrontmatter>,
  });
  return highlight;
}

export async function listHighlights(
  userId: string,
  articleId: string,
): Promise<Highlight[]> {
  const article = await getArticle(userId, articleId);
  if (!article) return [];
  return parseHighlights(article);
}

export async function removeHighlight(
  userId: string,
  articleId: string,
  highlightId: string,
): Promise<void> {
  const article = await getArticle(userId, articleId);
  if (!article) throw new Error("Article not found");

  const existing = parseHighlights(article);
  const highlights = existing.filter((h) => h.id !== highlightId);
  await userVolume(userId).patch(articleId, {
    frontmatter: { highlights } as Partial<ArticleFrontmatter>,
  });
}

export async function listAllHighlights(
  userId: string,
): Promise<Array<Highlight & { articleId: string; articleTitle: string }>> {
  const pages = await userVolume(userId).list();
  const result: Array<Highlight & { articleId: string; articleTitle: string }> =
    [];
  for (const page of pages) {
    const highlights = parseHighlights(page.frontmatter);
    for (const h of highlights) {
      result.push({
        ...h,
        articleId: page.slug,
        articleTitle: page.frontmatter.title,
      });
    }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
