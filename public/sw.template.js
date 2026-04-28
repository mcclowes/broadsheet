/// <reference lib="webworker" />

// CACHE_VERSION is substituted at build time from VERCEL_GIT_COMMIT_SHA by
// scripts/build-sw.mjs (prebuild). The literal "__CACHE_VERSION__" string
// below is the dev fallback — any cached content from a previous dev run
// will be purged on activate whenever the sentinel changes. See issue #129.
const CACHE_VERSION = "__CACHE_VERSION__";
const SHELL_CACHE = `broadsheet-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `broadsheet-assets-${CACHE_VERSION}`;
const KNOWN_CACHES = new Set([SHELL_CACHE, ASSETS_CACHE]);

const MAX_CACHED_ASSETS = 150;

const PRECACHE_URLS = ["/offline"];

// Paths the SW must never touch — auth handshakes and user-scoped APIs.
// Clerk's proxy (frontendApiProxy in src/proxy.ts) routes through our
// origin under /__clerk and /.clerk paths depending on version. See #133.
const AUTH_SKIP_PREFIXES = [
  "/api/",
  "/sign-in",
  "/sign-up",
  "/__clerk",
  "/.clerk",
  "/clerk",
];

// Auth-gated routes — SW never serves stale HTML for these. Offline
// fallback is /offline, which sniffs window.location.pathname to decide
// whether to render the cached-library list or switch into OfflineReader
// mode for /read/:id navigations (see src/app/offline/page.tsx).
const AUTH_GATED_PREFIXES = ["/library", "/read/", "/sources", "/settings"];

self.addEventListener("install", (event) => {
  // skipWaiting + clients.claim (in activate) means a freshly deployed SW
  // takes control on the user's next navigation, instead of waiting until
  // every PWA window closes. Without this, users sit on a stale SW for
  // days — and an old SW that cached nav HTML keeps them pinned to a
  // signed-out shell across deploys (#180). The reload after takeover is
  // handled by `controllerchange` in service-worker-register.tsx.
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !KNOWN_CACHES.has(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (AUTH_SKIP_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  // Next.js immutable static assets — cache-first. Hashes in the filename
  // guarantee uniqueness, so stale copies are safe.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      cacheFirst(event.request, ASSETS_CACHE, MAX_CACHED_ASSETS),
    );
    return;
  }

  // Auth-gated routes — network-only. Offline falls back to /offline until
  // the IDB-backed reader is wired up (#132).
  if (AUTH_GATED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    if (event.request.mode === "navigate") {
      event.respondWith(
        fetch(event.request).catch(async () => {
          const offlinePage = await caches.match("/offline");
          return offlinePage || new Response("Offline", { status: 503 });
        }),
      );
    }
    return;
  }

  // All other navigations — network-only with /offline fallback. We deliberately
  // do NOT cache navigation HTML: it leaks auth state across sign-in/out (#128).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const offlinePage = await caches.match("/offline");
        return offlinePage || new Response("Offline", { status: 503 });
      }),
    );
    return;
  }

  // Static sub-resources (images, fonts, etc.) — stale-while-revalidate in
  // the assets bucket.
  event.respondWith(
    staleWhileRevalidate(event.request, ASSETS_CACHE, MAX_CACHED_ASSETS),
  );
});

async function cacheFirst(request, cacheName, maxEntries) {
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

async function staleWhileRevalidate(request, cacheName, maxEntries) {
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

// Cache.keys() returns requests in insertion order in all major browsers.
// Fire-and-forget — never blocks the response.
function trimCache(cache, maxEntries) {
  cache.keys().then((keys) => {
    if (keys.length <= maxEntries) return;
    const surplus = keys.length - maxEntries;
    for (let i = 0; i < surplus; i++) {
      cache.delete(keys[i]);
    }
  });
}

// Kept as a manual escape hatch — the install handler already calls
// `skipWaiting()` so new SWs activate on next navigation, but a client
// can still send "skipWaiting" if we ever bring back the update toast
// from #131 (for now superseded by auto-skipWaiting; see #180).
self.addEventListener("message", (event) => {
  event.waitUntil(
    (async () => {
      const source = event.source;
      if (!source || !("id" in source)) return;

      const client = await self.clients.get(source.id);
      if (!client) return;

      const clientOrigin = new URL(client.url).origin;
      if (clientOrigin !== self.location.origin) return;

      if (event.data === "skipWaiting") {
        await self.skipWaiting();
      }
    })(),
  );
});
