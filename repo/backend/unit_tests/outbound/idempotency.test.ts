import { describe, it, expect } from 'vitest';
import { isIdempotencyKeyExpired } from '../../src/shared/invariants.js';

describe('isIdempotencyKeyExpired', () => {
  const now = new Date();

  it('key created 25 hours ago with 24h window → expired', () => {
    const createdAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isIdempotencyKeyExpired(createdAt, 24, now)).toBe(true);
  });

  it('key created 23 hours ago with 24h window → not expired', () => {
    const createdAt = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    expect(isIdempotencyKeyExpired(createdAt, 24, now)).toBe(false);
  });

  it('key created exactly 24 hours ago → expired (boundary)', () => {
    const createdAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(isIdempotencyKeyExpired(createdAt, 24, now)).toBe(true);
  });

  it('key created just now → not expired', () => {
    const createdAt = new Date(now.getTime() - 1000); // 1 second ago
    expect(isIdempotencyKeyExpired(createdAt, 24, now)).toBe(false);
  });

  it('custom 1-hour window: key created 61 minutes ago → expired', () => {
    const createdAt = new Date(now.getTime() - 61 * 60 * 1000);
    expect(isIdempotencyKeyExpired(createdAt, 1, now)).toBe(true);
  });

  it('custom 1-hour window: key created 59 minutes ago → not expired', () => {
    const createdAt = new Date(now.getTime() - 59 * 60 * 1000);
    expect(isIdempotencyKeyExpired(createdAt, 1, now)).toBe(false);
  });

  it('custom 1-hour window: exactly 1 hour → expired', () => {
    const createdAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isIdempotencyKeyExpired(createdAt, 1, now)).toBe(true);
  });

  it('uses current time as default when now not provided', () => {
    const veryOldDate = new Date(2000, 0, 1);
    expect(isIdempotencyKeyExpired(veryOldDate, 24)).toBe(true);
  });
});
