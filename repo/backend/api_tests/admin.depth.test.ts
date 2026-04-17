import { randomUUID } from 'node:crypto';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    const snapshotId = JSON.parse(createBackup.payload).data.id as string;

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

  it('fails closed with 500 when allowlist lookup errors', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);

    const findManySpy = vi
      .spyOn(app.prisma.ipAllowlistEntry, 'findMany')
      .mockRejectedValueOnce(new Error('allowlist lookup failure'));

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/diagnostics',
        headers: authHeader(admin.token),
        remoteAddress: '127.0.0.1',
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.payload).error.code).toBe('INTERNAL_ERROR');
    } finally {
      findManySpy.mockRestore();
    }
  });
});
