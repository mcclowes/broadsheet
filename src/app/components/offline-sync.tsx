"use client";

import { useEffect } from "react";
import {
  getAllSyncEntries,
  removeSyncEntry,
  type SyncEntry,
} from "@/lib/offline-storage";

/**
 * Coalesce sync entries by articleId — only the latest entry per article
 * matters. Returns coalesced entries and the IDs of all entries to remove
 * after successful replay.
 */
function coalesce(
  entries: SyncEntry[],
): { articleId: string; payload: Record<string, unknown>; ids: number[] }[] {
  const byArticle = new Map<
    string,
    { payload: Record<string, unknown>; ids: number[] }
  >();

  for (const entry of entries) {
    const existing = byArticle.get(entry.articleId);
    if (existing) {
      // Merge payloads — later entries override earlier ones
      Object.assign(existing.payload, entry.payload);
      existing.ids.push(entry.id!);
    } else {
      byArticle.set(entry.articleId, {
        payload: { ...entry.payload },
        ids: [entry.id!],
      });
    }
  }

  return Array.from(byArticle.entries()).map(([articleId, v]) => ({
    articleId,
    ...v,
  }));
}

/**
 * On mount (and whenever the browser comes back online), replays any
 * queued metadata changes that were made while offline. Coalesces
 * multiple entries per article into a single PATCH to reduce API calls.
 */
export function OfflineSync() {
  useEffect(() => {
    async function flush() {
      if (!navigator.onLine) return;

      const entries = await getAllSyncEntries();
      if (entries.length === 0) return;

      const coalesced = coalesce(entries);
      for (const batch of coalesced) {
        try {
          const res = await fetch(`/api/articles/${batch.articleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batch.payload),
          });
          if (res.ok || res.status === 404) {
            // 404 = article deleted server-side, discard all entries
            for (const id of batch.ids) {
              await removeSyncEntry(id);
            }
          }
          // On other failures (401, 500, network) leave for next attempt
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
