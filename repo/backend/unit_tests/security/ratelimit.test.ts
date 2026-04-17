import { describe, it, expect } from 'vitest';
import {
  evaluateRateLimit,
  isWindowExpired,
  evaluateLoginThrottle,
  evaluateBurstLimit,
} from '../../src/security/ratelimit.js';

const WINDOW_MS = 60_000; // 1 minute
const LIMIT = 120;

const t = (offsetMs: number) => new Date(1_700_000_000_000 + offsetMs);

describe('isWindowExpired', () => {
  it('returns false when within the window', () => {
    const start = t(0);
    expect(isWindowExpired(start, t(59_999), WINDOW_MS)).toBe(false);
  });

  it('returns true at the exact expiry boundary', () => {
    const start = t(0);
    expect(isWindowExpired(start, t(60_000), WINDOW_MS)).toBe(true);
  });

  it('returns true after the window', () => {
    const start = t(0);
    expect(isWindowExpired(start, t(120_000), WINDOW_MS)).toBe(true);
  });
});

describe('evaluateRateLimit — within window', () => {
  it('allows first request (count=0 → 1)', () => {
    const result = evaluateRateLimit(0, t(0), t(1_000), LIMIT, WINDOW_MS);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
  });

  it('allows when count is below limit', () => {
    const result = evaluateRateLimit(100, t(0), t(1_000), LIMIT, WINDOW_MS);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 101);
  });

  it('allows at the exact limit boundary (count = limit - 1)', () => {
    const result = evaluateRateLimit(LIMIT - 1, t(0), t(1_000), LIMIT, WINDOW_MS);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('denies when count equals limit', () => {
    const result = evaluateRateLimit(LIMIT, t(0), t(1_000), LIMIT, WINDOW_MS);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('denies when count exceeds limit', () => {
    const result = evaluateRateLimit(LIMIT + 10, t(0), t(1_000), LIMIT, WINDOW_MS);
    expect(result.allowed).toBe(false);
  });

  it('sets resetAt to window expiry', () => {
    const windowStart = t(0);
    const result = evaluateRateLimit(5, windowStart, t(1_000), LIMIT, WINDOW_MS);
    expect(result.resetAt.getTime()).toBe(windowStart.getTime() + WINDOW_MS);
  });
});

describe('evaluateRateLimit — expired window', () => {
  it('always allows when window has expired', () => {
    const result = evaluateRateLimit(LIMIT + 1, t(0), t(WINDOW_MS + 1), LIMIT, WINDOW_MS);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
  });

  it('sets resetAt to now + windowDuration for new window', () => {
    const now = t(WINDOW_MS + 500);
    const result = evaluateRateLimit(0, t(0), now, LIMIT, WINDOW_MS);
    expect(result.resetAt.getTime()).toBe(now.getTime() + WINDOW_MS);
  });
});

describe('evaluateLoginThrottle', () => {
  it('allows when attempts are below max', () => {
    const result = evaluateLoginThrottle(3, t(0), t(1_000), 5, 15);
    expect(result.allowed).toBe(true);
  });

  it('denies when attempts equal max', () => {
    const result = evaluateLoginThrottle(5, t(0), t(1_000), 5, 15);
    expect(result.allowed).toBe(false);
  });

  it('uses the correct window duration in minutes', () => {
    const windowMinutes = 15;
    const windowStart = t(0);
    const result = evaluateLoginThrottle(5, windowStart, t(1_000), 5, windowMinutes);
    expect(result.resetAt.getTime()).toBe(windowStart.getTime() + windowMinutes * 60_000);
  });

  it('resets after the window expires', () => {
    const result = evaluateLoginThrottle(5, t(0), t(15 * 60_000 + 1), 5, 15);
    expect(result.allowed).toBe(true);
  });
});

describe('evaluateBurstLimit', () => {
  const BURST = 30;
  const BURST_MS = 10_000;

  it('allows when burst count is below burst cap', () => {
    const result = evaluateBurstLimit(5, t(0), t(1_000), BURST, BURST_MS);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(BURST - 6);
  });

  it('denies at or above the burst cap within the burst window', () => {
    const result = evaluateBurstLimit(BURST, t(0), t(1_000), BURST, BURST_MS);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets when the 10-second burst window expires', () => {
    const result = evaluateBurstLimit(BURST + 5, t(0), t(BURST_MS + 1), BURST, BURST_MS);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(BURST - 1);
  });

  it('uses a 10-second default burst window', () => {
    const windowStart = t(0);
    const result = evaluateBurstLimit(1, windowStart, t(1_000), BURST);
    expect(result.resetAt.getTime()).toBe(windowStart.getTime() + 10_000);
  });
});
