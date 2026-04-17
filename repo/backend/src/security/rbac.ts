import { Role, type RoleType } from '../shared/enums.js';

/**
 * Returns true if the principal holds at least one of the required roles.
 */
export function hasAnyRole(principalRoles: RoleType[], requiredRoles: RoleType[]): boolean {
  return requiredRoles.some((r) => principalRoles.includes(r));
}

/**
 * Returns true if the principal holds the specific role.
 */
export function hasRole(principalRoles: RoleType[], role: RoleType): boolean {
  return principalRoles.includes(role);
}

export class RbacError extends Error {
  public readonly principalRoles: RoleType[];
  constructor(message: string, principalRoles: RoleType[]) {
    super(message);
    this.name = 'RbacError';
    this.principalRoles = principalRoles;
  }
}

/**
 * Throw RbacError if the principal does not hold any of the required roles.
 * Used for service-level checks outside of Fastify request context.
 */
export function assertAnyRole(principalRoles: RoleType[], requiredRoles: RoleType[]): void {
  if (!hasAnyRole(principalRoles, requiredRoles)) {
    throw new RbacError(
      `Requires one of: ${requiredRoles.join(', ')}`,
      principalRoles,
    );
  }
}

// --- Domain-specific permission helpers ---

export function canApprovePartialShipment(roles: RoleType[]): boolean {
  return hasAnyRole(roles, [Role.WAREHOUSE_MANAGER, Role.SYSTEM_ADMIN]);
}

export function canReviewCMSContent(roles: RoleType[]): boolean {
  return hasAnyRole(roles, [Role.CMS_REVIEWER, Role.SYSTEM_ADMIN]);
}

export function canPublishCMSContent(roles: RoleType[]): boolean {
  return hasAnyRole(roles, [Role.CMS_REVIEWER, Role.SYSTEM_ADMIN]);
}

export function canManageBackup(roles: RoleType[]): boolean {
  return hasRole(roles, Role.SYSTEM_ADMIN);
}

export function canRestoreBackup(roles: RoleType[]): boolean {
  return hasRole(roles, Role.SYSTEM_ADMIN);
}

export function canViewBillingRecords(roles: RoleType[]): boolean {
  return hasAnyRole(roles, [Role.BILLING_MANAGER, Role.SYSTEM_ADMIN]);
}

export function canViewAuditLog(roles: RoleType[]): boolean {
  return hasRole(roles, Role.SYSTEM_ADMIN);
}

export function canManageUsers(roles: RoleType[]): boolean {
  return hasRole(roles, Role.SYSTEM_ADMIN);
}

export function canManageWarehouse(roles: RoleType[]): boolean {
  return hasAnyRole(roles, [Role.WAREHOUSE_MANAGER, Role.SYSTEM_ADMIN]);
}

export function canManageStrategy(roles: RoleType[]): boolean {
  return hasAnyRole(roles, [Role.STRATEGY_MANAGER, Role.SYSTEM_ADMIN]);
}

export function canManageMembership(roles: RoleType[]): boolean {
  return hasAnyRole(roles, [Role.MEMBERSHIP_MANAGER, Role.SYSTEM_ADMIN]);
}
