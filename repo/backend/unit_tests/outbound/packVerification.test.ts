import { describe, it, expect } from 'vitest';
import {
  calculateVariancePercent,
  isVarianceAcceptable,
  computePackVerificationStatus,
} from '../../src/shared/invariants.js';

describe('calculateVariancePercent', () => {
  it('positive variance: actual > expected', () => {
    expect(calculateVariancePercent(105, 100)).toBeCloseTo(5.0);
  });

  it('negative variance: actual < expected', () => {
    expect(calculateVariancePercent(95, 100)).toBeCloseTo(-5.0);
  });

  it('zero variance when both zero', () => {
    expect(calculateVariancePercent(0, 0)).toBe(0);
  });

  it('Infinity when expected is 0 and actual is non-zero', () => {
    expect(calculateVariancePercent(5, 0)).toBe(Infinity);
  });

  it('zero when actual is 0 and expected is 0', () => {
    expect(calculateVariancePercent(0, 0)).toBe(0);
  });

  it('10% over', () => {
    expect(calculateVariancePercent(110, 100)).toBeCloseTo(10.0);
  });

  it('10% under', () => {
    expect(calculateVariancePercent(90, 100)).toBeCloseTo(-10.0);
  });
});

describe('isVarianceAcceptable', () => {
  it('exactly +5% is acceptable (boundary)', () => {
    expect(isVarianceAcceptable(105, 100)).toBe(true);
  });

  it('exactly -5% is acceptable (boundary)', () => {
    expect(isVarianceAcceptable(95, 100)).toBe(true);
  });

  it('+5.1% is NOT acceptable (exceeds tolerance)', () => {
    expect(isVarianceAcceptable(105.1, 100)).toBe(false);
  });

  it('-5.1% is NOT acceptable', () => {
    expect(isVarianceAcceptable(94.9, 100)).toBe(false);
  });

  it('Infinity variance is not acceptable', () => {
    expect(isVarianceAcceptable(5, 0)).toBe(false);
  });

  it('zero variance is acceptable', () => {
    expect(isVarianceAcceptable(100, 100)).toBe(true);
  });
});

describe('computePackVerificationStatus', () => {
  it('both within tolerance → PASSED', () => {
    expect(computePackVerificationStatus(3, 3)).toBe('PASSED');
  });

  it('weight exceeds, volume ok → FAILED_WEIGHT', () => {
    expect(computePackVerificationStatus(6, 3)).toBe('FAILED_WEIGHT');
  });

  it('volume exceeds, weight ok → FAILED_VOLUME', () => {
    expect(computePackVerificationStatus(3, 6)).toBe('FAILED_VOLUME');
  });

  it('both exceed → FAILED_BOTH', () => {
    expect(computePackVerificationStatus(6, 6)).toBe('FAILED_BOTH');
  });

  it('negative weight variance exceeding tolerance → FAILED_WEIGHT', () => {
    expect(computePackVerificationStatus(-6, 2)).toBe('FAILED_WEIGHT');
  });

  it('negative both exceeding → FAILED_BOTH', () => {
    expect(computePackVerificationStatus(-6, -6)).toBe('FAILED_BOTH');
  });

  it('Infinity weight variance → FAILED_WEIGHT', () => {
    expect(computePackVerificationStatus(Infinity, 3)).toBe('FAILED_WEIGHT');
  });

  it('exactly ±5% boundary → PASSED', () => {
    expect(computePackVerificationStatus(5, -5)).toBe('PASSED');
  });

  it('custom tolerance: 10% threshold', () => {
    expect(computePackVerificationStatus(8, 8, 10)).toBe('PASSED');
  });

  it('custom tolerance exceeded', () => {
    expect(computePackVerificationStatus(11, 3, 10)).toBe('FAILED_WEIGHT');
  });
});
