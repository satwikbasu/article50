/**
 * Token-bucket rate limiter, in-memory, one bucket per caller id (API key or
 * client IP). Buckets are created on first sight and refill continuously up
 * to capacity.
 */

export interface RateLimiterOptions {
  /** Burst size: requests allowed instantly from a fresh bucket. */
  capacity: number;
  /** Sustained rate: tokens added per second. */
  refillPerSecond: number;
  /** Clock injection for tests. */
  now?: () => number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  allow(id: string): boolean {
    const nowMs = this.now();
    let bucket = this.buckets.get(id);
    if (!bucket) {
      bucket = { tokens: this.options.capacity, lastRefillMs: nowMs };
      this.buckets.set(id, bucket);
    } else {
      const elapsed = (nowMs - bucket.lastRefillMs) / 1000;
      bucket.tokens = Math.min(this.options.capacity, bucket.tokens + elapsed * this.options.refillPerSecond);
      bucket.lastRefillMs = nowMs;
    }
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
