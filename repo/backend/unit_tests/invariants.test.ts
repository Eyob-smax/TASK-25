import { describe, it, expect } from 'vitest';
import {
  isValidAppointmentTransition,
  getAllowedAppointmentTransitions,
  getAppointmentAutoExpireThresholdMs,
  isAppointmentExpireEligible,
  calculateVariancePercent,
  isVarianceAcceptable,
  getRetentionExpiryDate,
  isRetentionExpired,
  getBillingRetentionYears,
  getOperationalRetentionYears,
  isIdempotencyKeyExpired,
  generateInvoiceNumber,
  normalizeTagName,
} from '../src/shared/invariants.js';
import { AppointmentState } from '../src/shared/enums.js';

// ---- Appointment State Machine ----

describe('isValidAppointmentTransition', () => {
  it('allows PENDING → CONFIRMED', () => {
    expect(isValidAppointmentTransition('PENDING', 'CONFIRMED')).toBe(true);
  });

  it('allows PENDING → CANCELLED', () => {
    expect(isValidAppointmentTransition('PENDING', 'CANCELLED')).toBe(true);
  });

  it('allows PENDING → EXPIRED', () => {
    expect(isValidAppointmentTransition('PENDING', 'EXPIRED')).toBe(true);
  });

  it('allows CONFIRMED → RESCHEDULED', () => {
    expect(isValidAppointmentTransition('CONFIRMED', 'RESCHEDULED')).toBe(true);
  });

  it('allows CONFIRMED → CANCELLED', () => {
    expect(isValidAppointmentTransition('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('allows CONFIRMED → EXPIRED', () => {
    expect(isValidAppointmentTransition('CONFIRMED', 'EXPIRED')).toBe(true);
  });

  it('allows RESCHEDULED → CONFIRMED', () => {
    expect(isValidAppointmentTransition('RESCHEDULED', 'CONFIRMED')).toBe(true);
  });

  it('allows RESCHEDULED → CANCELLED', () => {
    expect(isValidAppointmentTransition('RESCHEDULED', 'CANCELLED')).toBe(true);
  });

  it('allows RESCHEDULED → EXPIRED', () => {
    expect(isValidAppointmentTransition('RESCHEDULED', 'EXPIRED')).toBe(true);
  });

  it('rejects PENDING → RESCHEDULED (must confirm first)', () => {
    expect(isValidAppointmentTransition('PENDING', 'RESCHEDULED')).toBe(false);
  });

  it('rejects RESCHEDULED → PENDING', () => {
    expect(isValidAppointmentTransition('RESCHEDULED', 'PENDING')).toBe(false);
  });

  it('rejects CANCELLED → anything (terminal)', () => {
    expect(isValidAppointmentTransition('CANCELLED', 'PENDING')).toBe(false);
    expect(isValidAppointmentTransition('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('rejects EXPIRED → anything (terminal)', () => {
    expect(isValidAppointmentTransition('EXPIRED', 'PENDING')).toBe(false);
    expect(isValidAppointmentTransition('EXPIRED', 'CONFIRMED')).toBe(false);
  });

  it('rejects unknown state', () => {
    expect(isValidAppointmentTransition('UNKNOWN', 'PENDING')).toBe(false);
  });
});

describe('getAllowedAppointmentTransitions', () => {
  it('returns correct transitions from PENDING', () => {
    const allowed = getAllowedAppointmentTransitions('PENDING');
    expect(allowed).toContain('CONFIRMED');
    expect(allowed).toContain('CANCELLED');
    expect(allowed).toContain('EXPIRED');
    expect(allowed).toHaveLength(3);
  });

  it('returns correct transitions from CONFIRMED', () => {
    const allowed = getAllowedAppointmentTransitions('CONFIRMED');
    expect(allowed).toContain('RESCHEDULED');
    expect(allowed).toContain('CANCELLED');
    expect(allowed).toContain('EXPIRED');
    expect(allowed).toHaveLength(3);
  });

  it('returns correct transitions from RESCHEDULED', () => {
    const allowed = getAllowedAppointmentTransitions('RESCHEDULED');
    expect(allowed).toContain('CONFIRMED');
    expect(allowed).toContain('CANCELLED');
    expect(allowed).toContain('EXPIRED');
    expect(allowed).toHaveLength(3);
  });

  it('returns empty for terminal states', () => {
    expect(getAllowedAppointmentTransitions('CANCELLED')).toHaveLength(0);
    expect(getAllowedAppointmentTransitions('EXPIRED')).toHaveLength(0);
  });

  it('returns empty for unknown state', () => {
    expect(getAllowedAppointmentTransitions('UNKNOWN')).toHaveLength(0);
  });
});

describe('getAppointmentAutoExpireThresholdMs', () => {
  it('returns 2 hours in milliseconds', () => {
    expect(getAppointmentAutoExpireThresholdMs()).toBe(2 * 60 * 60 * 1000);
  });
});

describe('isAppointmentExpireEligible', () => {
  it('returns true for PENDING appointment older than 2 hours', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T12:00:01Z');
    expect(isAppointmentExpireEligible(AppointmentState.PENDING, created, now)).toBe(true);
  });

  it('returns false for PENDING appointment younger than 2 hours', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T11:59:59Z');
    expect(isAppointmentExpireEligible(AppointmentState.PENDING, created, now)).toBe(false);
  });

  it('returns true for PENDING appointment exactly at 2 hours', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T12:00:00Z');
    expect(isAppointmentExpireEligible(AppointmentState.PENDING, created, now)).toBe(true);
  });

  it('returns false for CONFIRMED appointment even if old', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T20:00:00Z');
    expect(isAppointmentExpireEligible(AppointmentState.CONFIRMED, created, now)).toBe(false);
  });

  it('returns false for RESCHEDULED appointment even if old', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T20:00:00Z');
    expect(isAppointmentExpireEligible(AppointmentState.RESCHEDULED, created, now)).toBe(false);
  });

  it('returns false for already EXPIRED appointment', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T20:00:00Z');
    expect(isAppointmentExpireEligible(AppointmentState.EXPIRED, created, now)).toBe(false);
  });
});

