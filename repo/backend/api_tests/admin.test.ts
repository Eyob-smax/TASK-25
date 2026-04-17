import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// NOTE: Tests below cover unauthenticated (→ 401) and schema-validation (→ 400) paths.
// These do NOT require a migrated database.
// Tests that exercise real backup/restore operations are marked [DB-required]
// and run inside Docker via run_tests.sh.

const TEST_CONFIG = {
  port: 0,
  host: '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL ?? 'file:../database/test.db',
  nodeEnv: 'test' as const,
  logLevel: 'silent' as const,
  encryptionMasterKey: 'ab'.repeat(32),
  sessionTimeoutHours: 8,
  loginMaxAttempts: 5,
  loginWindowMinutes: 15,
  backupDir: '/tmp/greencycle-test-backups',
};

describe('Admin — Unauthenticated access', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('GET /api/admin/diagnostics → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/diagnostics' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/admin/backup → 401 without token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/backup', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/backup → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/backup' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/backup/:id/restore → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/backup/fake-id/restore',
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/retention/report → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/retention/report' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/retention/purge-billing → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-billing',
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/retention/purge-operational → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-operational',
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/parameters → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/parameters' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/parameters → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      payload: { key: 'test.key', value: 'test-value' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/ip-allowlist → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/ip-allowlist' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/ip-allowlist → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/ip-allowlist',
      payload: { cidr: '192.168.1.0/24', routeGroup: 'admin' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/key-versions → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/key-versions' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/key-versions/rotate → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/key-versions/rotate',
      payload: { keyHash: 'abc123' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Admin — Validation failures', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('POST /api/admin/parameters missing key → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      headers: { authorization: 'Bearer fake-token' },
      payload: { value: 'some-value' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('POST /api/admin/parameters missing value → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      headers: { authorization: 'Bearer fake-token' },
      payload: { key: 'test.param' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/parameters key with invalid characters → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      headers: { authorization: 'Bearer fake-token' },
      payload: { key: 'test key with spaces!', value: 'v' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/admin/parameters/:key missing value → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/parameters/some-key',
      headers: { authorization: 'Bearer fake-token' },
      payload: { description: 'desc only' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/ip-allowlist missing cidr → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/ip-allowlist',
      headers: { authorization: 'Bearer fake-token' },
      payload: { routeGroup: 'admin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/ip-allowlist missing routeGroup → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/ip-allowlist',
      headers: { authorization: 'Bearer fake-token' },
      payload: { cidr: '10.0.0.0/8' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/ip-allowlist invalid routeGroup → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/ip-allowlist',
      headers: { authorization: 'Bearer fake-token' },
      payload: { cidr: '10.0.0.0/8', routeGroup: 'totally-invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/retention/purge-billing missing confirm → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-billing',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/retention/purge-billing confirm=false → 400 (must be true)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-billing',
      headers: { authorization: 'Bearer fake-token' },
      payload: { confirm: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/retention/purge-operational missing confirm → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-operational',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/backup/:id/restore missing confirm → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/backup/fake-id/restore',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/backup/:id/restore confirm=false → 400 (must be true)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/backup/fake-id/restore',
      headers: { authorization: 'Bearer fake-token' },
      payload: { confirm: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/admin/key-versions/rotate missing keyHash → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/key-versions/rotate',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Admin — Error envelope shape', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('unauthenticated 401 has correct envelope shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/diagnostics' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('success', false);
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('requestId');
    expect(body.meta).toHaveProperty('timestamp');
  });

  it('validation error 400 has correct envelope shape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('success', false);
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('requestId');
  });
});
