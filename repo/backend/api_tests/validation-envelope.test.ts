import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Validation envelope — global error handler normalization', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns VALIDATION_FAILED envelope for warehouse schema errors', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: authHeader(admin.token),
      payload: { code: 'FAC-ONLY' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toBe('Request validation failed');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(typeof body.meta.requestId).toBe('string');
  });

  it('returns VALIDATION_FAILED envelope for outbound schema errors', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: authHeader(admin.token),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toBe('Request validation failed');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('returns VALIDATION_FAILED envelope for admin schema errors', async () => {
    const admin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/parameters',
      headers: authHeader(admin.token),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.message).toBe('Request validation failed');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('returns UNAUTHORIZED for protected routes when fake auth token is provided', async () => {
    // An invalid Bearer token leaves `request.principal` null. The auth-
    // before-validation barrier must short-circuit with 401 — never leaking
    // validation-schema hints to unauthenticated callers.
    const res = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: { authorization: 'Bearer fake-token' },
      payload: { code: 'FAC-ONLY' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns UNAUTHORIZED on outbound routes when fake auth token is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns UNAUTHORIZED on strategy routes when fake auth token is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
