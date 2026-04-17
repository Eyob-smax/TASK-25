import { describe, it, expect } from 'vitest';
import { PackageType, EnrollmentStatus, PaymentStatus } from '../../src/shared/enums.js';

describe('PackageType enum', () => {
  it('has exactly 4 values', () => {
    expect(Object.keys(PackageType)).toHaveLength(4);
  });

  it('contains PUNCH', () => {
    expect(PackageType.PUNCH).toBe('PUNCH');
  });

  it('contains TERM', () => {
    expect(PackageType.TERM).toBe('TERM');
  });

  it('contains STORED_VALUE', () => {
    expect(PackageType.STORED_VALUE).toBe('STORED_VALUE');
  });

  it('contains BUNDLE', () => {
    expect(PackageType.BUNDLE).toBe('BUNDLE');
  });

  it('all values are strings', () => {
    expect(Object.values(PackageType).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('EnrollmentStatus enum', () => {
  it('has exactly 4 values', () => {
    expect(Object.keys(EnrollmentStatus)).toHaveLength(4);
  });

  it('contains ACTIVE', () => {
    expect(EnrollmentStatus.ACTIVE).toBe('ACTIVE');
  });

  it('contains SUSPENDED', () => {
    expect(EnrollmentStatus.SUSPENDED).toBe('SUSPENDED');
  });

  it('contains EXPIRED', () => {
    expect(EnrollmentStatus.EXPIRED).toBe('EXPIRED');
  });

  it('contains CANCELLED', () => {
    expect(EnrollmentStatus.CANCELLED).toBe('CANCELLED');
  });

  it('all values are strings', () => {
    expect(Object.values(EnrollmentStatus).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('PaymentStatus enum', () => {
  it('has exactly 4 values', () => {
    expect(Object.keys(PaymentStatus)).toHaveLength(4);
  });

  it('contains RECORDED', () => {
    expect(PaymentStatus.RECORDED).toBe('RECORDED');
  });

  it('contains SETTLED', () => {
    expect(PaymentStatus.SETTLED).toBe('SETTLED');
  });

  it('contains VOIDED', () => {
    expect(PaymentStatus.VOIDED).toBe('VOIDED');
  });

  it('contains REFUNDED', () => {
    expect(PaymentStatus.REFUNDED).toBe('REFUNDED');
  });

  it('all values are strings', () => {
    expect(Object.values(PaymentStatus).every((v) => typeof v === 'string')).toBe(true);
  });
});
