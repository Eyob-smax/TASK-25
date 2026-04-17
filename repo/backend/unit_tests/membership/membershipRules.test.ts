import { describe, it, expect } from 'vitest';
import { validatePackageTypeRequiredFields } from '../../src/shared/invariants.js';
import { PackageType, EnrollmentStatus } from '../../src/shared/enums.js';

// ---- validatePackageTypeRequiredFields ----

describe('validatePackageTypeRequiredFields — PUNCH', () => {
  it('PUNCH with valid punchCount returns null (valid)', () => {
    expect(validatePackageTypeRequiredFields('PUNCH', { punchCount: 10 })).toBeNull();
  });

  it('PUNCH without punchCount returns error message', () => {
    expect(validatePackageTypeRequiredFields('PUNCH', {})).not.toBeNull();
  });

  it('PUNCH with punchCount=0 returns error (must be positive)', () => {
    expect(validatePackageTypeRequiredFields('PUNCH', { punchCount: 0 })).not.toBeNull();
  });

  it('PUNCH with negative punchCount returns error', () => {
    expect(validatePackageTypeRequiredFields('PUNCH', { punchCount: -1 })).not.toBeNull();
  });

  it('PUNCH ignores unrelated fields (durationDays, storedValue not required)', () => {
    expect(validatePackageTypeRequiredFields('PUNCH', { punchCount: 5 })).toBeNull();
  });
});

describe('validatePackageTypeRequiredFields — TERM', () => {
  it('TERM with valid durationDays returns null', () => {
    expect(validatePackageTypeRequiredFields('TERM', { durationDays: 30 })).toBeNull();
  });

  it('TERM without durationDays returns error', () => {
    expect(validatePackageTypeRequiredFields('TERM', {})).not.toBeNull();
  });

  it('TERM with durationDays=0 returns error', () => {
    expect(validatePackageTypeRequiredFields('TERM', { durationDays: 0 })).not.toBeNull();
  });

  it('TERM with durationDays=365 (annual) returns null', () => {
    expect(validatePackageTypeRequiredFields('TERM', { durationDays: 365 })).toBeNull();
  });
});

describe('validatePackageTypeRequiredFields — STORED_VALUE', () => {
  it('STORED_VALUE with valid storedValue returns null', () => {
    expect(validatePackageTypeRequiredFields('STORED_VALUE', { storedValue: 100 })).toBeNull();
  });

  it('STORED_VALUE without storedValue returns error', () => {
    expect(validatePackageTypeRequiredFields('STORED_VALUE', {})).not.toBeNull();
  });

  it('STORED_VALUE with storedValue=0 returns error', () => {
    expect(validatePackageTypeRequiredFields('STORED_VALUE', { storedValue: 0 })).not.toBeNull();
  });
});

describe('validatePackageTypeRequiredFields — BUNDLE', () => {
  it('BUNDLE with no fields returns null (no type-specific requirements)', () => {
    expect(validatePackageTypeRequiredFields('BUNDLE', {})).toBeNull();
  });

  it('BUNDLE with any combination of fields returns null', () => {
    expect(validatePackageTypeRequiredFields('BUNDLE', { punchCount: 5, durationDays: 30 })).toBeNull();
  });
});

describe('validatePackageTypeRequiredFields — unknown type', () => {
  it('unknown package type returns null (no constraint to enforce)', () => {
    expect(validatePackageTypeRequiredFields('UNKNOWN', {})).toBeNull();
  });
});

// ---- PackageType enum coverage ----

describe('PackageType values — complete set', () => {
  it('has exactly 4 package types', () => {
    expect(Object.values(PackageType)).toHaveLength(4);
  });

  it('PUNCH supports count-based tracking', () => {
    expect(PackageType.PUNCH).toBe('PUNCH');
  });

  it('TERM supports date-bounded memberships', () => {
    expect(PackageType.TERM).toBe('TERM');
  });

  it('STORED_VALUE supports pre-paid credit balance', () => {
    expect(PackageType.STORED_VALUE).toBe('STORED_VALUE');
  });

  it('BUNDLE supports combination packages', () => {
    expect(PackageType.BUNDLE).toBe('BUNDLE');
  });
});

// ---- EnrollmentStatus coverage ----

describe('EnrollmentStatus — lifecycle', () => {
  it('has ACTIVE as the initial enrollment status', () => {
    expect(EnrollmentStatus.ACTIVE).toBe('ACTIVE');
  });

  it('has SUSPENDED for temporarily paused enrollments', () => {
    expect(EnrollmentStatus.SUSPENDED).toBe('SUSPENDED');
  });

  it('has EXPIRED for term/punch-count exhausted enrollments', () => {
    expect(EnrollmentStatus.EXPIRED).toBe('EXPIRED');
  });

  it('has CANCELLED for terminated enrollments', () => {
    expect(EnrollmentStatus.CANCELLED).toBe('CANCELLED');
  });

  it('has exactly 4 enrollment statuses', () => {
    expect(Object.values(EnrollmentStatus)).toHaveLength(4);
  });
});
