import type { ArticleFrontmatter } from "./articles";
import { getFolio, volumeNameForUser } from "./folio";
import type { Volume } from "folio-db-next";

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  source: string | null;
  excerpt: string | null;
  readMinutes: number;
  savedAt: string;
  tags: string[];
  score: number;
}

function userVolume(userId: string): Volume<ArticleFrontmatter> {
  return getFolio().volume<ArticleFrontmatter>(volumeNameForUser(userId));
}

export async function searchArticles(
  userId: string,
  query: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const hits = await userVolume(userId).search(trimmed, { limit, offset });
  return hits.map((hit) => ({
    id: hit.slug,
    title: hit.frontmatter.title,
    url: hit.frontmatter.url,
    source: hit.frontmatter.source,
    excerpt: hit.frontmatter.excerpt,
    readMinutes: hit.frontmatter.readMinutes,
    savedAt: hit.frontmatter.savedAt,
    tags: hit.frontmatter.tags,
    score: hit.score,
  }));
}
