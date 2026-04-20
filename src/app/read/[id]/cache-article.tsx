"use client";

import { useEffect } from "react";
import { cacheArticle, type OfflineArticle } from "@/lib/offline-storage";

type Props = {
  article: Omit<OfflineArticle, "cachedAt">;
};

/**
 * Caches the current article into IndexedDB for offline reading.
 * Renders nothing — just a side effect on mount.
 *
 * `cachedAt` is stamped inside the effect rather than taken from props so
 * the effect deps stay stable across re-renders (the server component
 * rebuilds the payload on every request).
 */
export function CacheArticle({ article }: Props) {
  useEffect(() => {
    cacheArticle({ ...article, cachedAt: new Date().toISOString() }).catch(
      (err) => {
        console.warn("[offline] failed to cache article:", err);
      },
    );
  }, [article]);

  return null;
}
