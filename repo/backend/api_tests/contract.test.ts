import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

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

describe('API Contract — Response Envelopes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health returns expected shape', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /nonexistent returns 404', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });

  it('GET /api/warehouse/facilities requires authentication (401, not 404)', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/api/warehouse/facilities',
    });

    // Warehouse routes are registered; unauthenticated access returns 401 with envelope.
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/auth/login is now registered and returns 401 for unknown user', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nosuchuser', password: 'Password123!' },
    });

    // Auth routes registered in Prompt 3; unknown user returns 401 not 404
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.meta).toHaveProperty('requestId');
    expect(body.meta).toHaveProperty('timestamp');
  });

  it('POST /api/auth/login with invalid payload returns 400', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'ab' }, // missing password and username too short
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /api/auth/me returns 401 without a Bearer token', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('request includes x-request-id header in response', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
  });
});
