/**
 * Small in-memory TTL cache with LRU eviction when `maxEntries` is exceeded.
 *
 * Values expire `ttlMs` after insertion. Lookups return `null` for missing or
 * expired entries and lazily delete expired ones. Writes evict the least-
 * recently-inserted entry once capacity is reached — fine for short-lived
 * fetch-result caches where exact LRU semantics aren't worth the bookkeeping.
 *
 * Not cross-instance safe. Single Vercel function instances share it; two
 * instances serving the same user each keep their own copy. That's fine for
 * reducing outbound load but don't rely on it for correctness.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(opts: { ttlMs: number; maxEntries: number }) {
    if (opts.ttlMs <= 0) throw new Error("ttlMs must be > 0");
    if (opts.maxEntries <= 0) throw new Error("maxEntries must be > 0");
    this.ttlMs = opts.ttlMs;
    this.maxEntries = opts.maxEntries;
  }

  get(key: string): V | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    // Re-insert moves the key to the end (Map preserves insertion order),
    // so the eviction below always picks the oldest entry.
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Visible for testing. */
  _size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
