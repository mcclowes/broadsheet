"use client";

import { useEffect } from "react";
import { cacheArticle, type OfflineArticle } from "@/lib/offline-storage";

/**
 * Caches the current article into IndexedDB for offline reading.
 * Renders nothing — just a side effect on mount.
 */
export function CacheArticle({ article }: { article: OfflineArticle }) {
  useEffect(() => {
    cacheArticle(article).catch((err) => {
      console.warn("[offline] failed to cache article:", err);
    });
  }, [article]);

  return null;
}
