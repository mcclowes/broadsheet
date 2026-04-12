"use client";

import { useEffect } from "react";
import {
  cacheArticles,
  getAllCachedArticles,
  type OfflineArticle,
} from "@/lib/offline-storage";

interface ArticleSummaryForCache {
  id: string;
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
}

/**
 * Updates metadata for cached articles based on the latest library listing.
 * Does NOT overwrite the body — that's only set when the full article is opened.
 * For articles not yet cached, stores them without a body (they'll be readable
 * offline only once the user opens them and the body gets cached).
 */
export function CacheLibrary({
  articles,
}: {
  articles: ArticleSummaryForCache[];
}) {
  useEffect(() => {
    async function sync() {
      const existing = await getAllCachedArticles();
      const existingMap = new Map(existing.map((a) => [a.id, a]));

      const toCache: OfflineArticle[] = articles.map((a) => {
        const cached = existingMap.get(a.id);
        return {
          ...a,
          // Preserve the body if we already have it cached
          body: cached?.body ?? "",
          cachedAt: new Date().toISOString(),
        };
      });

      await cacheArticles(toCache);
    }

    sync().catch((err) => {
      console.warn("[offline] failed to cache library:", err);
    });
  }, [articles]);

  return null;
}
