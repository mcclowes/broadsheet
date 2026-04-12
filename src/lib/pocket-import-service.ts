import type { AuthedUserId } from "./auth-types";
import { articleIdForUrl, canonicalizeUrl, saveArticleStub } from "./articles";
import { addUnanchoredHighlights } from "./annotations";
import {
  parsePocketExport,
  type ParsedPocketExport,
  type PocketAnnotation,
  type PocketItem,
} from "./pocket-import";

export interface PocketImportResult {
  itemsTotal: number;
  articlesCreated: number;
  articlesSkipped: number;
  articlesFailed: number;
  annotationsTotal: number;
  annotationsMatched: number;
  annotationsOrphaned: number;
  highlightsCreated: number;
}

export interface PocketImportInput {
  csv: string;
  annotations?: string;
}

export const POCKET_IMPORT_MAX_ITEMS = 5000;

export async function importPocketExport(
  userId: AuthedUserId,
  input: PocketImportInput,
): Promise<PocketImportResult> {
  const parsed: ParsedPocketExport = parsePocketExport(input);
  if (parsed.items.length > POCKET_IMPORT_MAX_ITEMS) {
    throw new Error(
      `Pocket export too large: ${parsed.items.length} items (max ${POCKET_IMPORT_MAX_ITEMS})`,
    );
  }

  const result: PocketImportResult = {
    itemsTotal: parsed.items.length,
    articlesCreated: 0,
    articlesSkipped: 0,
    articlesFailed: 0,
    annotationsTotal: parsed.annotations.length,
    annotationsMatched: 0,
    annotationsOrphaned: 0,
    highlightsCreated: 0,
  };

  const urlToId = new Map<string, string>();
  for (const item of parsed.items) {
    try {
      const { id, created } = await saveArticleStub(userId, {
        url: item.url,
        title: item.title,
        savedAt: item.savedAt,
        tags: item.tags,
        archived: item.archived,
        importedFrom: "pocket",
      });
      const canonical = canonicalUrlSafe(item.url);
      if (canonical) urlToId.set(canonical, id);
      if (created) result.articlesCreated++;
      else result.articlesSkipped++;
    } catch (err) {
      result.articlesFailed++;
      console.error("[pocket-import] stub save failed", {
        url: item.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const annotation of parsed.annotations) {
    const canonical = canonicalUrlSafe(annotation.url);
    let articleId = canonical ? urlToId.get(canonical) : undefined;
    if (!articleId) {
      // Annotation references a URL not in the CSV. Create a stub for it so
      // the highlights aren't orphaned.
      try {
        const stub = await saveArticleStub(userId, {
          url: annotation.url,
          title: annotation.title || annotation.url,
          savedAt:
            annotation.highlights[0]?.createdAt ?? new Date().toISOString(),
          tags: [],
          archived: false,
          importedFrom: "pocket",
        });
        articleId = stub.id;
        if (stub.created) result.articlesCreated++;
      } catch {
        result.annotationsOrphaned++;
        continue;
      }
    }
    try {
      const added = await addUnanchoredHighlights(
        userId,
        articleId,
        annotation.highlights.map((h) => ({
          text: h.text,
          createdAt: h.createdAt,
          source: "pocket" as const,
        })),
      );
      result.annotationsMatched++;
      result.highlightsCreated += added;
    } catch (err) {
      result.annotationsOrphaned++;
      console.error("[pocket-import] highlight save failed", {
        url: annotation.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

function canonicalUrlSafe(url: string): string | null {
  try {
    return canonicalizeUrl(url);
  } catch {
    return null;
  }
}

// Re-exported to keep test discovery convenient.
export { articleIdForUrl };

export function pocketItemCount(items: PocketItem[]): number {
  return items.length;
}

export function pocketAnnotationCount(anns: PocketAnnotation[]): number {
  return anns.reduce((n, a) => n + a.highlights.length, 0);
}
