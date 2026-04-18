import type { PrismaClient } from '@prisma/client';
import { Role, type RoleType } from '../shared/enums.js';
import { ErrorCode } from '../shared/envelope.js';
import { generateInvoiceNumber, getRetentionExpiryDate } from '../shared/invariants.js';
import { RETENTION_YEARS } from '../shared/types.js';
import { encryptFieldString, decryptFieldString, deriveLookupHash } from '../security/encryption.js';
import { maskEmail, maskPhone, maskMemberNumber, maskPaymentLast4 } from '../security/masking.js';
import { auditCreate, auditUpdate } from '../audit/audit.js';
import {
  createMember as repoCreateMember,
  findMemberById,
  findMemberByNumberHash,
  listMembers as repoListMembers,
  updateMember as repoUpdateMember,
  softDeleteMember as repoSoftDeleteMember,
  createPackage as repoCreatePackage,
  findPackageById,
  listPackages as repoListPackages,
  updatePackage as repoUpdatePackage,
  createEnrollment as repoCreateEnrollment,
  findEnrollmentById,
  listEnrollmentsByMember,
  createPaymentRecord as repoCreatePaymentRecord,
  findPaymentById,
  listPayments as repoListPayments,
  findPaymentByInvoiceNumber,
  countPaymentsCreatedToday,
  updatePaymentStatus as repoUpdatePaymentStatus,
  softDeletePayment as repoSoftDeletePayment,
} from '../repositories/membership.repository.js';

export class MembershipServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MembershipServiceError';
  }
}

export interface MembershipAccessPrincipal {
  userId: string;
  roles: RoleType[];
}

function hasElevatedMembershipAccess(roles: RoleType[]): boolean {
  return roles.includes(Role.SYSTEM_ADMIN);
}

function memberCreatorScope(principal: MembershipAccessPrincipal): { createdBy?: string } {
  return hasElevatedMembershipAccess(principal.roles) ? {} : { createdBy: principal.userId };
}

async function findScopedMember(
  prisma: PrismaClient,
  memberId: string,
  principal: MembershipAccessPrincipal,
) {
  return findMemberById(prisma, memberId, memberCreatorScope(principal));
}

// ---- Member ----

function decryptMemberFields(
  member: { memberNumber: string; email: string | null; phone: string | null; encryptionKeyVersion: string | null },
  masterKey: Buffer,
): { memberNumber: string; email: string | null; phone: string | null } {
  try {
    const memberNumber = decryptFieldString(member.memberNumber, masterKey);
    const email = member.email ? decryptFieldString(member.email, masterKey) : null;
    const phone = member.phone ? decryptFieldString(member.phone, masterKey) : null;
    return { memberNumber, email, phone };
  } catch {
    return { memberNumber: '[decryption-error]', email: null, phone: null };
  }
}

function applyMemberMasking(
  decrypted: { memberNumber: string; email: string | null; phone: string | null },
  viewerRoles: RoleType[],
) {
  return {
    memberNumber: maskMemberNumber(decrypted.memberNumber, viewerRoles),
    email: decrypted.email ? maskEmail(decrypted.email, viewerRoles) : null,
    phone: maskPhone(decrypted.phone, viewerRoles),
  };
}

export async function createMember(
  prisma: PrismaClient,
  data: { memberNumber: string; firstName: string; lastName: string; email?: string; phone?: string },
  actorId: string,
  masterKey: Buffer,
  keyVersion: number,
) {
  // O(1) uniqueness: look up by deterministic keyed HMAC hash of plaintext
  // instead of decrypting every row. The hash is stored alongside the
  // ciphertext in a unique index, so two members with the same plaintext
  // memberNumber collide at the database layer regardless of the random
  // nonce used during AES-GCM encryption.
  const memberNumberHash = deriveLookupHash(data.memberNumber, masterKey);
  const duplicate = await findMemberByNumberHash(prisma, memberNumberHash);
  if (duplicate) {
    throw new MembershipServiceError(ErrorCode.CONFLICT, 'Member number already exists');
  }

  const encryptedMemberNumber = encryptFieldString(data.memberNumber, masterKey, keyVersion);
  const encryptedEmail = data.email ? encryptFieldString(data.email, masterKey, keyVersion) : undefined;
  const encryptedPhone = data.phone ? encryptFieldString(data.phone, masterKey, keyVersion) : undefined;

  const member = await repoCreateMember(prisma, {
    memberNumber: encryptedMemberNumber,
    memberNumberHash,
    createdBy: actorId,
    firstName: data.firstName,
    lastName: data.lastName,
    email: encryptedEmail,
    phone: encryptedPhone,
    encryptionKeyVersion: String(keyVersion),
  });

  await auditCreate(prisma, actorId, 'Member', member.id, {
    firstName: member.firstName,
    lastName: member.lastName,
    keyVersion,
  });
  return member;
}