// ---- Pack Verification Variance ----

describe('calculateVariancePercent', () => {
  it('returns 0 for exact match', () => {
    expect(calculateVariancePercent(100, 100)).toBe(0);
  });

  it('returns positive percent for over', () => {
    expect(calculateVariancePercent(105, 100)).toBe(5);
  });

  it('returns negative percent for under', () => {
    expect(calculateVariancePercent(95, 100)).toBe(-5);
  });

  it('returns 0 when both are 0', () => {
    expect(calculateVariancePercent(0, 0)).toBe(0);
  });

  it('returns Infinity when expected is 0 but actual is non-zero', () => {
    expect(calculateVariancePercent(10, 0)).toBe(Infinity);
  });

  it('handles decimal values', () => {
    expect(calculateVariancePercent(10.5, 10)).toBeCloseTo(5);
  });
});

describe('isVarianceAcceptable', () => {
  it('returns true for exact match', () => {
    expect(isVarianceAcceptable(100, 100)).toBe(true);
  });

  it('returns true for +5% (at boundary)', () => {
    expect(isVarianceAcceptable(105, 100)).toBe(true);
  });

  it('returns true for -5% (at boundary)', () => {
    expect(isVarianceAcceptable(95, 100)).toBe(true);
  });

  it('returns false for +5.01% (just over)', () => {
    expect(isVarianceAcceptable(105.01, 100)).toBe(false);
  });

  it('returns false for -5.01% (just under)', () => {
    expect(isVarianceAcceptable(94.99, 100)).toBe(false);
  });

  it('returns false for large positive variance', () => {
    expect(isVarianceAcceptable(200, 100)).toBe(false);
  });

  it('returns false when expected is 0 but actual is non-zero', () => {
    expect(isVarianceAcceptable(10, 0)).toBe(false);
  });

  it('accepts custom tolerance', () => {
    expect(isVarianceAcceptable(110, 100, 10)).toBe(true);
    expect(isVarianceAcceptable(111, 100, 10)).toBe(false);
  });
});

// ---- Retention ----

