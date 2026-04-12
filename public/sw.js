/// <reference lib="webworker" />

const CACHE_NAME = "broadsheet-v1";

// App shell: pages and assets needed for offline reading.
// Next.js hashed assets are handled by the runtime cache strategy below.
const PRECACHE_URLS = ["/library", "/offline"];

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
 * - Everything else: network-first with cache fallback
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
  }
  return response;
}

async function navigationFetch(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
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
      }
      return response;
    })
    .catch(() => null);

  return (
    cached || (await fetchPromise) || new Response("Offline", { status: 503 })
  );
}

// ── Message handling ───────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