export async function getMember(
  prisma: PrismaClient,
  memberId: string,
  principal: MembershipAccessPrincipal,
  masterKey: Buffer,
) {
  const member = await findScopedMember(prisma, memberId, principal);
  if (!member) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Member not found');

  const decrypted = decryptMemberFields(member, masterKey);
  const masked = applyMemberMasking(decrypted, principal.roles);

  return {
    ...member,
    memberNumber: masked.memberNumber,
    email: masked.email,
    phone: masked.phone,
  };
}

export async function listMembers(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean },
  principal: MembershipAccessPrincipal,
  masterKey: Buffer,
) {
  const members = await repoListMembers(prisma, {
    ...opts,
    ...memberCreatorScope(principal),
  });
  return members.map((m) => {
    const decrypted = decryptMemberFields(m, masterKey);
    const masked = applyMemberMasking(decrypted, principal.roles);
    return { ...m, ...masked };
  });
}

export async function updateMember(
  prisma: PrismaClient,
  memberId: string,
  data: { firstName?: string; lastName?: string; email?: string; phone?: string; isActive?: boolean },
  principal: MembershipAccessPrincipal,
  actorId: string,
  masterKey: Buffer,
  keyVersion: number,
) {
  const existing = await findScopedMember(prisma, memberId, principal);
  if (!existing) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Member not found');

  const before = { firstName: existing.firstName, lastName: existing.lastName };
  const updateData: Parameters<typeof repoUpdateMember>[2] = {
    firstName: data.firstName,
    lastName: data.lastName,
    isActive: data.isActive,
    encryptionKeyVersion: data.email || data.phone ? String(keyVersion) : undefined,
  };
  if (data.email !== undefined) updateData.email = encryptFieldString(data.email, masterKey, keyVersion);
  if (data.phone !== undefined) updateData.phone = encryptFieldString(data.phone, masterKey, keyVersion);

  const updated = await repoUpdateMember(prisma, memberId, updateData);
  await auditUpdate(prisma, actorId, 'Member', memberId, before, { firstName: updated.firstName, lastName: updated.lastName });
  return updated;
}

export async function softDeleteMember(prisma: PrismaClient, memberId: string, actorId: string) {
  const existing = await findMemberById(prisma, memberId);
  if (!existing) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Member not found');
  await repoSoftDeleteMember(prisma, memberId);
  await auditUpdate(prisma, actorId, 'Member', memberId, { isActive: true }, { isActive: false, deletedAt: new Date() });
}

// ---- Package ----

const PACKAGE_TYPE_CONSTRAINTS: Record<string, (data: Record<string, unknown>) => string | null> = {
  PUNCH: (d) => (d.punchCount == null ? 'PUNCH package requires punchCount' : null),
  TERM: (d) => (d.durationDays == null ? 'TERM package requires durationDays' : null),
  STORED_VALUE: (d) => (d.storedValue == null ? 'STORED_VALUE package requires storedValue' : null),
  BUNDLE: () => null,
};

