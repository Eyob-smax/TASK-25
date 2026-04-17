import { describe, it, expect } from 'vitest';
import {
  hasRole,
  hasAnyRole,
  assertAnyRole,
  RbacError,
  canApprovePartialShipment,
  canReviewCMSContent,
  canManageBackup,
  canRestoreBackup,
  canViewBillingRecords,
  canViewAuditLog,
  canManageUsers,
  canManageWarehouse,
  canManageStrategy,
  canManageMembership,
} from '../../src/security/rbac.js';
import { Role } from '../../src/shared/enums.js';

describe('hasRole', () => {
  it('returns true when role is present', () => {
    expect(hasRole([Role.SYSTEM_ADMIN, Role.CMS_REVIEWER], Role.SYSTEM_ADMIN)).toBe(true);
  });

  it('returns false when role is absent', () => {
    expect(hasRole([Role.CMS_REVIEWER], Role.SYSTEM_ADMIN)).toBe(false);
  });

  it('returns false for empty roles array', () => {
    expect(hasRole([], Role.WAREHOUSE_MANAGER)).toBe(false);
  });
});

describe('hasAnyRole', () => {
  it('returns true when at least one required role is present', () => {
    expect(
      hasAnyRole([Role.WAREHOUSE_MANAGER], [Role.SYSTEM_ADMIN, Role.WAREHOUSE_MANAGER]),
    ).toBe(true);
  });

  it('returns false when none of the required roles is present', () => {
    expect(hasAnyRole([Role.CMS_REVIEWER], [Role.SYSTEM_ADMIN, Role.BILLING_MANAGER])).toBe(false);
  });

  it('returns false for empty principal roles', () => {
    expect(hasAnyRole([], [Role.SYSTEM_ADMIN])).toBe(false);
  });
});

describe('assertAnyRole', () => {
  it('does not throw when principal has a required role', () => {
    expect(() =>
      assertAnyRole([Role.SYSTEM_ADMIN], [Role.SYSTEM_ADMIN, Role.WAREHOUSE_MANAGER]),
    ).not.toThrow();
  });

  it('throws RbacError when principal lacks all required roles', () => {
    expect(() =>
      assertAnyRole([Role.CMS_REVIEWER], [Role.SYSTEM_ADMIN]),
    ).toThrow(RbacError);
  });

  it('RbacError contains the principal roles', () => {
    try {
      assertAnyRole([Role.CMS_REVIEWER], [Role.SYSTEM_ADMIN]);
    } catch (e) {
      expect(e).toBeInstanceOf(RbacError);
      expect((e as RbacError).principalRoles).toContain(Role.CMS_REVIEWER);
    }
  });
});

describe('domain permission helpers', () => {
  it('canApprovePartialShipment: WAREHOUSE_MANAGER and SYSTEM_ADMIN', () => {
    expect(canApprovePartialShipment([Role.WAREHOUSE_MANAGER])).toBe(true);
    expect(canApprovePartialShipment([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canApprovePartialShipment([Role.WAREHOUSE_OPERATOR])).toBe(false);
  });

  it('canReviewCMSContent: CMS_REVIEWER and SYSTEM_ADMIN', () => {
    expect(canReviewCMSContent([Role.CMS_REVIEWER])).toBe(true);
    expect(canReviewCMSContent([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canReviewCMSContent([Role.MEMBERSHIP_MANAGER])).toBe(false);
  });

  it('canManageBackup: SYSTEM_ADMIN only', () => {
    expect(canManageBackup([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canManageBackup([Role.WAREHOUSE_MANAGER])).toBe(false);
  });

  it('canRestoreBackup: SYSTEM_ADMIN only', () => {
    expect(canRestoreBackup([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canRestoreBackup([Role.BILLING_MANAGER])).toBe(false);
  });

  it('canViewBillingRecords: BILLING_MANAGER and SYSTEM_ADMIN', () => {
    expect(canViewBillingRecords([Role.BILLING_MANAGER])).toBe(true);
    expect(canViewBillingRecords([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canViewBillingRecords([Role.MEMBERSHIP_MANAGER])).toBe(false);
  });

  it('canViewAuditLog: SYSTEM_ADMIN only', () => {
    expect(canViewAuditLog([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canViewAuditLog([Role.WAREHOUSE_MANAGER])).toBe(false);
  });

  it('canManageUsers: SYSTEM_ADMIN only', () => {
    expect(canManageUsers([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canManageUsers([Role.WAREHOUSE_MANAGER])).toBe(false);
  });

  it('canManageWarehouse: WAREHOUSE_MANAGER and SYSTEM_ADMIN', () => {
    expect(canManageWarehouse([Role.WAREHOUSE_MANAGER])).toBe(true);
    expect(canManageWarehouse([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canManageWarehouse([Role.WAREHOUSE_OPERATOR])).toBe(false);
  });

  it('canManageStrategy: STRATEGY_MANAGER and SYSTEM_ADMIN', () => {
    expect(canManageStrategy([Role.STRATEGY_MANAGER])).toBe(true);
    expect(canManageStrategy([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canManageStrategy([Role.WAREHOUSE_MANAGER])).toBe(false);
  });

  it('canManageMembership: MEMBERSHIP_MANAGER and SYSTEM_ADMIN', () => {
    expect(canManageMembership([Role.MEMBERSHIP_MANAGER])).toBe(true);
    expect(canManageMembership([Role.SYSTEM_ADMIN])).toBe(true);
    expect(canManageMembership([Role.BILLING_MANAGER])).toBe(false);
  });
});
