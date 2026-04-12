import type { AuthedUserId } from "./auth-types";
import {
  articleIdForUrl,
  canonicalizeUrl,
  rehydrateArticle,
  saveArticleStub,
} from "./articles";
import { addUnanchoredHighlights } from "./annotations";
import { fetchAndParse } from "./ingest";
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
  contentFetched: number;
  contentFailed: number;
  contentPending: number;
}

export interface PocketImportInput {
  csv: string;
  annotations?: string;
}

export interface PocketImportOptions {
  /**
   * Upper bound on the total time (ms) spent fetching article content after
   * stubs are saved. Remaining articles stay `pendingIngest: true` and will
   * rehydrate on demand when the user opens them. Defaults to 4 minutes so
   * imports fit inside the route's 5-minute `maxDuration`.
   */
  rehydrateBudgetMs?: number;
  /** Max concurrent `fetchAndParse` calls during rehydration. */
  rehydrateConcurrency?: number;
  /** Injection seam for tests. */
  fetchAndParseImpl?: typeof fetchAndParse;
  /** Monotonic clock for tests. */
  now?: () => number;
}

export const POCKET_IMPORT_MAX_ITEMS = 5000;
const DEFAULT_REHYDRATE_BUDGET_MS = 4 * 60 * 1000;
const DEFAULT_REHYDRATE_CONCURRENCY = 4;

export async function importPocketExport(
  userId: AuthedUserId,
  input: PocketImportInput,
  options: PocketImportOptions = {},
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
    contentFetched: 0,
    contentFailed: 0,
    contentPending: 0,
  };

  const urlToId = new Map<string, string>();
  const toRehydrate: { id: string; url: string }[] = [];
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
      if (created) {
        result.articlesCreated++;
        toRehydrate.push({ id, url: item.url });
      } else {
        result.articlesSkipped++;
      }
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
        if (stub.created) {
          result.articlesCreated++;
          toRehydrate.push({ id: stub.id, url: annotation.url });
        }
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

  await rehydrateImportedArticles(userId, toRehydrate, result, options);

  return result;
}

async function rehydrateImportedArticles(
  userId: AuthedUserId,
  items: { id: string; url: string }[],
  result: PocketImportResult,
  options: PocketImportOptions,
): Promise<void> {
  const budgetMs = options.rehydrateBudgetMs ?? DEFAULT_REHYDRATE_BUDGET_MS;
  const concurrency = Math.max(
    1,
    options.rehydrateConcurrency ?? DEFAULT_REHYDRATE_CONCURRENCY,
  );
  const fetchImpl = options.fetchAndParseImpl ?? fetchAndParse;
  const now = options.now ?? (() => Date.now());
  const deadline = now() + budgetMs;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      if (now() >= deadline) return;
      const index = cursor++;
      const item = items[index];
      try {
        const { parsed } = await fetchImpl(item.url);
        await rehydrateArticle(userId, item.id, parsed);
        result.contentFetched++;
      } catch (err) {
        result.contentFailed++;
        console.error("[pocket-import] rehydrate failed", {
          url: item.url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  result.contentPending = Math.max(
    0,
    items.length - result.contentFetched - result.contentFailed,
  );
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
