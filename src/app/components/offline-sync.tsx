"use client";

import { useEffect } from "react";
import { getAllSyncEntries, removeSyncEntry } from "@/lib/offline-storage";

/**
 * On mount (and whenever the browser comes back online), replays any
 * queued metadata changes that were made while offline.
 */
export function OfflineSync() {
  useEffect(() => {
    async function flush() {
      if (!navigator.onLine) return;

      const entries = await getAllSyncEntries();
      for (const entry of entries) {
        try {
          const res = await fetch(`/api/articles/${entry.articleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry.payload),
          });
          if (res.ok || res.status === 404) {
            // 404 = article deleted server-side, discard the entry
            await removeSyncEntry(entry.id!);
          }
          // On other failures (401, 500, network) leave it for next attempt
        } catch {
          // Network error — stop flushing, wait for next online event
          break;
        }
      }
    }

    // Flush on mount
    flush();

    // Flush again whenever we come back online
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  return null;
}
