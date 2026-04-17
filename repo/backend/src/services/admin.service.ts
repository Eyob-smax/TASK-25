import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { encryptBuffer, decryptBuffer } from '../security/encryption.js';
import { validateSnapshotPath } from '../shared/invariants.js';
import { auditCreate, auditUpdate, auditTransition } from '../audit/audit.js';
import { ErrorCode } from '../shared/envelope.js';
import { RETENTION_YEARS } from '../shared/types.js';
import {
  getActiveKeyVersion,
  getDecryptionKeyVersions,
  createInitialKeyVersion,
  rotateKeyVersion,
} from '../repositories/keyversion.repository.js';
import {
  createBackupSnapshot,
  findBackupSnapshotById,
  listBackupSnapshots,
  updateBackupSnapshot,
  createParameter,
  findParameterByKey,
  listParameters,
  updateParameter,
  deleteParameter,
  createIpAllowlistEntry,
  findIpAllowlistEntryById,
  listIpAllowlistEntries,
  updateIpAllowlistEntry,
  deleteIpAllowlistEntry,
  countEligibleBillingRecords,
  purgeEligibleBillingRecords,
  countOldAuditEvents,
  purgeOldAuditEvents,
  countOldOperationHistory,
  purgeOldOperationHistory,
  getDatabaseCounts,
} from '../repositories/admin.repository.js';

export class AdminServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminServiceError';
  }
}

// ---- Internal helpers ----

function parseDatabasePath(databaseUrl: string): string {
  const raw = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl;
  return resolve(process.cwd(), raw);
}

function operationalCutoff(now: Date): Date {
  return new Date(
    now.getTime() - RETENTION_YEARS.operational * 365 * 24 * 60 * 60 * 1000,
  );
}

function isValidCidrFormat(cidr: string): boolean {
  if (!cidr.includes('/')) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(cidr);
  }
  const slashIdx = cidr.lastIndexOf('/');
  const ip = cidr.slice(0, slashIdx);
  const prefixNum = parseInt(cidr.slice(slashIdx + 1), 10);
  return (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    !isNaN(prefixNum) &&
    prefixNum >= 0 &&
    prefixNum <= 32
  );
}

// ---- Backup ----

export async function createBackup(
  prisma: PrismaClient,
  databaseUrl: string,
  backupDir: string,
  masterKey: Buffer,
  actorId: string,
) {
  const dbPath = parseDatabasePath(databaseUrl);
  const resolvedBackupDir = resolve(process.cwd(), backupDir);

  let dbBuffer: Buffer;
  try {
    dbBuffer = await readFile(dbPath);
  } catch (err) {
    throw new AdminServiceError(
      ErrorCode.INTERNAL_ERROR,
      `Cannot read database file: ${(err as Error).message}`,
    );
  }

  const activeKey = await getActiveKeyVersion(prisma);
  const keyVersion = activeKey?.version ?? 1;

  const encryptedBuffer = encryptBuffer(dbBuffer, masterKey, keyVersion);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `greencycle-backup-${timestamp}.db.enc`;

  await mkdir(resolvedBackupDir, { recursive: true });
  const fullPath = validateSnapshotPath(resolvedBackupDir, filename);
  await writeFile(fullPath, encryptedBuffer);

  const checksum = createHash('sha256').update(encryptedBuffer).digest('hex');

  const snapshot = await createBackupSnapshot(prisma, {
    filename,
    path: fullPath,
    sizeBytes: encryptedBuffer.length,
    encryptionKeyVersion: keyVersion,
    checksum,
    status: 'COMPLETED',
    createdBy: actorId,
  });

  await auditCreate(prisma, actorId, 'BackupSnapshot', snapshot.id, {
    filename,
    sizeBytes: encryptedBuffer.length,
    encryptionKeyVersion: keyVersion,
    checksum,
  });

  return snapshot;
}

export async function listBackups(prisma: PrismaClient) {
  return listBackupSnapshots(prisma);
}

