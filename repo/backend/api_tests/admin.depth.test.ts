import { randomUUID } from 'node:crypto';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Admin depth — backup/restore and IP allowlist enforcement', () => {
  let app: FastifyInstance;
  let backupDir: string;

  beforeEach(async () => {
    backupDir = await mkdtemp(join(tmpdir(), 'greencycle-admin-depth-'));
    app = await buildApp({
      config: {
        ...TEST_CONFIG,
        backupDir,
      },
    });
  });

  afterEach(async () => {
    await app.prisma.ipAllowlistEntry.deleteMany({});
    await app.close();
    await rm(backupDir, { recursive: true, force: true });
  });

  it('restores valid backups, rejects tampered backups, and enforces admin IP allowlist', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);

    const createBackup = await app.inject({
      method: 'POST',
      url: '/api/admin/backup',
      headers: authHeader(admin.token),
      payload: {},
      remoteAddress: '127.0.0.1',
    });
    expect(createBackup.statusCode).toBe(201);
    const createBackupBody = JSON.parse(createBackup.payload);
    const snapshotId = createBackupBody.data.id as string;

    const getSnapshot = await app.inject({
      method: 'GET',
      url: `/api/admin/backup/${snapshotId}`,
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(getSnapshot.statusCode).toBe(200);
    const getSnapshotBody = JSON.parse(getSnapshot.payload);
    expect(getSnapshotBody.data.id).toBe(snapshotId);
    expect(getSnapshotBody.data.filename).toContain('.db.enc');
    expect(getSnapshotBody.data.sizeBytes).toBeGreaterThan(0);

    const restore = await app.inject({
      method: 'POST',
      url: `/api/admin/backup/${snapshotId}/restore`,
      headers: authHeader(admin.token),
      payload: { confirm: true },
      remoteAddress: '127.0.0.1',
    });
    expect(restore.statusCode).toBe(200);

    const createTampered = await app.inject({
      method: 'POST',
      url: '/api/admin/backup',
      headers: authHeader(admin.token),
      payload: {},
      remoteAddress: '127.0.0.1',
    });
    expect(createTampered.statusCode).toBe(201);
    const tamperedSnapshotId = JSON.parse(createTampered.payload).data.id as string;

    const snapshot = await app.prisma.backupSnapshot.findUnique({
      where: { id: tamperedSnapshotId },
    });
    expect(snapshot).not.toBeNull();

    await appendFile(snapshot!.path, Buffer.from('tamper', 'utf8'));

    const restoreTampered = await app.inject({
      method: 'POST',
      url: `/api/admin/backup/${tamperedSnapshotId}/restore`,
      headers: authHeader(admin.token),
      payload: { confirm: true },
      remoteAddress: '127.0.0.1',
    });
    expect(restoreTampered.statusCode).toBe(400);
    expect(JSON.parse(restoreTampered.payload).error.code).toBe('VALIDATION_FAILED');

    const blockCidr = `203.0.113.${Math.floor(Math.random() * 200) + 1}/32`;
    const addAllowlist = await app.inject({
      method: 'POST',
      url: '/api/admin/ip-allowlist',
      headers: authHeader(admin.token),
      payload: {
        cidr: blockCidr,
        routeGroup: 'admin',
        description: `depth-${randomUUID().slice(0, 6)}`,
      },
      remoteAddress: '127.0.0.1',
    });
    expect(addAllowlist.statusCode).toBe(201);

    const blockedDiagnostics = await app.inject({
      method: 'GET',
      url: '/api/admin/diagnostics',
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(blockedDiagnostics.statusCode).toBe(403);
    expect(JSON.parse(blockedDiagnostics.payload).error.code).toBe('IP_BLOCKED');
  });

  it('restricts parameter reads to SYSTEM_ADMIN and allows admin access', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);

    await app.prisma.parameterDictionaryEntry.create({
      data: {
        key: `depth.param.${randomUUID().slice(0, 8)}`,
        value: 'enabled',
        updatedBy: admin.id,
      },
    });

    const managerRead = await app.inject({
      method: 'GET',
      url: '/api/admin/parameters',
      headers: authHeader(manager.token),
      remoteAddress: '127.0.0.1',
    });
    expect(managerRead.statusCode).toBe(403);
    expect(JSON.parse(managerRead.payload).error.code).toBe('FORBIDDEN');

    const adminRead = await app.inject({
      method: 'GET',
      url: '/api/admin/parameters',
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(adminRead.statusCode).toBe(200);
    const body = JSON.parse(adminRead.payload);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('supports parameter key get/update/delete lifecycle', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);

    const key = `depth.lifecycle.${randomUUID().slice(0, 8)}`;

    const createParam = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      headers: authHeader(admin.token),
      payload: { key, value: 'v1', description: 'created in depth test' },
      remoteAddress: '127.0.0.1',
    });
    expect(createParam.statusCode).toBe(201);
    const createdParamBody = JSON.parse(createParam.payload);
    const createdParamId = createdParamBody.data.id as string;

    const getParam = await app.inject({
      method: 'GET',
      url: `/api/admin/parameters/${key}`,
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(getParam.statusCode).toBe(200);
    expect(JSON.parse(getParam.payload).data.value).toBe('v1');

    const updateParam = await app.inject({
      method: 'PUT',
      url: `/api/admin/parameters/${key}`,
      headers: authHeader(admin.token),
      payload: { value: 'v2', description: 'updated in depth test' },
      remoteAddress: '127.0.0.1',
    });
    expect(updateParam.statusCode).toBe(200);
    expect(JSON.parse(updateParam.payload).data.value).toBe('v2');

    const deleteParam = await app.inject({
      method: 'DELETE',
      url: `/api/admin/parameters/${key}`,
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(deleteParam.statusCode).toBe(204);

    const getDeleted = await app.inject({
      method: 'GET',
      url: `/api/admin/parameters/${key}`,
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(getDeleted.statusCode).toBe(404);
    expect(JSON.parse(getDeleted.payload).error.code).toBe('NOT_FOUND');

    const recreateParam = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      headers: authHeader(admin.token),
      payload: { key, value: 'v3', description: 'restored in depth test' },
      remoteAddress: '127.0.0.1',
    });
    expect(recreateParam.statusCode).toBe(201);
    const recreatedBody = JSON.parse(recreateParam.payload);
    expect(recreatedBody.data.id).toBe(createdParamId);
    expect(recreatedBody.data.value).toBe('v3');

    const getRestored = await app.inject({
      method: 'GET',
      url: `/api/admin/parameters/${key}`,
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(getRestored.statusCode).toBe(200);
    expect(JSON.parse(getRestored.payload).data.value).toBe('v3');
  });

  it('supports ip allowlist patch and delete by entry id', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);

    const createEntry = await app.inject({
      method: 'POST',
      url: '/api/admin/ip-allowlist',
      headers: authHeader(admin.token),
      payload: {
        cidr: '198.51.100.7/32',
        routeGroup: 'admin',
        description: 'depth-entry-initial',
      },
      remoteAddress: '127.0.0.1',
    });
    expect(createEntry.statusCode).toBe(201);
    const entryId = JSON.parse(createEntry.payload).data.id as string;

    const patchEntry = await app.inject({
      method: 'PATCH',
      url: `/api/admin/ip-allowlist/${entryId}`,
      headers: authHeader(admin.token),
      payload: { cidr: '198.51.100.8/32', isActive: false, description: 'depth-entry-updated' },
      remoteAddress: '127.0.0.1',
    });
    expect(patchEntry.statusCode).toBe(200);
    const patchBody = JSON.parse(patchEntry.payload);
    expect(patchBody.data.id).toBe(entryId);
    expect(patchBody.data.cidr).toBe('198.51.100.8/32');
    expect(patchBody.data.isActive).toBe(false);

    const listEntries = await app.inject({
      method: 'GET',
      url: '/api/admin/ip-allowlist?routeGroup=admin',
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(listEntries.statusCode).toBe(200);
    const listed = JSON.parse(listEntries.payload).data as Array<{ id: string }>;
    expect(listed.some((e) => e.id === entryId)).toBe(true);

    const deleteEntry = await app.inject({
      method: 'DELETE',
      url: `/api/admin/ip-allowlist/${entryId}`,
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(deleteEntry.statusCode).toBe(204);

    const listAfterDelete = await app.inject({
      method: 'GET',
      url: '/api/admin/ip-allowlist?routeGroup=admin',
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(listAfterDelete.statusCode).toBe(200);
    const listedAfterDelete = JSON.parse(listAfterDelete.payload).data as Array<{ id: string }>;
    expect(listedAfterDelete.some((e) => e.id === entryId)).toBe(false);
  });

  it('returns structured retention report and purge result payloads', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);

    const report = await app.inject({
      method: 'GET',
      url: '/api/admin/retention/report',
      headers: authHeader(admin.token),
      remoteAddress: '127.0.0.1',
    });
    expect(report.statusCode).toBe(200);
    const reportBody = JSON.parse(report.payload);
    expect(typeof reportBody.data.reportedAt).toBe('string');
    expect(typeof reportBody.data.billing.eligibleForPurge).toBe('number');
    expect(typeof reportBody.data.billing.retentionYears).toBe('number');
    expect(typeof reportBody.data.operational.auditEventsEligible).toBe('number');
    expect(typeof reportBody.data.operational.operationHistoryEligible).toBe('number');

    const purgeBilling = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-billing',
      headers: authHeader(admin.token),
      payload: { confirm: true },
      remoteAddress: '127.0.0.1',
    });
    expect(purgeBilling.statusCode).toBe(200);
    const purgeBillingBody = JSON.parse(purgeBilling.payload);
    expect(purgeBillingBody.data.domain).toBe('billing');
    expect(typeof purgeBillingBody.data.purgedCount).toBe('number');
    expect(typeof purgeBillingBody.data.purgedAt).toBe('string');

    const purgeOperational = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-operational',
      headers: authHeader(admin.token),
      payload: { confirm: true },
      remoteAddress: '127.0.0.1',
    });
    expect(purgeOperational.statusCode).toBe(200);
    const purgeOperationalBody = JSON.parse(purgeOperational.payload);
    expect(purgeOperationalBody.data.domain).toBe('operational');
    expect(typeof purgeOperationalBody.data.auditEventsPurged).toBe('number');
    expect(typeof purgeOperationalBody.data.operationHistoryPurged).toBe('number');
    expect(typeof purgeOperationalBody.data.cutoffDate).toBe('string');
  });

  it('denies admin routes in strict allowlist mode when no active entries exist', async () => {
    const strictApp = await buildApp({
      config: {
        ...TEST_CONFIG,
        backupDir,
        ipAllowlistStrictMode: true,
      },
    });

    try {
      const admin = await seedUserWithSession(strictApp, ['SYSTEM_ADMIN']);

      const response = await strictApp.inject({
        method: 'GET',
        url: '/api/admin/diagnostics',
        headers: authHeader(admin.token),
        remoteAddress: '127.0.0.1',
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload).error.code).toBe('IP_BLOCKED');
    } finally {
      await strictApp.close();
    }
  });
});
