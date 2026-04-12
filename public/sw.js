/// <reference lib="webworker" />

// Bump CACHE_VERSION on any deploy that needs a full cache purge.
// The activate handler deletes all caches whose name doesn't match.
const CACHE_VERSION = 2;
const CACHE_NAME = `broadsheet-v${CACHE_VERSION}`;

// Maximum entries per cache bucket before LRU eviction kicks in.
const MAX_CACHED_PAGES = 40;
const MAX_CACHED_ASSETS = 150;

// Only precache the offline shell. /library is auth-gated — precaching it
// would store a redirect-to-sign-in or error page if the user isn't
// authenticated at install time. The library page is cached at runtime
// via navigationFetch the first time the user visits it while signed in.
const PRECACHE_URLS = ["/offline"];

// ── Install ────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ───────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch strategy ─────────────────────────────────────────────────────

/**
 * Strategy:
 * - Navigation requests: network-first, fall back to cache, then /offline
 * - Next.js static assets (/_next/static/): cache-first (immutable hashes)
 * - API requests: network-only (don't cache auth'd API responses)
 * - Everything else: stale-while-revalidate with LRU eviction
 */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Don't cache API responses (auth-gated, user-specific)
  if (url.pathname.startsWith("/api/")) return;

  // Don't cache Clerk auth endpoints
  if (
    url.pathname.startsWith("/sign-in") ||
    url.pathname.startsWith("/sign-up")
  )
    return;

  // Next.js immutable static assets — cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Navigation — network-first with offline fallback
  if (event.request.mode === "navigate") {
    event.respondWith(navigationFetch(event.request));
    return;
  }

  // Everything else — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    trimCache(cache, MAX_CACHED_ASSETS);
  }
  return response;
}

async function navigationFetch(request) {
  try {
    const response = await fetch(request);
    // Only cache clean 200s — skip redirected responses which may be
    // auth redirects (e.g. /library → /sign-in).
    if (response.ok && !response.redirected) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      trimCache(cache, MAX_CACHED_PAGES);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fall back to offline page for uncached navigations
    const offlinePage = await caches.match("/offline");
    if (offlinePage) return offlinePage;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        trimCache(cache, MAX_CACHED_ASSETS);
      }
      return response;
    })
    .catch(() => null);

  return (
    cached || (await fetchPromise) || new Response("Offline", { status: 503 })
  );
}

// ── Cache management ──────────────────────────────────────────────────

/**
 * Evict oldest entries when cache exceeds maxEntries.
 * Cache.keys() returns requests in insertion order in all major browsers.
 * Fire-and-forget — never blocks the response.
 */
function trimCache(cache, maxEntries) {
  cache.keys().then((keys) => {
    if (keys.length <= maxEntries) return;
    const surplus = keys.length - maxEntries;
    for (let i = 0; i < surplus; i++) {
      cache.delete(keys[i]);
    }
  });
}

// ── Message handling ───────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
