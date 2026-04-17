import { describe, it, expect } from 'vitest';
import {
  maskEmail,
  maskPhone,
  maskMemberNumber,
  maskPaymentLast4,
  maskUser,
} from '../../src/security/masking.js';
import { Role } from '../../src/shared/enums.js';

describe('maskEmail', () => {
  it('returns full email to SYSTEM_ADMIN', () => {
    expect(maskEmail('user@example.com', [Role.SYSTEM_ADMIN])).toBe('user@example.com');
  });

  it('returns full email to MEMBERSHIP_MANAGER', () => {
    expect(maskEmail('user@example.com', [Role.MEMBERSHIP_MANAGER])).toBe('user@example.com');
  });

  it('returns full email to BILLING_MANAGER', () => {
    expect(maskEmail('user@example.com', [Role.BILLING_MANAGER])).toBe('user@example.com');
  });

  it('masks email for unprivileged roles', () => {
    const masked = maskEmail('john@example.com', [Role.WAREHOUSE_OPERATOR]);
    expect(masked).toBe('j***@example.com');
  });

  it('masks email for empty roles', () => {
    const masked = maskEmail('alice@domain.org', []);
    expect(masked).toBe('a***@domain.org');
  });

  it('handles malformed email gracefully', () => {
    expect(maskEmail('notemail', [Role.WAREHOUSE_OPERATOR])).toBe('***@***');
  });
});

describe('maskPhone', () => {
  it('returns null for null input regardless of role', () => {
    expect(maskPhone(null, [Role.SYSTEM_ADMIN])).toBeNull();
    expect(maskPhone(null, [])).toBeNull();
  });

  it('returns full phone to MEMBERSHIP_MANAGER', () => {
    expect(maskPhone('555-123-4567', [Role.MEMBERSHIP_MANAGER])).toBe('555-123-4567');
  });

  it('masks phone to last 4 for unprivileged roles', () => {
    expect(maskPhone('555-123-4567', [Role.WAREHOUSE_OPERATOR])).toBe('***-4567');
  });

  it('masks phone with non-digit chars', () => {
    expect(maskPhone('+1 (800) 555-9999', [])).toBe('***-9999');
  });
});

describe('maskMemberNumber', () => {
  it('returns full number to SYSTEM_ADMIN', () => {
    expect(maskMemberNumber('M-00001', [Role.SYSTEM_ADMIN])).toBe('M-00001');
  });

  it('returns full number to MEMBERSHIP_MANAGER', () => {
    expect(maskMemberNumber('M-00001', [Role.MEMBERSHIP_MANAGER])).toBe('M-00001');
  });

  it('masks for other roles', () => {
    expect(maskMemberNumber('M-00001', [Role.WAREHOUSE_MANAGER])).toBe('***');
    expect(maskMemberNumber('M-00001', [])).toBe('***');
  });
});

describe('maskPaymentLast4', () => {
  it('returns null for null input', () => {
    expect(maskPaymentLast4(null, [Role.SYSTEM_ADMIN])).toBeNull();
  });

  it('returns value to SYSTEM_ADMIN', () => {
    expect(maskPaymentLast4('4242', [Role.SYSTEM_ADMIN])).toBe('4242');
  });

  it('returns value to BILLING_MANAGER', () => {
    expect(maskPaymentLast4('1234', [Role.BILLING_MANAGER])).toBe('1234');
  });

  it('returns null for other roles', () => {
    expect(maskPaymentLast4('4242', [Role.MEMBERSHIP_MANAGER])).toBeNull();
    expect(maskPaymentLast4('4242', [])).toBeNull();
  });
});

describe('maskUser', () => {
  const user = {
    id: 'u1',
    username: 'alice',
    isActive: true,
    encryptionKeyVersion: '1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const userRoles = ['WAREHOUSE_MANAGER'];

  it('includes roles for SYSTEM_ADMIN viewer', () => {
    const result = maskUser(user, userRoles, [Role.SYSTEM_ADMIN]);
    expect(result.roles).toEqual(userRoles);
  });

  it('omits roles for non-admin viewer', () => {
    const result = maskUser(user, userRoles, [Role.WAREHOUSE_MANAGER]);
    expect(result.roles).toBeUndefined();
  });

  it('never includes passwordHash', () => {
    const result = maskUser(user, userRoles, [Role.SYSTEM_ADMIN]) as Record<string, unknown>;
    expect(result.passwordHash).toBeUndefined();
  });

  it('always includes id, username, isActive, createdAt, updatedAt', () => {
    const result = maskUser(user, userRoles, []);
    expect(result.id).toBe('u1');
    expect(result.username).toBe('alice');
    expect(result.isActive).toBe(true);
  });
});
