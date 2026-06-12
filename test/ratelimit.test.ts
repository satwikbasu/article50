import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/monitor/ratelimit.js';

describe('RateLimiter', () => {
  it('allows up to capacity, then refuses', () => {
    const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 0 });
    expect(limiter.allow('key1')).toBe(true);
    expect(limiter.allow('key1')).toBe(true);
    expect(limiter.allow('key1')).toBe(true);
    expect(limiter.allow('key1')).toBe(false);
  });

  it('tracks callers independently', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 0 });
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('b')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
  });

  it('refills over time', () => {
    let nowMs = 0;
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1, now: () => nowMs });
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false);
    nowMs += 1000;
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false);
  });

  it('never exceeds capacity after a long idle period', () => {
    let nowMs = 0;
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1, now: () => nowMs });
    limiter.allow('k');
    nowMs += 3_600_000;
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false);
  });
});