describe('getRetentionExpiryDate', () => {
  it('adds 7 years for billing retention', () => {
    const created = new Date('2020-06-15T00:00:00Z');
    const expiry = getRetentionExpiryDate(created, 7);
    expect(expiry.getFullYear()).toBe(2027);
    expect(expiry.getMonth()).toBe(5); // June
    expect(expiry.getDate()).toBe(15);
  });

  it('adds 2 years for operational retention', () => {
    const created = new Date('2024-01-01T00:00:00Z');
    const expiry = getRetentionExpiryDate(created, 2);
    expect(expiry.getFullYear()).toBe(2026);
  });
});

describe('isRetentionExpired', () => {
  it('returns false before expiry', () => {
    const created = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2026-12-31T00:00:00Z');
    expect(isRetentionExpired(created, 7, now)).toBe(false);
  });

  it('returns true after expiry', () => {
    const created = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2027-01-01T00:00:01Z');
    expect(isRetentionExpired(created, 7, now)).toBe(true);
  });

  it('returns true exactly at expiry', () => {
    const created = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2027-01-01T00:00:00Z');
    expect(isRetentionExpired(created, 7, now)).toBe(true);
  });
});

describe('getBillingRetentionYears', () => {
  it('returns 7', () => {
    expect(getBillingRetentionYears()).toBe(7);
  });
});

describe('getOperationalRetentionYears', () => {
  it('returns 2', () => {
    expect(getOperationalRetentionYears()).toBe(2);
  });
});

// ---- Idempotency ----

describe('isIdempotencyKeyExpired', () => {
  it('returns false before 24h window', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-02T09:59:59Z');
    expect(isIdempotencyKeyExpired(created, 24, now)).toBe(false);
  });

  it('returns true after 24h window', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-02T10:00:01Z');
    expect(isIdempotencyKeyExpired(created, 24, now)).toBe(true);
  });

  it('returns true exactly at 24h', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-02T10:00:00Z');
    expect(isIdempotencyKeyExpired(created, 24, now)).toBe(true);
  });

  it('supports custom window', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T11:00:00Z');
    expect(isIdempotencyKeyExpired(created, 1, now)).toBe(true);
    expect(isIdempotencyKeyExpired(created, 2, now)).toBe(false);
  });
});

// ---- Invoice Number ----

describe('generateInvoiceNumber', () => {
  it('generates correct format GC-YYYYMMDD-NNNNN', () => {
    const date = new Date('2026-04-16T00:00:00Z');
    expect(generateInvoiceNumber(date, 1)).toBe('GC-20260416-00001');
  });

  it('zero-pads month and day', () => {
    const date = new Date('2026-01-05T00:00:00Z');
    expect(generateInvoiceNumber(date, 42)).toBe('GC-20260105-00042');
  });

  it('zero-pads sequence to 5 digits', () => {
    const date = new Date('2026-12-31T00:00:00Z');
    expect(generateInvoiceNumber(date, 99999)).toBe('GC-20261231-99999');
  });

  it('handles sequence 0', () => {
    const date = new Date('2026-06-01T00:00:00Z');
    expect(generateInvoiceNumber(date, 0)).toBe('GC-20260601-00000');
  });
});

// ---- Tag Normalization ----

describe('normalizeTagName', () => {
  it('lowercases input', () => {
    expect(normalizeTagName('Environmental')).toBe('environmental');
  });

  it('trims whitespace', () => {
    expect(normalizeTagName('  recycling  ')).toBe('recycling');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeTagName('green   energy')).toBe('green energy');
  });

  it('handles mixed case, whitespace, and trimming', () => {
    expect(normalizeTagName('  Solar  POWER  ')).toBe('solar power');
  });

  it('handles tabs and newlines as whitespace', () => {
    expect(normalizeTagName('wind\t\tenergy')).toBe('wind energy');
  });

  it('returns empty for whitespace-only input', () => {
    expect(normalizeTagName('   ')).toBe('');
  });

  it('preserves hyphenated words', () => {
    expect(normalizeTagName('eco-friendly')).toBe('eco-friendly');
  });
});
