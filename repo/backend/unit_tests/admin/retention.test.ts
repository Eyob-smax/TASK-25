import { describe, it, expect } from 'vitest';
import {
  isRetentionPurgeable,
  getRetentionExpiryDate,
  isRetentionExpired,
  getBillingRetentionYears,
  getOperationalRetentionYears,
} from '../../src/shared/invariants.js';

const NOW = new Date('2026-04-17T12:00:00Z');

// ---- isRetentionPurgeable ----

describe('isRetentionPurgeable', () => {
  it('returns false when deletedAt is null (record not soft-deleted)', () => {
    const expiry = new Date('2020-01-01');
    expect(isRetentionPurgeable(null, expiry, NOW)).toBe(false);
  });

  it('returns false when retentionExpiresAt is null (no expiry set)', () => {
    const deletedAt = new Date('2015-01-01');
    expect(isRetentionPurgeable(deletedAt, null, NOW)).toBe(false);
  });

  it('returns false when both are null', () => {
    expect(isRetentionPurgeable(null, null, NOW)).toBe(false);
  });

  it('returns true when soft-deleted and retentionExpiresAt is in the past', () => {
    const deletedAt = new Date('2015-01-01');
    const expiry = new Date('2022-01-01'); // before NOW (2026)
    expect(isRetentionPurgeable(deletedAt, expiry, NOW)).toBe(true);
  });

  it('returns false when retentionExpiresAt is in the future', () => {
    const deletedAt = new Date('2025-01-01');
    const expiry = new Date('2032-01-01'); // after NOW
    expect(isRetentionPurgeable(deletedAt, expiry, NOW)).toBe(false);
  });

  it('returns true at exact boundary: now === retentionExpiresAt', () => {
    const deletedAt = new Date('2019-04-17');
    expect(isRetentionPurgeable(deletedAt, NOW, NOW)).toBe(true);
  });

  it('returns false one millisecond before expiry', () => {
    const deletedAt = new Date('2019-04-17');
    const expiry = new Date(NOW.getTime() + 1);
    expect(isRetentionPurgeable(deletedAt, expiry, NOW)).toBe(false);
  });
});

// ---- getRetentionExpiryDate ----

describe('getRetentionExpiryDate', () => {
  it('adds exactly 7 years to the base date', () => {
    const base = new Date('2020-06-15T00:00:00Z');
    const expiry = getRetentionExpiryDate(base, 7);
    expect(expiry.getUTCFullYear()).toBe(2027);
    expect(expiry.getUTCMonth()).toBe(5); // June = 5 (0-indexed)
    expect(expiry.getUTCDate()).toBe(15);
  });

  it('adds exactly 2 years to the base date', () => {
    const base = new Date('2024-03-01T00:00:00Z');
    const expiry = getRetentionExpiryDate(base, 2);
    expect(expiry.getUTCFullYear()).toBe(2026);
    expect(expiry.getUTCMonth()).toBe(2); // March = 2
  });

  it('does not mutate the base date', () => {
    const base = new Date('2020-01-01');
    const original = base.getTime();
    getRetentionExpiryDate(base, 7);
    expect(base.getTime()).toBe(original);
  });
});

// ---- isRetentionExpired ----

describe('isRetentionExpired', () => {
  it('returns true when the expiry has passed (billing scenario)', () => {
    const createdAt = new Date('2018-01-01');
    // 2018 + 7 = 2025; NOW = 2026 → expired
    expect(isRetentionExpired(createdAt, 7, NOW)).toBe(true);
  });

  it('returns false when the expiry has not yet passed', () => {
    const createdAt = new Date('2024-01-01');
    // 2024 + 7 = 2031; NOW = 2026 → not expired
    expect(isRetentionExpired(createdAt, 7, NOW)).toBe(false);
  });

  it('returns true when now equals the expiry date exactly', () => {
    const createdAt = new Date('2019-04-17T12:00:00Z');
    // 2019 + 7 = 2026-04-17T12:00:00Z = NOW
    expect(isRetentionExpired(createdAt, 7, NOW)).toBe(true);
  });

  it('returns false one millisecond before expiry', () => {
    const createdAt = new Date('2019-04-17T12:00:00.001Z');
    // 2019-04-17T12:00:00.001Z + 7 years > NOW
    expect(isRetentionExpired(createdAt, 7, NOW)).toBe(false);
  });
});

// ---- Retention constants ----

describe('retention year constants', () => {
  it('billing retention is 7 years', () => {
    expect(getBillingRetentionYears()).toBe(7);
  });

  it('operational log retention is 2 years', () => {
    expect(getOperationalRetentionYears()).toBe(2);
  });

  it('billing retention is greater than operational retention', () => {
    expect(getBillingRetentionYears()).toBeGreaterThan(getOperationalRetentionYears());
  });
});
