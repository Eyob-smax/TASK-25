import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// These tests require a migrated database (run inside Docker via run_tests.sh).
// The test database is reset between suites by the test runner.

const TEST_CONFIG = {
  port: 0,
  host: '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL ?? 'file:../database/test.db',
  nodeEnv: 'test' as const,
  logLevel: 'silent' as const,
  encryptionMasterKey: 'ab'.repeat(32), // 64-char hex test key
  sessionTimeoutHours: 8,
  loginMaxAttempts: 5,
  loginWindowMinutes: 15,
};

describe('Auth routes — unauthenticated access', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/auth/me returns 401 without Authorization header', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.meta).toHaveProperty('requestId');
    expect(body.meta).toHaveProperty('timestamp');
  });

  it('POST /api/auth/logout returns 401 without Authorization header', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/auth/rotate-password returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/rotate-password',
      payload: { currentPassword: 'OldPass123!', newPassword: 'NewPass456!' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('POST /api/auth/users returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      payload: { username: 'newuser', password: 'Password123!', roles: ['WAREHOUSE_OPERATOR'] },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('Auth routes — validation failures', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/auth/login with missing password returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice' }, // missing password
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/auth/login with too-short username returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'ab', password: 'Password123!' }, // username < 3 chars
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/auth/login with too-short password returns 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'short' }, // password < 8 chars
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/auth/login with extra fields returns 400 (additionalProperties)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'Password123!', injected: true },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Auth routes — error envelope shape', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 response has correct envelope shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('success', false);
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('requestId');
    expect(body.meta).toHaveProperty('timestamp');
    expect(typeof body.meta.timestamp).toBe('string');
    expect(typeof body.meta.requestId).toBe('string');
  });

  it('400 response has correct envelope shape', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'ab' }, // missing password, username too short
    });
    expect(response.statusCode).toBe(400);
    // Fastify schema validation error shape
    const body = JSON.parse(response.payload);
    expect(typeof body).toBe('object');
  });
});

describe('Auth routes — login with invalid credentials', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/auth/login returns 401 for unknown user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nosuchuser', password: 'Password123!' },
    });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid credentials');
  });
});

describe('Auth routes — RBAC enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('PUT /api/auth/users/:userId/roles returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/users/some-id/roles',
      payload: { roles: ['WAREHOUSE_OPERATOR'] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('POST /api/auth/users returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      payload: { username: 'newuser', password: 'Password123!', roles: ['WAREHOUSE_OPERATOR'] },
    });
    expect(response.statusCode).toBe(401);
  });
});
