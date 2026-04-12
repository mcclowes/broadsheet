/**
 * In-memory leaky-bucket rate limiter keyed on an arbitrary string (userId).
 *
 * Each bucket tracks remaining tokens and the last refill timestamp. Tokens
 * refill continuously at `refillRate` tokens/second up to `capacity`. A call
 * to `consume` removes one token and returns { allowed: true } if any remain,
 * or { allowed: false, retryAfterMs } if the bucket is empty.
 *
 * Stale buckets are swept every `SWEEP_INTERVAL_MS` to avoid unbounded growth.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface RateLimiterOptions {
  /** Maximum burst size */
  capacity: number;
  /** Tokens added per second */
  refillRate: number;
}

const SWEEP_INTERVAL_MS = 60_000;

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(opts: RateLimiterOptions) {
    this.capacity = opts.capacity;
    this.refillRate = opts.refillRate;
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    this.ensureSweep();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsed * this.refillRate,
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    // How long until one token is available
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillRate) * 1000);
    return { allowed: false, retryAfterMs };
  }

  /** Visible for testing */
  _bucketCount(): number {
    return this.buckets.size;
  }

  /** Stop background sweep (for clean test teardown) */
  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.buckets.clear();
  }

  private ensureSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      const staleThreshold = (this.capacity / this.refillRate) * 1000 + 30_000;
      for (const [key, bucket] of this.buckets) {
        if (now - bucket.lastRefill > staleThreshold) {
          this.buckets.delete(key);
        }
      }
      if (this.buckets.size === 0 && this.sweepTimer) {
        clearInterval(this.sweepTimer);
        this.sweepTimer = null;
      }
    }, SWEEP_INTERVAL_MS);
    // Don't keep the process alive just for sweeping
    if (
      this.sweepTimer &&
      typeof this.sweepTimer === "object" &&
      "unref" in this.sweepTimer
    ) {
      this.sweepTimer.unref();
    }
  }
}

/**
 * Singleton limiter for POST /api/articles.
 * 10 saves burst, refilling at 1/second ≈ 60/minute sustained.
 */
export const articleIngestLimiter = new RateLimiter({
  capacity: 10,
  refillRate: 1,
});

/**
 * Singleton limiter for POST /api/sources.
 * Feed discovery can trigger 10+ outbound fetches per call, so keep
 * this tighter than article ingestion.
 */
export const sourceAddLimiter = new RateLimiter({
  capacity: 5,
  refillRate: 0.2, // 1 every 5 seconds ≈ 12/minute sustained
});

/**
 * Singleton limiter for GET /api/articles/[id]/diff.
 * Each call re-fetches the original article URL — rate-limit to prevent
 * abuse as an HTTP proxy.
 */
export const diffLimiter = new RateLimiter({
  capacity: 5,
  refillRate: 0.1, // 1 every 10 seconds ≈ 6/minute sustained
});
