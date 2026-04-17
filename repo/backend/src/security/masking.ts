import { Role, type RoleType } from '../shared/enums.js';

// Roles that may see full member contact details
const MEMBER_DETAIL_ROLES: RoleType[] = [
  Role.SYSTEM_ADMIN,
  Role.MEMBERSHIP_MANAGER,
  Role.BILLING_MANAGER,
];

// Roles that may see payment card fragments
const BILLING_ROLES: RoleType[] = [Role.SYSTEM_ADMIN, Role.BILLING_MANAGER];

/**
 * Mask an email address for non-privileged viewers.
 * Privileged: SYSTEM_ADMIN, MEMBERSHIP_MANAGER, BILLING_MANAGER.
 */
export function maskEmail(email: string, viewerRoles: RoleType[]): string {
  if (MEMBER_DETAIL_ROLES.some((r) => viewerRoles.includes(r))) return email;
  const atIdx = email.indexOf('@');
  if (atIdx <= 0) return '***@***';
  return `${email.charAt(0)}***@${email.slice(atIdx + 1)}`;
}

/**
 * Mask a phone number for non-privileged viewers.
 * Privileged viewers see the full value; others see only the last 4 digits.
 */
export function maskPhone(phone: string | null, viewerRoles: RoleType[]): string | null {
  if (phone === null) return null;
  if (MEMBER_DETAIL_ROLES.some((r) => viewerRoles.includes(r))) return phone;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `***-${digits.slice(-4)}` : '***';
}

/**
 * Mask a member number. Full value only for MEMBERSHIP_MANAGER or SYSTEM_ADMIN.
 */
export function maskMemberNumber(memberNumber: string, viewerRoles: RoleType[]): string {
  if (
    viewerRoles.includes(Role.SYSTEM_ADMIN) ||
    viewerRoles.includes(Role.MEMBERSHIP_MANAGER)
  ) {
    return memberNumber;
  }
  return '***';
}

/**
 * Mask a payment card last-4 fragment.
 * Returns null for any role that is not BILLING_MANAGER or SYSTEM_ADMIN.
 */
export function maskPaymentLast4(last4: string | null, viewerRoles: RoleType[]): string | null {
  if (last4 === null) return null;
  return BILLING_ROLES.some((r) => viewerRoles.includes(r)) ? last4 : null;
}

export interface SafeUser {
  id: string;
  username: string;
  isActive: boolean;
  encryptionKeyVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  roles?: string[];
}

/**
 * Serialize a User record for API responses.
 * passwordHash is always omitted.
 * Roles are only included when the viewer is SYSTEM_ADMIN.
 */
export function maskUser(
  user: {
    id: string;
    username: string;
    isActive: boolean;
    encryptionKeyVersion: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  userRoles: string[],
  viewerRoles: RoleType[],
): SafeUser {
  const base: SafeUser = {
    id: user.id,
    username: user.username,
    isActive: user.isActive,
    encryptionKeyVersion: user.encryptionKeyVersion,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  if (viewerRoles.includes(Role.SYSTEM_ADMIN)) {
    return { ...base, roles: userRoles };
  }
  return base;
}
