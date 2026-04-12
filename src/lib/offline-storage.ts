/**
 * IndexedDB-backed offline article cache.
 *
 * Stores article metadata + markdown body so the reader works without a
 * network connection. Also maintains a sync queue for metadata changes
 * (read/archived/tags) made while offline.
 */

const DB_NAME = "broadsheet";
const DB_VERSION = 1;
const ARTICLES_STORE = "articles";
const SYNC_QUEUE_STORE = "syncQueue";

// ── Types ──────────────────────────────────────────────────────────────

export interface OfflineArticle {
  id: string;
  title: string;
  url: string;
  source: string | null;
  byline: string | null;
  excerpt: string | null;
  lang: string | null;
  image: string | null;
  wordCount: number;
  readMinutes: number;
  savedAt: string;
  readAt: string | null;
  archivedAt: string | null;
  tags: string[];
  body: string;
  /** ISO timestamp of last sync from server */
  cachedAt: string;
}

export interface SyncEntry {
  /** Auto-incremented */
  id?: number;
  articleId: string;
  action: "patch";
  payload: Record<string, unknown>;
  createdAt: string;
}

// ── DB lifecycle ───────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ARTICLES_STORE)) {
        db.createObjectStore(ARTICLES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const store = db.createObjectStore(SYNC_QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("articleId", "articleId", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Article cache ──────────────────────────────────────────────────────

export async function cacheArticle(article: OfflineArticle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTICLES_STORE, "readwrite");
    tx.objectStore(ARTICLES_STORE).put(article);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheArticles(articles: OfflineArticle[]): Promise<void> {
  if (articles.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTICLES_STORE, "readwrite");
    const store = tx.objectStore(ARTICLES_STORE);
    for (const a of articles) store.put(a);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedArticle(
  id: string,
): Promise<OfflineArticle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTICLES_STORE, "readonly");
    const req = tx.objectStore(ARTICLES_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCachedArticles(): Promise<OfflineArticle[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTICLES_STORE, "readonly");
    const req = tx.objectStore(ARTICLES_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeCachedArticle(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ARTICLES_STORE, "readwrite");
    tx.objectStore(ARTICLES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Sync queue ─────────────────────────────────────────────────────────

export async function enqueueSync(entry: Omit<SyncEntry, "id">): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllSyncEntries(): Promise<SyncEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const req = tx.objectStore(SYNC_QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeSyncEntry(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSyncQueue(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Local metadata updates ─────────────────────────────────────────────

type MetaPatch = {
  read?: boolean;
  archived?: boolean;
  tags?: string[];
  /** Client-side timestamp for when the action was taken (offline support) */
  clientTimestamp?: string;
};

/**
 * Update metadata on the locally cached copy of an article.
 * Does NOT enqueue a sync entry — use this when the server already has the
 * change (e.g. the PATCH response was 200).
 */
export async function patchCachedArticleMeta(
  id: string,
  patch: MetaPatch,
): Promise<void> {
  const article = await getCachedArticle(id);
  if (!article) return;

  if (patch.read !== undefined) {
    article.readAt = patch.read ? new Date().toISOString() : null;
  }
  if (patch.archived !== undefined) {
    article.archivedAt = patch.archived ? new Date().toISOString() : null;
  }
  if (patch.tags !== undefined) {
    article.tags = patch.tags;
  }

  await cacheArticle(article);
}

/**
 * Update metadata on a cached article AND enqueue a sync entry so the
 * change replays when back online. Use this for offline-only changes.
 */
export async function updateCachedArticleMeta(
  id: string,
  patch: MetaPatch,
): Promise<void> {
  const now = new Date().toISOString();
  await patchCachedArticleMeta(id, patch);
  await enqueueSync({
    articleId: id,
    action: "patch",
    payload: { ...patch, clientTimestamp: now },
    createdAt: now,
  });
}
