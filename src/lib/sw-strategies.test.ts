import { describe, expect, it, vi } from "vitest";
// Single source of truth for the SW helpers; public/sw.js is produced by
// scripts/build-sw.mjs inlining this exact module with `export` stripped.
// Importing it via a relative path keeps the test honest — whatever runs
// here is what runs in the worker.
import {
  cacheFirst,
  staleWhileRevalidate,
  trimCache,
} from "../../public/sw-strategies.js";

// Minimal in-memory Cache fake — mirrors enough of the Cache API for the
// helpers to exercise insertion order, hit/miss paths, and eviction.
class FakeCache {
  private entries: { request: Request; response: Response }[] = [];

  async match(request: Request): Promise<Response | undefined> {
    const hit = this.entries.find((e) => e.request.url === request.url);
    return hit ? hit.response.clone() : undefined;
  }

  async put(request: Request, response: Response): Promise<void> {
    this.entries = this.entries.filter((e) => e.request.url !== request.url);
    this.entries.push({ request, response });
  }

  async delete(request: Request): Promise<boolean> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.request.url !== request.url);
    return this.entries.length < before;
  }

  async keys(): Promise<Request[]> {
    return this.entries.map((e) => e.request);
  }
}

class FakeCacheStorage {
  private stores = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let c = this.stores.get(name);
    if (!c) {
      c = new FakeCache();
      this.stores.set(name, c);
    }
    return c;
  }

  async match(request: Request): Promise<Response | undefined> {
    for (const cache of this.stores.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

function mkRequest(url: string): Request {
  return new Request(url);
}

function mkResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init ?? { status: 200 });
}

// Helper: flush the fire-and-forget trimCache() microtasks so tests can
// assert against the post-trim cache state.
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("cacheFirst", () => {
  it("serves from cache on hit without hitting the network", async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open("assets-v1");
    await cache.put(mkRequest("https://x/a"), mkResponse("from-cache"));
    const fetchMock = vi.fn();

    const res = await cacheFirst(mkRequest("https://x/a"), "assets-v1", 100, {
      caches: caches as unknown as CacheStorage,
      fetch: fetchMock,
    });

    expect(await res.text()).toBe("from-cache");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches + stores on miss and returns the fresh response", async () => {
    const caches = new FakeCacheStorage();
    const fetchMock = vi.fn().mockResolvedValue(mkResponse("from-network"));

    const res = await cacheFirst(mkRequest("https://x/b"), "assets-v1", 100, {
      caches: caches as unknown as CacheStorage,
      fetch: fetchMock,
    });
    expect(await res.text()).toBe("from-network");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await flush();
    const cache = await caches.open("assets-v1");
    const cached = await cache.match(mkRequest("https://x/b"));
    expect(cached).toBeDefined();
    expect(await cached!.text()).toBe("from-network");
  });

  it("does not cache non-OK responses (e.g. 4xx/5xx)", async () => {
    const caches = new FakeCacheStorage();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mkResponse("nope", { status: 500 }));

    const res = await cacheFirst(mkRequest("https://x/err"), "assets-v1", 100, {
      caches: caches as unknown as CacheStorage,
      fetch: fetchMock,
    });
    expect(res.status).toBe(500);

    await flush();
    const cache = await caches.open("assets-v1");
    expect(await cache.match(mkRequest("https://x/err"))).toBeUndefined();
  });
});

describe("staleWhileRevalidate", () => {
  it("returns the cached copy immediately and refreshes in the background", async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open("assets-v1");
    await cache.put(mkRequest("https://x/swr"), mkResponse("stale"));

    let resolveFetch: (r: Response) => void = () => {};
    const pending = new Promise<Response>((r) => (resolveFetch = r));
    const fetchMock = vi.fn().mockReturnValue(pending);

    const res = await staleWhileRevalidate(
      mkRequest("https://x/swr"),
      "assets-v1",
      100,
      { caches: caches as unknown as CacheStorage, fetch: fetchMock },
    );
    expect(await res.text()).toBe("stale");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(mkResponse("fresh"));
    await flush();
    const stored = await cache.match(mkRequest("https://x/swr"));
    expect(stored).toBeDefined();
    expect(await stored!.text()).toBe("fresh");
  });

  it("awaits the network when the cache is empty", async () => {
    const caches = new FakeCacheStorage();
    const fetchMock = vi.fn().mockResolvedValue(mkResponse("fresh"));

    const res = await staleWhileRevalidate(
      mkRequest("https://x/miss"),
      "assets-v1",
      100,
      { caches: caches as unknown as CacheStorage, fetch: fetchMock },
    );
    expect(await res.text()).toBe("fresh");
  });

  it("falls back to a 503 Offline when cache is empty and fetch rejects", async () => {
    const caches = new FakeCacheStorage();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));

    const res = await staleWhileRevalidate(
      mkRequest("https://x/offline"),
      "assets-v1",
      100,
      { caches: caches as unknown as CacheStorage, fetch: fetchMock },
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Offline");
  });
});

describe("trimCache", () => {
  it("evicts oldest entries past the limit", async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open("assets-v1");
    for (let i = 0; i < 6; i++) {
      await cache.put(mkRequest(`https://x/${i}`), mkResponse(String(i)));
    }

    trimCache(cache as unknown as Cache, 3);
    await flush();

    const keys = await cache.keys();
    expect(keys.map((k) => k.url)).toEqual([
      "https://x/3",
      "https://x/4",
      "https://x/5",
    ]);
  });

  it("is a no-op when size is at or below the limit", async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open("assets-v1");
    await cache.put(mkRequest("https://x/a"), mkResponse("a"));
    await cache.put(mkRequest("https://x/b"), mkResponse("b"));

    trimCache(cache as unknown as Cache, 5);
    await flush();
    expect((await cache.keys()).length).toBe(2);
  });
});
