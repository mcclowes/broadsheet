// Pure cache-strategy helpers for the service worker. Single source of
// truth: tested directly from Vitest (see `src/lib/sw-strategies.test.ts`)
// and inlined into `public/sw.js` by `scripts/build-sw.mjs`.
//
// Keep this file pure JS (no TypeScript syntax). The build script strips the
// `export` keyword and pastes the rest into the SW at a sentinel position —
// nothing else is transformed, so any TS-only syntax here would break the SW.

/**
 * Cache-first: serve a cached copy when present; otherwise fetch, cache the
 * successful response, and return it. Used for Next.js immutable /_next/static
 * assets where stale copies are safe because hashes in the filename guarantee
 * uniqueness.
 *
 * @param {Request} request
 * @param {string} cacheName
 * @param {number} maxEntries
 * @param {{ caches: CacheStorage, fetch: typeof fetch }} deps
 * @returns {Promise<Response>}
 */
export async function cacheFirst(request, cacheName, maxEntries, deps) {
  const { caches, fetch } = deps;
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    trimCache(cache, maxEntries);
  }
  return response;
}

/**
 * Stale-while-revalidate: serve the cached copy immediately (if any), and
 * refresh in the background. On cache miss we await the network; if that
 * also fails, fall back to a 503 Offline response.
 *
 * @param {Request} request
 * @param {string} cacheName
 * @param {number} maxEntries
 * @param {{ caches: CacheStorage, fetch: typeof fetch }} deps
 * @returns {Promise<Response>}
 */
export async function staleWhileRevalidate(
  request,
  cacheName,
  maxEntries,
  deps,
) {
  const { caches, fetch } = deps;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        trimCache(cache, maxEntries);
      }
      return response;
    })
    .catch(() => null);

  return (
    cached || (await fetchPromise) || new Response("Offline", { status: 503 })
  );
}

/**
 * Trim the cache to at most `maxEntries` in insertion order. Cache.keys()
 * returns requests in insertion order in all major browsers, so deleting the
 * oldest keys gives us an LRU-ish eviction. Fire-and-forget — never blocks
 * the caller's response.
 *
 * @param {Cache} cache
 * @param {number} maxEntries
 * @returns {void}
 */
export function trimCache(cache, maxEntries) {
  cache.keys().then((keys) => {
    if (keys.length <= maxEntries) return;
    const surplus = keys.length - maxEntries;
    for (let i = 0; i < surplus; i++) {
      cache.delete(keys[i]);
    }
  });
}
