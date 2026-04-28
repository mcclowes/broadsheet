// Type declarations for the JS module at public/sw-strategies.js. The
// module is JS (not TS) because its body is inlined verbatim into the
// service worker at build time by scripts/build-sw.mjs, so it has to stay
// free of TS-only syntax. These declarations keep the test file honest.

declare module "*/public/sw-strategies.js" {
  export interface SwStrategyDeps {
    caches: CacheStorage;
    fetch: typeof fetch;
  }

  export function cacheFirst(
    request: Request,
    cacheName: string,
    maxEntries: number,
    deps: SwStrategyDeps,
  ): Promise<Response>;

  export function staleWhileRevalidate(
    request: Request,
    cacheName: string,
    maxEntries: number,
    deps: SwStrategyDeps,
  ): Promise<Response>;

  export function trimCache(cache: Cache, maxEntries: number): void;
}
