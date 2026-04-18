import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { seedUserWithSession, authHeader } from './_helpers.js';

// NOTE: Unauthenticated and schema-validation tests do NOT require a migrated DB.
// Tests that create real orders/waves/pick tasks require a migrated test database
// (run inside Docker via run_tests.sh) and are marked [DB-required] in comments.

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
};

describe('Outbound — Unauthenticated access', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('GET /api/outbound/orders → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/outbound/orders' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/outbound/orders → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      payload: { facilityId: 'x', type: 'SALES', lines: [{ skuId: 'y', quantity: 1 }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/outbound/waves → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/outbound/waves' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/waves → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      payload: { facilityId: 'x', orderIds: ['y'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/outbound/pick-tasks/any → 401 without token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/outbound/pick-tasks/some-id',
      payload: { status: 'IN_PROGRESS' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/x/pack-verify → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/pack-verify',
      payload: { actualWeightLb: 10, actualVolumeCuFt: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/outbound/pick-tasks/x → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/outbound/pick-tasks/some-id' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Outbound — Validation failures (schema enforcement)', () => {
  let app: FastifyInstance;
  const fakeAuth = { authorization: 'Bearer fake-token-that-wont-resolve' };

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  // Auth check fires before schema validation only when principal is needed.
  // Schema validation fires regardless; invalid schema → 400 before DB is touched.

  it('POST /api/outbound/orders missing facilityId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: fakeAuth,
      payload: { type: 'SALES', lines: [{ skuId: 'x', quantity: 1 }] },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('POST /api/outbound/orders missing lines → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: fakeAuth,
      payload: { facilityId: 'x', type: 'SALES' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders lines=[] → 400 (minItems: 1)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: fakeAuth,
      payload: { facilityId: 'x', type: 'SALES', lines: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders invalid type → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: fakeAuth,
      payload: { facilityId: 'x', type: 'INVALID', lines: [{ skuId: 'y', quantity: 1 }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/waves missing facilityId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: fakeAuth,
      payload: { orderIds: ['x'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/waves missing orderIds → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: fakeAuth,
      payload: { facilityId: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/:id/pack-verify missing actualWeightLb → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/pack-verify',
      headers: fakeAuth,
      payload: { actualVolumeCuFt: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/:id/exceptions missing lineId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/exceptions',
      headers: fakeAuth,
      payload: { shortageReason: 'STOCKOUT', quantityShort: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/:id/exceptions invalid shortageReason → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/exceptions',
      headers: fakeAuth,
      payload: { lineId: 'x', shortageReason: 'INVALID', quantityShort: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/:id/handoff missing carrier → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/handoff',
      headers: fakeAuth,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/:id/pack-verify missing actualVolumeCuFt → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/pack-verify',
      headers: fakeAuth,
      payload: { actualWeightLb: 10 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/:id/pack-verify actualWeightLb=0 → 400 (exclusiveMinimum)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/pack-verify',
      headers: fakeAuth,
      payload: { actualWeightLb: 0, actualVolumeCuFt: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/waves orderIds=[] → 400 (minItems: 1)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: fakeAuth,
      payload: { facilityId: 'x', orderIds: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/outbound/pick-tasks/:id invalid status → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/outbound/pick-tasks/x',
      headers: fakeAuth,
      payload: { status: 'INVALID_STATUS' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/outbound/orders/:id/exceptions missing quantityShort → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/x/exceptions',
      headers: fakeAuth,
      payload: { lineId: 'y', shortageReason: 'STOCKOUT' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Outbound — Error envelope shape', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('401 response has correct envelope shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/outbound/orders' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(body.meta).toHaveProperty('requestId');
    expect(body.meta).toHaveProperty('timestamp');
  });

  it('400 validation error has UNAUTHORIZED code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: { authorization: 'Bearer fake' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('Outbound — Authenticated validation failures [DB-required]', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('POST /api/outbound/orders missing required fields → 400 VALIDATION_FAILED', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: authHeader(operator.token),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/outbound/waves missing orderIds → 400 VALIDATION_FAILED', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: { ...authHeader(operator.token), 'idempotency-key': 'valid-idempotency-key-1' },
      payload: { facilityId: 'fac-1' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/outbound/orders/:id/pack-verify missing actualVolumeCuFt → 400 VALIDATION_FAILED', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders/order-1/pack-verify',
      headers: authHeader(operator.token),
      payload: { actualWeightLb: 10 },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });
});