export async function getBackup(prisma: PrismaClient, snapshotId: string) {
  const snapshot = await findBackupSnapshotById(prisma, snapshotId);
  if (!snapshot) throw new AdminServiceError(ErrorCode.NOT_FOUND, 'Backup snapshot not found');
  return snapshot;
}

export async function restoreBackup(
  prisma: PrismaClient,
  snapshotId: string,
  databaseUrl: string,
  backupDir: string,
  masterKey: Buffer,
  actorId: string,
) {
  const snapshot = await findBackupSnapshotById(prisma, snapshotId);
  if (!snapshot) throw new AdminServiceError(ErrorCode.NOT_FOUND, 'Backup snapshot not found');

  if (snapshot.status !== 'COMPLETED') {
    throw new AdminServiceError(
      ErrorCode.CONFLICT,
      `Cannot restore snapshot with status ${snapshot.status}`,
    );
  }

  const resolvedBackupDir = resolve(process.cwd(), backupDir);
  let safePath: string;
  try {
    safePath = validateSnapshotPath(resolvedBackupDir, snapshot.filename);
  } catch {
    throw new AdminServiceError(
      ErrorCode.VALIDATION_FAILED,
      'Snapshot path failed safety validation',
    );
  }

  if (safePath !== snapshot.path) {
    throw new AdminServiceError(
      ErrorCode.VALIDATION_FAILED,
      'Snapshot path does not match stored record',
    );
  }

  let encryptedBuffer: Buffer;
  try {
    encryptedBuffer = await readFile(snapshot.path);
  } catch (err) {
    throw new AdminServiceError(
      ErrorCode.NOT_FOUND,
      `Backup file not found on disk: ${(err as Error).message}`,
    );
  }

  // Verify integrity before decryption
  const actualChecksum = createHash('sha256').update(encryptedBuffer).digest('hex');
  if (actualChecksum !== snapshot.checksum) {
    throw new AdminServiceError(
      ErrorCode.VALIDATION_FAILED,
      'Backup checksum verification failed — file may be corrupted or tampered',
    );
  }

  let decryptedBuffer: Buffer;
  try {
    decryptedBuffer = decryptBuffer(encryptedBuffer, masterKey);
  } catch (err) {
    throw new AdminServiceError(
      ErrorCode.VALIDATION_FAILED,
      `Backup decryption failed: ${(err as Error).message}`,
    );
  }

  // Write decrypted DB to a staging path; the operator replaces the live file after service stop
  const dbPath = parseDatabasePath(databaseUrl);
  const stagingPath = `${dbPath}.restore`;
  await writeFile(stagingPath, decryptedBuffer);

  await updateBackupSnapshot(prisma, snapshotId, {
    status: 'RESTORED',
    restoredAt: new Date(),
    restoredBy: actorId,
  });

  await auditTransition(prisma, actorId, 'BackupSnapshot', snapshotId, 'COMPLETED', 'RESTORED');

  return {
    snapshotId,
    stagingPath,
    instructions:
      'Backup decrypted to staging path. Stop the service, move the staging file to replace the active database file, then restart the service.',
  };
}

// ---- Retention ----

export async function getRetentionReport(prisma: PrismaClient) {
  const now = new Date();
  const cutoff = operationalCutoff(now);

  const [billingEligible, auditEventsEligible, operationHistoryEligible] = await Promise.all([
    countEligibleBillingRecords(prisma, now),
    countOldAuditEvents(prisma, cutoff),
    countOldOperationHistory(prisma, cutoff),
  ]);

  return {
    reportedAt: now.toISOString(),
    billing: {
      eligibleForPurge: billingEligible,
      retentionYears: RETENTION_YEARS.billing,
      policy:
        'Hard delete soft-deleted PaymentRecord rows where retentionExpiresAt < now',
    },
    operational: {
      cutoffDate: cutoff.toISOString(),
      retentionYears: RETENTION_YEARS.operational,
      auditEventsEligible,
      operationHistoryEligible,
      policy:
        'Hard delete AuditEvent and AppointmentOperationHistory rows older than 2 years',
    },
  };
}

