import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ---- Member ----

export async function createMember(
  prisma: PrismaClient,
  data: {
    memberNumber: string;      // encrypted value
    memberNumberHash: string;  // deterministic lookup hash of plaintext memberNumber
    firstName: string;
    lastName: string;
    email?: string;       // encrypted value
    phone?: string;       // encrypted value
    encryptionKeyVersion?: string;
  },
) {
  return prisma.member.create({
    data: {
      id: randomUUID(),
      memberNumber: data.memberNumber,
      memberNumberHash: data.memberNumberHash,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      encryptionKeyVersion: data.encryptionKeyVersion ?? null,
    },
  });
}

/**
 * Locate a member by the deterministic keyed hash of their plaintext
 * memberNumber. Returns null when no match exists. Used for O(1) uniqueness
 * checks during member creation instead of an O(n) decrypt-every-row scan.
 */
export async function findMemberByNumberHash(prisma: PrismaClient, memberNumberHash: string) {
  return prisma.member.findUnique({ where: { memberNumberHash } });
}

export async function findMemberById(prisma: PrismaClient, id: string) {
  return prisma.member.findFirst({
    where: { id, deletedAt: null },
    include: {
      enrollments: { include: { package: true } },
    },
  });
}

export async function listMembers(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return prisma.member.findMany({
    where: {
      deletedAt: null,
      ...(opts.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateMember(
  prisma: PrismaClient,
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
    encryptionKeyVersion?: string;
  },
) {
  return prisma.member.update({ where: { id }, data });
}

export async function softDeleteMember(prisma: PrismaClient, id: string) {
  return prisma.member.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}

// ---- MembershipPackage ----

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
) {
  return prisma.membershipPackage.create({
    data: {
      id: randomUUID(),
      name: data.name,
      type: data.type,
      description: data.description ?? null,
      price: data.price,
      durationDays: data.durationDays ?? null,
      punchCount: data.punchCount ?? null,
      storedValue: data.storedValue ?? null,
    },
  });
}

export async function findPackageById(prisma: PrismaClient, id: string) {
  return prisma.membershipPackage.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { enrollments: true } } },
  });
}

export async function listPackages(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return prisma.membershipPackage.findMany({
    where: {
      deletedAt: null,
      ...(opts.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: 'asc' },
  });
}

export async function updatePackage(
  prisma: PrismaClient,
  id: string,
  data: { name?: string; description?: string; price?: number; isActive?: boolean },
) {
  return prisma.membershipPackage.update({ where: { id }, data });
}

// ---- MemberPackageEnrollment ----

export async function createEnrollment(
  prisma: PrismaClient,
  data: {
    memberId: string;
    packageId: string;
    status: string;
    startDate: Date;
    endDate?: Date;
    punchesUsed: number;
    remainingValue?: number;
  },
) {
  return prisma.memberPackageEnrollment.create({
    data: {
      id: randomUUID(),
      memberId: data.memberId,
      packageId: data.packageId,
      status: data.status,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      punchesUsed: data.punchesUsed,
      remainingValue: data.remainingValue ?? null,
    },
    include: { member: true, package: true },
  });
}

export async function findEnrollmentById(prisma: PrismaClient, id: string) {
  return prisma.memberPackageEnrollment.findFirst({
    where: { id },
    include: { member: true, package: true },
  });
}

export async function listEnrollmentsByMember(prisma: PrismaClient, memberId: string) {
  return prisma.memberPackageEnrollment.findMany({
    where: { memberId },
    include: { package: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateEnrollment(
  prisma: PrismaClient,
  id: string,
  data: { status?: string; endDate?: Date; punchesUsed?: number; remainingValue?: number },
) {
  return prisma.memberPackageEnrollment.update({ where: { id }, data });
}

// ---- PaymentRecord ----

export async function createPaymentRecord(
  prisma: PrismaClient,
  data: {
    memberId: string;
    enrollmentId?: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    paymentMethod?: string;
    last4Encrypted?: string;
    encryptionKeyVersion?: string;
    status: string;
    paidAt?: Date;
    createdBy: string;
    retentionExpiresAt?: Date;
  },
) {
  return prisma.paymentRecord.create({
    data: {
      id: randomUUID(),
      memberId: data.memberId,
      enrollmentId: data.enrollmentId ?? null,
      invoiceNumber: data.invoiceNumber,
      amount: data.amount,
      currency: data.currency,
      paymentMethod: data.paymentMethod ?? null,
      last4Encrypted: data.last4Encrypted ?? null,
      encryptionKeyVersion: data.encryptionKeyVersion ?? null,
      status: data.status,
      paidAt: data.paidAt ?? null,
      createdBy: data.createdBy,
      retentionExpiresAt: data.retentionExpiresAt ?? null,
    },
  });
}

export async function findPaymentById(prisma: PrismaClient, id: string) {
  return prisma.paymentRecord.findFirst({
    where: { id, deletedAt: null },
    include: { member: true, enrollment: true },
  });
}

export async function listPayments(
  prisma: PrismaClient,
  opts: { memberId?: string; status?: string } = {},
) {
  return prisma.paymentRecord.findMany({
    where: {
      deletedAt: null,
      ...(opts.memberId ? { memberId: opts.memberId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: { member: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findPaymentByInvoiceNumber(prisma: PrismaClient, invoiceNumber: string) {
  return prisma.paymentRecord.findFirst({ where: { invoiceNumber } });
}

export async function countPaymentsCreatedToday(prisma: PrismaClient, date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return prisma.paymentRecord.count({
    where: { createdAt: { gte: startOfDay, lte: endOfDay } },
  });
}

export async function updatePaymentStatus(prisma: PrismaClient, id: string, status: string) {
  return prisma.paymentRecord.update({ where: { id }, data: { status } });
}
