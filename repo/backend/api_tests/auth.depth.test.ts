import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Auth depth — login + session + rotation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/auth/login returns a token for a seeded user and GET /me uses it', async () => {
    const user = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: user.username, password: user.password },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody = JSON.parse(loginResponse.payload);
    expect(loginBody.success).toBe(true);
    expect(typeof loginBody.data.token).toBe('string');

    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(loginBody.data.token),
    });
    expect(meResponse.statusCode).toBe(200);
    const meBody = JSON.parse(meResponse.payload);
    expect(meBody.data.username).toBe(user.username);
  });

  it('rotating password invalidates prior sessions (passwordVersion mismatch)', async () => {
    const user = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    // Seeded token works initially
    const before = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(user.token),
    });
    expect(before.statusCode).toBe(200);

    // Rotate password using the seeded session
    const rotate = await app.inject({
      method: 'POST',
      url: '/api/auth/rotate-password',
      headers: authHeader(user.token),
      payload: { currentPassword: user.password, newPassword: 'FreshPass!456' },
    });
    expect(rotate.statusCode).toBe(200);

    // Prior token must no longer authenticate
    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(user.token),
    });
    expect(after.statusCode).toBe(401);
  });

  it('login with wrong password returns 401 UNAUTHORIZED', async () => {
    const user = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: user.username, password: 'WrongPassword!1' },
    });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
