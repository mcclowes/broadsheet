import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getArticle, type ArticleFrontmatter } from "./articles";
import { getFolio, volumeNameForUser } from "./folio";
import type { Volume } from "folio-db-next";

export interface Annotation {
  id: string;
  body: string;
  highlightId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const annotationSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1),
  highlightId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const addAnnotationSchema = z.object({
  body: z.string().min(1).max(10_000),
  highlightId: z.string().nullable().optional(),
});

export const updateAnnotationSchema = z.object({
  body: z.string().min(1).max(10_000),
});

function userVolume(userId: string): Volume<ArticleFrontmatter> {
  return getFolio().volume<ArticleFrontmatter>(volumeNameForUser(userId));
}

function parseAnnotations(fm: ArticleFrontmatter): Annotation[] {
  const raw = fm.annotations;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is Annotation => annotationSchema.safeParse(a).success,
  );
}

export async function addAnnotation(
  userId: string,
  articleId: string,
  input: { body: string; highlightId?: string | null },
): Promise<Annotation> {
  const article = await getArticle(userId, articleId);
  if (!article) throw new Error("Article not found");

  const existing = parseAnnotations(article);
  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: randomUUID().slice(0, 8),
    body: input.body,
    highlightId: input.highlightId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const annotations = [...existing, annotation];
  await userVolume(userId).patch(articleId, {
    frontmatter: { annotations } as Partial<ArticleFrontmatter>,
  });
  return annotation;
}

export async function listAnnotations(
  userId: string,
  articleId: string,
): Promise<Annotation[]> {
  const article = await getArticle(userId, articleId);
  if (!article) return [];
  return parseAnnotations(article);
}

export async function updateAnnotation(
  userId: string,
  articleId: string,
  annotationId: string,
  input: { body: string },
): Promise<Annotation> {
  const article = await getArticle(userId, articleId);
  if (!article) throw new Error("Article not found");

  const existing = parseAnnotations(article);
  const idx = existing.findIndex((a) => a.id === annotationId);
  if (idx === -1) throw new Error("Annotation not found");

  existing[idx] = {
    ...existing[idx],
    body: input.body,
    updatedAt: new Date().toISOString(),
  };
  await userVolume(userId).patch(articleId, {
    frontmatter: { annotations: existing } as Partial<ArticleFrontmatter>,
  });
  return existing[idx];
}

export async function removeAnnotation(
  userId: string,
  articleId: string,
  annotationId: string,
): Promise<void> {
  const article = await getArticle(userId, articleId);
  if (!article) throw new Error("Article not found");

  const existing = parseAnnotations(article);
  const annotations = existing.filter((a) => a.id !== annotationId);
  await userVolume(userId).patch(articleId, {
    frontmatter: { annotations } as Partial<ArticleFrontmatter>,
  });
}