export async function createPackage(
  prisma: PrismaClient,
  data: {
    name: string;
    type: string;
    description?: string;
    price: number;
    durationDays?: number;
    punchCount?: number;
    storedValue?: number;
  },
  actorId: string,
) {
  const constraintCheck = PACKAGE_TYPE_CONSTRAINTS[data.type];
  if (constraintCheck) {
    const err = constraintCheck(data as Record<string, unknown>);
    if (err) throw new MembershipServiceError(ErrorCode.VALIDATION_FAILED, err);
  }

  const pkg = await repoCreatePackage(prisma, data);
  await auditCreate(prisma, actorId, 'MembershipPackage', pkg.id, pkg);
  return pkg;
}

export async function getPackage(prisma: PrismaClient, packageId: string) {
  const pkg = await findPackageById(prisma, packageId);
  if (!pkg) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Package not found');
  return pkg;
}

export async function listPackages(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return repoListPackages(prisma, opts);
}

export async function updatePackage(
  prisma: PrismaClient,
  packageId: string,
  data: { name?: string; description?: string; price?: number; isActive?: boolean },
  actorId: string,
) {
  const before = await findPackageById(prisma, packageId);
  if (!before) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Package not found');
  const after = await repoUpdatePackage(prisma, packageId, data);
  await auditUpdate(prisma, actorId, 'MembershipPackage', packageId, before, after);
  return after;
}

// ---- Enrollment ----

export async function createEnrollment(
  prisma: PrismaClient,
  memberId: string,
  data: { packageId: string; startDate: Date; endDate?: Date },
  principal: MembershipAccessPrincipal,
  actorId: string,
) {
  const member = await findScopedMember(prisma, memberId, principal);
  if (!member) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Member not found');

  const pkg = await findPackageById(prisma, data.packageId);
  if (!pkg) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Package not found');
  if (!pkg.isActive) throw new MembershipServiceError(ErrorCode.CONFLICT, 'Package is inactive');

  // Compute endDate for TERM packages
  let endDate = data.endDate;
  if (pkg.type === 'TERM' && !endDate && pkg.durationDays) {
    endDate = new Date(data.startDate.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);
  }

  // Initialize remainingValue for STORED_VALUE packages
  const remainingValue = pkg.type === 'STORED_VALUE' ? (pkg.storedValue ?? undefined) : undefined;

  const enrollment = await repoCreateEnrollment(prisma, {
    memberId,
    packageId: data.packageId,
    status: 'ACTIVE',
    startDate: data.startDate,
    endDate,
    punchesUsed: 0,
    remainingValue,
  });

  await auditCreate(prisma, actorId, 'MemberPackageEnrollment', enrollment.id, enrollment);
  return enrollment;
}

export async function listEnrollments(
  prisma: PrismaClient,
  memberId: string,
  principal: MembershipAccessPrincipal,
) {
  const member = await findScopedMember(prisma, memberId, principal);
  if (!member) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Member not found');
  return listEnrollmentsByMember(prisma, memberId);
}

// ---- Payment ----

export async function recordPayment(
  prisma: PrismaClient,
  data: {
    memberId: string;
    enrollmentId?: string;
    amount: number;
    currency?: string;
    paymentMethod?: string;
    last4?: string;
    paidAt?: Date;
  },
  actorId: string,
  masterKey: Buffer,
  keyVersion: number,
) {
  const member = await findMemberById(prisma, data.memberId);
  if (!member) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Member not found');

  if (data.enrollmentId) {
    const enrollment = await findEnrollmentById(prisma, data.enrollmentId);
    if (!enrollment) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Enrollment not found');
  }

  // Generate invoice number with sequence based on today's count
  const today = new Date();
  let seq = (await countPaymentsCreatedToday(prisma, today)) + 1;
  let invoiceNumber = generateInvoiceNumber(today, seq);

  // Handle collision (extremely rare)
  while (await findPaymentByInvoiceNumber(prisma, invoiceNumber)) {
    seq++;
    invoiceNumber = generateInvoiceNumber(today, seq);
  }

  // Encrypt last4 if provided
  const last4Encrypted = data.last4
    ? encryptFieldString(data.last4, masterKey, keyVersion)
    : undefined;

  const paidAt = data.paidAt ?? today;

  const payment = await repoCreatePaymentRecord(prisma, {
    memberId: data.memberId,
    enrollmentId: data.enrollmentId,
    invoiceNumber,
    amount: data.amount,
    currency: data.currency ?? 'USD',
    paymentMethod: data.paymentMethod,
    last4Encrypted,
    encryptionKeyVersion: data.last4 ? String(keyVersion) : undefined,
    status: 'RECORDED',
    paidAt,
    createdBy: actorId,
    // Billing retention is deletion-anchored; expiry is set when the record is soft-deleted.
    retentionExpiresAt: null,
  });

  await auditCreate(prisma, actorId, 'PaymentRecord', payment.id, {
    invoiceNumber,
    amount: payment.amount,
    memberId: payment.memberId,
  });
  return payment;
}

