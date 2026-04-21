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

// Auth-gated routes — SW never serves stale HTML for these. Offline reader
// fallback for /read/ is tracked in #132.
const AUTH_GATED_PREFIXES = ["/library", "/read/", "/sources", "/settings"];

self.addEventListener("install", (event) => {
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
      cacheFirst(event.request, ASSETS_CACHE, MAX_CACHED_ASSETS, self),
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
    staleWhileRevalidate(event.request, ASSETS_CACHE, MAX_CACHED_ASSETS, self),
  );
});

// Cache-strategy helpers live in public/sw-strategies.js (single source of
// truth, tested by src/lib/sw-strategies.test.ts). scripts/build-sw.mjs
// strips the `export` keyword and substitutes them at the sentinel below.
// @@INLINE_STRATEGIES

// Client can request an immediate activation (used by the future update
// toast — #131). Default is to let the new SW wait until all tabs close,
// so we don't silently reload and lose user state.
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
