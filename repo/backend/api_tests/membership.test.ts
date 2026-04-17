import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// NOTE: Unauthenticated and schema-validation tests do NOT require a migrated DB.
// Tests that create real members/packages/payments require a migrated test database
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

describe('Membership — Unauthenticated access', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('GET /api/membership/members → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/membership/members' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/membership/members → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      payload: { memberNumber: 'M001', firstName: 'Jane', lastName: 'Doe' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/membership/packages → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/membership/packages' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/membership/payments → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      payload: { memberId: 'x', amount: 50 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/membership/payments → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/membership/payments' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Membership — Validation failures', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('POST /api/membership/members missing memberNumber → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      headers: { authorization: 'Bearer fake-token' },
      payload: { firstName: 'Jane', lastName: 'Doe' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('POST /api/membership/members missing firstName → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      headers: { authorization: 'Bearer fake-token' },
      payload: { memberNumber: 'M001', lastName: 'Doe' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/packages missing name → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/packages',
      headers: { authorization: 'Bearer fake-token' },
      payload: { type: 'PUNCH', price: 50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/packages missing type → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/packages',
      headers: { authorization: 'Bearer fake-token' },
      payload: { name: 'Basic', price: 50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/packages invalid type → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/packages',
      headers: { authorization: 'Bearer fake-token' },
      payload: { name: 'Basic', type: 'INVALID', price: 50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/payments missing memberId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      headers: { authorization: 'Bearer fake-token' },
      payload: { amount: 50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/payments missing amount → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      headers: { authorization: 'Bearer fake-token' },
      payload: { memberId: 'some-id' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/payments amount=0 → 400 (exclusiveMinimum)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      headers: { authorization: 'Bearer fake-token' },
      payload: { memberId: 'some-id', amount: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/membership/payments/:id/status missing status → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/membership/payments/fake-id/status',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/membership/payments/:id/status invalid status → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/membership/payments/fake-id/status',
      headers: { authorization: 'Bearer fake-token' },
      payload: { status: 'INVALID_STATUS' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/members/:id/enrollments missing packageId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/members/fake-member-id/enrollments',
      headers: { authorization: 'Bearer fake-token' },
      payload: { startDate: '2026-01-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/members/:id/enrollments missing startDate → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/members/fake-member-id/enrollments',
      headers: { authorization: 'Bearer fake-token' },
      payload: { packageId: 'pkg-id' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/payments last4 invalid format → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      headers: { authorization: 'Bearer fake-token' },
      payload: { memberId: 'some-id', amount: 50, last4: 'ABCD' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/payments amount negative → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      headers: { authorization: 'Bearer fake-token' },
      payload: { memberId: 'some-id', amount: -10 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/members invalid email format → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      headers: { authorization: 'Bearer fake-token' },
      payload: { memberNumber: 'M001', firstName: 'Jane', lastName: 'Doe', email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/membership/packages price=0 → 400 (exclusiveMinimum)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/membership/packages',
      headers: { authorization: 'Bearer fake-token' },
      payload: { name: 'Test', type: 'PUNCH', price: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Membership — Error envelope shape', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('error response has correct envelope shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/membership/members' });
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
});
