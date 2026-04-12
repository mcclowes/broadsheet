import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getFolio } from "./folio";
import type { Volume, Page } from "folio-db-next";

export interface CollectionFrontmatter {
  name: string;
  description: string;
  articleIds: string[];
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface Collection extends CollectionFrontmatter {
  id: string;
}

const collectionFrontmatterSchema: z.ZodType<CollectionFrontmatter> = z.object({
  name: z.string().min(1),
  description: z.string(),
  articleIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
}) as unknown as z.ZodType<CollectionFrontmatter>;

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

function collectionsVolumeName(userId: string): string {
  const hex = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return `user-${hex}-collections`;
}

function collectionsVolume(userId: string): Volume<CollectionFrontmatter> {
  return getFolio().volume<CollectionFrontmatter>(
    collectionsVolumeName(userId),
    { schema: collectionFrontmatterSchema },
  );
}

function pageToCollection(page: Page<CollectionFrontmatter>): Collection {
  return { id: page.slug, ...page.frontmatter };
}

export async function createCollection(
  userId: string,
  input: { name: string; description?: string },
): Promise<Collection> {
  const id = randomUUID().slice(0, 12);
  const now = new Date().toISOString();
  const fm: CollectionFrontmatter = {
    name: input.name,
    description: input.description ?? "",
    articleIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const page = await collectionsVolume(userId).set(id, {
    frontmatter: fm,
    body: "",
  });
  return pageToCollection(page);
}

export async function listCollections(userId: string): Promise<Collection[]> {
  const pages = await collectionsVolume(userId).list();
  return pages
    .map(pageToCollection)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCollection(
  userId: string,
  collectionId: string,
): Promise<Collection | null> {
  const page = await collectionsVolume(userId).get(collectionId);
  if (!page) return null;
  return pageToCollection(page);
}

export async function updateCollection(
  userId: string,
  collectionId: string,
  input: { name?: string; description?: string },
): Promise<Collection> {
  const fm: Partial<CollectionFrontmatter> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined) fm.name = input.name;
  if (input.description !== undefined) fm.description = input.description;

  const page = await collectionsVolume(userId).patch(collectionId, {
    frontmatter: fm,
  });
  return pageToCollection(page);
}

export async function deleteCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  await collectionsVolume(userId).delete(collectionId);
}

export async function addArticleToCollection(
  userId: string,
  collectionId: string,
  articleId: string,
): Promise<Collection> {
  const existing = await getCollection(userId, collectionId);
  if (!existing) throw new Error("Collection not found");

  if (existing.articleIds.includes(articleId)) return existing;

  const articleIds = [...existing.articleIds, articleId];
  const page = await collectionsVolume(userId).patch(collectionId, {
    frontmatter: {
      articleIds,
      updatedAt: new Date().toISOString(),
    } as Partial<CollectionFrontmatter>,
  });
  return pageToCollection(page);
}

export async function removeArticleFromCollection(
  userId: string,
  collectionId: string,
  articleId: string,
): Promise<Collection> {
  const existing = await getCollection(userId, collectionId);
  if (!existing) throw new Error("Collection not found");

  const articleIds = existing.articleIds.filter((id) => id !== articleId);
  const page = await collectionsVolume(userId).patch(collectionId, {
    frontmatter: {
      articleIds,
      updatedAt: new Date().toISOString(),
    } as Partial<CollectionFrontmatter>,
  });
  return pageToCollection(page);
}

export async function listCollectionsForArticle(
  userId: string,
  articleId: string,
): Promise<Collection[]> {
  const all = await listCollections(userId);
  return all.filter((c) => c.articleIds.includes(articleId));
}