export async function purgeBillingRecords(prisma: PrismaClient, actorId: string) {
  const now = new Date();
  const result = await purgeEligibleBillingRecords(prisma, now);
  await auditCreate(prisma, actorId, 'RetentionPurge', 'billing', {
    domain: 'billing',
    purgedCount: result.count,
    purgedAt: now.toISOString(),
  });
  return { domain: 'billing', purgedCount: result.count, purgedAt: now.toISOString() };
}

export async function purgeOperationalLogs(prisma: PrismaClient, actorId: string) {
  const now = new Date();
  const cutoff = operationalCutoff(now);

  const [auditResult, historyResult] = await Promise.all([
    purgeOldAuditEvents(prisma, cutoff),
    purgeOldOperationHistory(prisma, cutoff),
  ]);

  // New audit event has current timestamp — not subject to the purge window
  await auditCreate(prisma, actorId, 'RetentionPurge', 'operational', {
    domain: 'operational',
    cutoffDate: cutoff.toISOString(),
    auditEventsPurged: auditResult.count,
    operationHistoryPurged: historyResult.count,
    purgedAt: now.toISOString(),
  });

  return {
    domain: 'operational',
    cutoffDate: cutoff.toISOString(),
    auditEventsPurged: auditResult.count,
    operationHistoryPurged: historyResult.count,
    purgedAt: now.toISOString(),
  };
}

// ---- Parameter Dictionary ----

export async function listAllParameters(prisma: PrismaClient) {
  return listParameters(prisma);
}

export async function getParameter(prisma: PrismaClient, key: string) {
  const param = await findParameterByKey(prisma, key);
  if (!param) throw new AdminServiceError(ErrorCode.NOT_FOUND, `Parameter '${key}' not found`);
  return param;
}

export async function setParameter(
  prisma: PrismaClient,
  data: { key: string; value: string; description?: string },
  actorId: string,
) {
  const existing = await findParameterByKey(prisma, data.key);
  if (existing) {
    throw new AdminServiceError(ErrorCode.CONFLICT, `Parameter '${data.key}' already exists`);
  }
  const param = await createParameter(prisma, { ...data, updatedBy: actorId });
  await auditCreate(prisma, actorId, 'Parameter', param.id, { key: param.key });
  return param;
}

export async function updateParameterValue(
  prisma: PrismaClient,
  key: string,
  data: { value: string; description?: string },
  actorId: string,
) {
  const existing = await findParameterByKey(prisma, key);
  if (!existing) throw new AdminServiceError(ErrorCode.NOT_FOUND, `Parameter '${key}' not found`);
  const updated = await updateParameter(prisma, key, { ...data, updatedBy: actorId });
  await auditUpdate(
    prisma,
    actorId,
    'Parameter',
    existing.id,
    { value: existing.value },
    { value: updated.value },
  );
  return updated;
}

export async function removeParameter(prisma: PrismaClient, key: string, actorId: string) {
  const existing = await findParameterByKey(prisma, key);
  if (!existing) throw new AdminServiceError(ErrorCode.NOT_FOUND, `Parameter '${key}' not found`);
  await deleteParameter(prisma, key);
  await auditUpdate(prisma, actorId, 'Parameter', existing.id, { key }, { deleted: true });
}

// ---- IP Allowlist ----

export async function listIpAllowlist(prisma: PrismaClient, routeGroup?: string) {
  return listIpAllowlistEntries(prisma, routeGroup);
}

export async function addIpAllowlistEntry(
  prisma: PrismaClient,
  data: { cidr: string; routeGroup: string; description?: string; isActive?: boolean },
  actorId: string,
) {
  if (!isValidCidrFormat(data.cidr)) {
    throw new AdminServiceError(ErrorCode.VALIDATION_FAILED, `Invalid CIDR format: ${data.cidr}`);
  }
  const entry = await createIpAllowlistEntry(prisma, data);
  await auditCreate(prisma, actorId, 'IpAllowlistEntry', entry.id, {
    cidr: data.cidr,
    routeGroup: data.routeGroup,
  });
  return entry;
}