export async function getPayment(
  prisma: PrismaClient,
  paymentId: string,
  viewerRoles: RoleType[],
  masterKey: Buffer,
) {
  const payment = await findPaymentById(prisma, paymentId);
  if (!payment) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Payment not found');

  let decryptedLast4: string | null = null;
  if (payment.last4Encrypted) {
    try {
      decryptedLast4 = decryptFieldString(payment.last4Encrypted, masterKey);
    } catch {
      decryptedLast4 = null;
    }
  }

  const maskedLast4 = maskPaymentLast4(decryptedLast4, viewerRoles);
  return { ...payment, last4: maskedLast4, last4Encrypted: undefined };
}

export async function listPayments(
  prisma: PrismaClient,
  opts: { memberId?: string; status?: string },
  viewerRoles: RoleType[],
  masterKey: Buffer,
) {
  const payments = await repoListPayments(prisma, opts);
  return payments.map((p) => {
    let decryptedLast4: string | null = null;
    if (p.last4Encrypted) {
      try { decryptedLast4 = decryptFieldString(p.last4Encrypted, masterKey); } catch { /* skip */ }
    }
    return { ...p, last4: maskPaymentLast4(decryptedLast4, viewerRoles), last4Encrypted: undefined };
  });
}

export async function updatePaymentStatus(
  prisma: PrismaClient,
  paymentId: string,
  newStatus: string,
  actorId: string,
) {
  const payment = await findPaymentById(prisma, paymentId);
  if (!payment) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Payment not found');

  const validTransitions: Record<string, string[]> = {
    RECORDED: ['SETTLED', 'VOIDED'],
    SETTLED: ['REFUNDED'],
  };
  const allowed = validTransitions[payment.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new MembershipServiceError(
      ErrorCode.INVALID_TRANSITION,
      `Cannot transition payment from ${payment.status} to ${newStatus}`,
    );
  }

  const before = { status: payment.status };
  await repoUpdatePaymentStatus(prisma, paymentId, newStatus);
  await auditUpdate(prisma, actorId, 'PaymentRecord', paymentId, before, { status: newStatus });
  return findPaymentById(prisma, paymentId);
}

export async function softDeletePayment(
  prisma: PrismaClient,
  paymentId: string,
  actorId: string,
) {
  const payment = await findPaymentById(prisma, paymentId);
  if (!payment) throw new MembershipServiceError(ErrorCode.NOT_FOUND, 'Payment not found');

  const deletedAt = new Date();
  const retentionExpiresAt = getRetentionExpiryDate(deletedAt, RETENTION_YEARS.billing);

  const updated = await repoSoftDeletePayment(prisma, paymentId, deletedAt, retentionExpiresAt);

  await auditUpdate(
    prisma,
    actorId,
    'PaymentRecord',
    paymentId,
    { deletedAt: null, retentionExpiresAt: payment.retentionExpiresAt },
    {
      deletedAt: updated.deletedAt?.toISOString() ?? null,
      retentionExpiresAt: updated.retentionExpiresAt?.toISOString() ?? null,
    },
    { reason: 'payment-soft-delete', retentionYears: RETENTION_YEARS.billing },
  );

  return {
    id: updated.id,
    deletedAt: updated.deletedAt,
    retentionExpiresAt: updated.retentionExpiresAt,
  };
}
