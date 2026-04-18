import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ---- BackupSnapshot ----

export async function createBackupSnapshot(
  prisma: PrismaClient,
  data: {
    filename: string;
    path: string;
    sizeBytes: number;
    encryptionKeyVersion: number;
    checksum: string;
    status: string;
    createdBy: string;
  },
) {
  return prisma.backupSnapshot.create({
    data: { id: randomUUID(), ...data },
  });
}

export async function findBackupSnapshotById(prisma: PrismaClient, id: string) {
  return prisma.backupSnapshot.findUnique({ where: { id } });
}

export async function listBackupSnapshots(prisma: PrismaClient) {
  return prisma.backupSnapshot.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function updateBackupSnapshot(
  prisma: PrismaClient,
  id: string,
  data: { status?: string; restoredAt?: Date; restoredBy?: string },
) {
  return prisma.backupSnapshot.update({ where: { id }, data });
}

// ---- ParameterDictionaryEntry ----

export async function createParameter(
  prisma: PrismaClient,
  data: { key: string; value: string; description?: string; updatedBy: string },
) {
  return prisma.parameterDictionaryEntry.create({
    data: {
      id: randomUUID(),
      key: data.key,
      value: data.value,
      description: data.description ?? null,
      updatedBy: data.updatedBy,
    },
  });
}

export async function findParameterByKey(prisma: PrismaClient, key: string) {
  return prisma.parameterDictionaryEntry.findFirst({ where: { key, deletedAt: null } });
}

export async function findParameterByKeyIncludingDeleted(prisma: PrismaClient, key: string) {
  return prisma.parameterDictionaryEntry.findUnique({ where: { key } });
}

export async function listParameters(prisma: PrismaClient) {
  return prisma.parameterDictionaryEntry.findMany({
    where: { deletedAt: null },
    orderBy: { key: 'asc' },
  });
}

export async function updateParameter(
  prisma: PrismaClient,
  key: string,
  data: { value: string; description?: string; updatedBy: string },
) {
  return prisma.parameterDictionaryEntry.update({
    where: { key },
    data: {
      value: data.value,
      description: data.description ?? undefined,
      updatedBy: data.updatedBy,
    },
  });
}

export async function restoreParameter(
  prisma: PrismaClient,
  key: string,
  data: { value: string; description?: string; updatedBy: string },
) {
  return prisma.parameterDictionaryEntry.update({
    where: { key },
    data: {
      value: data.value,
      description: data.description ?? null,
      updatedBy: data.updatedBy,
      deletedAt: null,
      deletedBy: null,
    },
  });
}

export async function softDeleteParameter(
  prisma: PrismaClient,
  key: string,
  deletedBy: string,
) {
  return prisma.parameterDictionaryEntry.update({
    where: { key },
    data: {
      deletedAt: new Date(),
      deletedBy,
    },
  });
}

// ---- IpAllowlistEntry ----

export async function createIpAllowlistEntry(
  prisma: PrismaClient,
  data: { cidr: string; routeGroup: string; description?: string; isActive?: boolean },
) {
  return prisma.ipAllowlistEntry.create({
    data: {
      id: randomUUID(),
      cidr: data.cidr,
      routeGroup: data.routeGroup,
      description: data.description ?? null,
      isActive: data.isActive ?? true,
    },
  });
}

export async function findIpAllowlistEntryById(prisma: PrismaClient, id: string) {
  return prisma.ipAllowlistEntry.findFirst({ where: { id, deletedAt: null } });
}

export async function listIpAllowlistEntries(
  prisma: PrismaClient,
  routeGroup?: string,
) {
  return prisma.ipAllowlistEntry.findMany({
    where: {
      deletedAt: null,
      ...(routeGroup ? { routeGroup } : {}),
    },
    orderBy: [{ routeGroup: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function updateIpAllowlistEntry(
  prisma: PrismaClient,
  id: string,
  data: { cidr?: string; isActive?: boolean; description?: string },
) {
  return prisma.ipAllowlistEntry.update({ where: { id }, data });
}

export async function softDeleteIpAllowlistEntry(
  prisma: PrismaClient,
  id: string,
  deletedBy: string,
) {
  return prisma.ipAllowlistEntry.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedBy,
      isActive: false,
    },
  });
}

// ---- Retention queries ----

// Billing purge is gated on retentionExpiresAt, which is set to
// deletedAt + 7y when a PaymentRecord is soft-deleted. Records without
// an expiry (still active, or never anchored) are never eligible.
export async function countEligibleBillingRecords(prisma: PrismaClient, now: Date) {
  return prisma.paymentRecord.count({
    where: {
      deletedAt: { not: null },
      retentionExpiresAt: { not: null, lt: now },
    },
  });
}

export async function purgeEligibleBillingRecords(prisma: PrismaClient, now: Date) {
  return prisma.paymentRecord.deleteMany({
    where: {
      deletedAt: { not: null },
      retentionExpiresAt: { not: null, lt: now },
    },
  });
}

export async function countOldAuditEvents(prisma: PrismaClient, cutoff: Date) {
  return prisma.auditEvent.count({ where: { timestamp: { lt: cutoff } } });
}

export async function purgeOldAuditEvents(prisma: PrismaClient, cutoff: Date) {
  return prisma.auditEvent.deleteMany({ where: { timestamp: { lt: cutoff } } });
}

export async function countOldOperationHistory(prisma: PrismaClient, cutoff: Date) {
  return prisma.appointmentOperationHistory.count({ where: { timestamp: { lt: cutoff } } });
}

export async function purgeOldOperationHistory(prisma: PrismaClient, cutoff: Date) {
  return prisma.appointmentOperationHistory.deleteMany({ where: { timestamp: { lt: cutoff } } });
}

// ---- DB record counts for diagnostics ----

export async function getDatabaseCounts(prisma: PrismaClient) {
  const [
    users,
    activeSessions,
    articles,
    members,
    payments,
    auditEvents,
    backupSnapshots,
    parameters,
    activeIpAllowlistEntries,
    outboundOrders,
    appointments,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.article.count({ where: { deletedAt: null } }),
    prisma.member.count({ where: { deletedAt: null } }),
    prisma.paymentRecord.count({ where: { deletedAt: null } }),
    prisma.auditEvent.count(),
    prisma.backupSnapshot.count(),
    prisma.parameterDictionaryEntry.count({ where: { deletedAt: null } }),
    prisma.ipAllowlistEntry.count({ where: { isActive: true, deletedAt: null } }),
    prisma.outboundOrder.count({ where: { deletedAt: null } }),
    prisma.appointment.count(),
  ]);
  return {
    users,
    activeSessions,
    articles,
    members,
    payments,
    auditEvents,
    backupSnapshots,
    parameters,
    activeIpAllowlistEntries,
    outboundOrders,
    appointments,
  };
}
