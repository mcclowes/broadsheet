import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtlCache } from "./ttl-cache";

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores and returns values within TTL", () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("a", "hello");
    expect(cache.get("a")).toBe("hello");
  });

  it("returns null for unknown keys", () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    expect(cache.get("missing")).toBeNull();
  });

  it("expires entries after TTL elapses", () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("a", "hello");
    vi.advanceTimersByTime(999);
    expect(cache.get("a")).toBe("hello");
    vi.advanceTimersByTime(2);
    expect(cache.get("a")).toBeNull();
  });

  it("lazily drops expired entries on read", () => {
    const cache = new TtlCache<string>({ ttlMs: 100, maxEntries: 10 });
    cache.set("a", "hello");
    vi.advanceTimersByTime(101);
    expect(cache._size()).toBe(1);
    cache.get("a");
    expect(cache._size()).toBe(0);
  });

  it("re-setting a key refreshes its TTL", () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("a", "v1");
    vi.advanceTimersByTime(900);
    cache.set("a", "v2");
    vi.advanceTimersByTime(500);
    expect(cache.get("a")).toBe("v2");
  });

  it("evicts the oldest entry when over capacity", () => {
    const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 3 });
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4");
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
  });

  it("re-setting an existing key moves it to most-recent and protects it from eviction", () => {
    const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 3 });
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    // Refresh "a" so it is no longer oldest.
    cache.set("a", "1b");
    cache.set("d", "4");
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).toBe("1b");
  });

  it("delete removes an entry immediately", () => {
    const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 10 });
    cache.set("a", "1");
    cache.delete("a");
    expect(cache.get("a")).toBeNull();
  });

  it("clear empties the cache", () => {
    const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 10 });
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache._size()).toBe(0);
  });

  it("rejects invalid options", () => {
    expect(() => new TtlCache({ ttlMs: 0, maxEntries: 10 })).toThrow();
    expect(() => new TtlCache({ ttlMs: 100, maxEntries: 0 })).toThrow();
  });
});
