import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { seedUserWithSession, authHeader } from './_helpers.js';

// NOTE: Unauthenticated and schema-validation tests do NOT require a migrated DB.
// Tests that invoke real strategy queries require a migrated test database with data
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

describe('Strategy — Unauthenticated access', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('GET /api/strategy/rulesets → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/strategy/rulesets' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/strategy/rulesets → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/strategy/putaway-rank → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/putaway-rank',
      payload: { facilityId: 'x', skuId: 'y', quantity: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/strategy/pick-path → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/pick-path',
      payload: { facilityId: 'x', pickTaskIds: ['y'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/strategy/simulate → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/simulate',
      payload: { facilityId: 'x', rulesetIds: ['y'] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Strategy — Validation failures (schema enforcement)', () => {
  let app: FastifyInstance;
  const fakeAuth = { authorization: 'Bearer fake-token' };

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('POST /api/strategy/rulesets missing name → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      headers: fakeAuth,
      payload: { fifoWeight: 1.0 },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/strategy/putaway-rank missing facilityId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/putaway-rank',
      headers: fakeAuth,
      payload: { skuId: 'y', quantity: 1 },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/strategy/putaway-rank missing skuId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/putaway-rank',
      headers: fakeAuth,
      payload: { facilityId: 'x', quantity: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/strategy/putaway-rank missing quantity → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/putaway-rank',
      headers: fakeAuth,
      payload: { facilityId: 'x', skuId: 'y' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/strategy/pick-path missing facilityId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/pick-path',
      headers: fakeAuth,
      payload: { pickTaskIds: ['x'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/strategy/pick-path missing pickTaskIds → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/pick-path',
      headers: fakeAuth,
      payload: { facilityId: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/strategy/simulate missing facilityId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/simulate',
      headers: fakeAuth,
      payload: { rulesetIds: ['x'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/strategy/simulate rulesetIds=[] → 400 (minItems: 1)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/simulate',
      headers: fakeAuth,
      payload: { facilityId: 'x', rulesetIds: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /api/strategy/rulesets/:id with fifoWeight out of range → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/strategy/rulesets/some-id',
      headers: fakeAuth,
      payload: { fifoWeight: 11 }, // maximum is 10
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Strategy — Error envelope shape', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('401 response has correct envelope shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/strategy/rulesets' });
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
      url: '/api/strategy/rulesets',
      headers: { authorization: 'Bearer fake' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.meta).toHaveProperty('requestId');
  });
});

describe('Strategy — Authenticated validation failures [DB-required]', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('POST /api/strategy/rulesets missing name → 400 VALIDATION_FAILED', async () => {
    const manager = await seedUserWithSession(app, ['STRATEGY_MANAGER']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      headers: authHeader(manager.token),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/strategy/putaway-rank missing facilityId → 400 VALIDATION_FAILED', async () => {
    const manager = await seedUserWithSession(app, ['STRATEGY_MANAGER']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/putaway-rank',
      headers: authHeader(manager.token),
      payload: { skuId: 'sku-1', quantity: 1 },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/strategy/simulate rulesetIds=[] → 400 VALIDATION_FAILED', async () => {
    const manager = await seedUserWithSession(app, ['STRATEGY_MANAGER']);

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/simulate',
      headers: authHeader(manager.token),
      payload: { facilityId: 'fac-1', rulesetIds: [] },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });
});

