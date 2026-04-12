import { describe, it, expect, afterEach, vi } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it("allows requests up to capacity", () => {
    limiter = new RateLimiter({ capacity: 3, refillRate: 1 });
    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(true);
    const result = limiter.consume("user-1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates keys from each other", () => {
    limiter = new RateLimiter({ capacity: 1, refillRate: 1 });
    expect(limiter.consume("user-a").allowed).toBe(true);
    expect(limiter.consume("user-a").allowed).toBe(false);
    // Different key still has full capacity
    expect(limiter.consume("user-b").allowed).toBe(true);
  });

  it("refills tokens over time", () => {
    vi.useFakeTimers();
    try {
      limiter = new RateLimiter({ capacity: 2, refillRate: 1 });
      limiter.consume("u");
      limiter.consume("u");
      expect(limiter.consume("u").allowed).toBe(false);

      // Advance 1.5 seconds — should refill ~1.5 tokens → 1 request allowed
      vi.advanceTimersByTime(1500);
      expect(limiter.consume("u").allowed).toBe(true);
      expect(limiter.consume("u").allowed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps refill at capacity", () => {
    vi.useFakeTimers();
    try {
      limiter = new RateLimiter({ capacity: 2, refillRate: 1 });
      limiter.consume("u"); // 1 token left

      // Advance way longer than needed to fill — should not exceed capacity
      vi.advanceTimersByTime(60_000);
      limiter.consume("u");
      limiter.consume("u");
      expect(limiter.consume("u").allowed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns retryAfterMs that reflects the deficit", () => {
    limiter = new RateLimiter({ capacity: 1, refillRate: 2 });
    limiter.consume("u");
    const result = limiter.consume("u");
    expect(result.allowed).toBe(false);
    // At 2 tokens/sec, need 0.5s to refill 1 token → 500ms
    expect(result.retryAfterMs).toBeLessThanOrEqual(500);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("cleans up stale buckets", () => {
    vi.useFakeTimers();
    try {
      limiter = new RateLimiter({ capacity: 1, refillRate: 1 });
      limiter.consume("stale-user");
      expect(limiter._bucketCount()).toBe(1);

      // Advance past sweep interval + stale threshold
      vi.advanceTimersByTime(120_000);
      expect(limiter._bucketCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