export async function modifyIpAllowlistEntry(
  prisma: PrismaClient,
  entryId: string,
  data: { cidr?: string; isActive?: boolean; description?: string },
  actorId: string,
) {
  const entry = await findIpAllowlistEntryById(prisma, entryId);
  if (!entry) throw new AdminServiceError(ErrorCode.NOT_FOUND, 'IP allowlist entry not found');
  if (data.cidr && !isValidCidrFormat(data.cidr)) {
    throw new AdminServiceError(ErrorCode.VALIDATION_FAILED, `Invalid CIDR format: ${data.cidr}`);
  }
  const updated = await updateIpAllowlistEntry(prisma, entryId, data);
  await auditUpdate(
    prisma,
    actorId,
    'IpAllowlistEntry',
    entryId,
    { cidr: entry.cidr, isActive: entry.isActive },
    { cidr: updated.cidr, isActive: updated.isActive },
  );
  return updated;
}

export async function removeIpAllowlistEntry(
  prisma: PrismaClient,
  entryId: string,
  actorId: string,
) {
  const entry = await findIpAllowlistEntryById(prisma, entryId);
  if (!entry) throw new AdminServiceError(ErrorCode.NOT_FOUND, 'IP allowlist entry not found');
  await deleteIpAllowlistEntry(prisma, entryId);
  await auditUpdate(
    prisma,
    actorId,
    'IpAllowlistEntry',
    entryId,
    { cidr: entry.cidr, isActive: entry.isActive },
    { deleted: true },
  );
}

// ---- Encryption Key Versions ----

export async function listEncryptionKeyVersions(prisma: PrismaClient) {
  return getDecryptionKeyVersions(prisma);
}

export async function triggerKeyRotation(
  prisma: PrismaClient,
  keyHash: string,
  actorId: string,
) {
  const active = await getActiveKeyVersion(prisma);
  const newVersion = active
    ? await rotateKeyVersion(prisma, active.version, keyHash)
    : await createInitialKeyVersion(prisma, keyHash);

  await auditCreate(prisma, actorId, 'EncryptionKeyVersion', newVersion.id, {
    version: newVersion.version,
    status: newVersion.status,
    expiresAt: newVersion.expiresAt?.toISOString() ?? null,
    previousVersion: active?.version ?? null,
  });

  return newVersion;
}

// ---- Diagnostics ----

export async function getDiagnostics(prisma: PrismaClient) {
  const mem = process.memoryUsage();
  const [counts, activeKey] = await Promise.all([
    getDatabaseCounts(prisma),
    getActiveKeyVersion(prisma),
  ]);

  return {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      externalBytes: mem.external,
    },
    database: counts,
    encryption: {
      activeKeyVersion: activeKey?.version ?? null,
      keyExpiresAt: activeKey?.expiresAt?.toISOString() ?? null,
      rotationOverdue: activeKey?.expiresAt ? new Date() >= activeKey.expiresAt : false,
    },
    performance: {
      note: 'Query design targets p95 < 200ms at 50 concurrent requests on single-node SQLite. This is a design target — not a benchmarked claim.',
      paginationDefaults: { pageSize: 20, maxPageSize: 100 },
      indexStrategy: [
        'Appointment(facilityId, state) — appointment list by facility',
        'PickTask(status, completedAt) — simulation and wave completion checks',
        'Article(state, publishedAt) — published article listing',
        'AuditEvent(timestamp) — retention window queries',
        'ArticleInteraction(createdAt) — trending tag window queries',
        'ArticleInteraction(type, createdAt) — per-type interaction analytics',
        'MemberPackageEnrollment(memberId, status) — active enrollment lookups',
      ],
    },
  };
}
