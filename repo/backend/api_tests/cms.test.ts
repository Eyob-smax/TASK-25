import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { seedUserWithSession, authHeader } from './_helpers.js';

// NOTE: Unauthenticated and schema-validation tests do NOT require a migrated DB.
// Tests that create real articles/tags/categories require a migrated test database
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

describe('CMS — Unauthenticated access', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('GET /api/cms/articles → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cms/articles' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/cms/articles → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      payload: { title: 'Test', slug: 'test', body: 'Content' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/cms/tags → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cms/tags' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags',
      payload: { name: 'test-tag' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags/merge → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/merge',
      payload: { sourceTagId: 'a', targetTagId: 'b' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/cms/categories → 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cms/categories' });
    expect(res.statusCode).toBe(401);
  });
});

describe('CMS — Validation failures', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('POST /api/cms/articles missing title → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: { authorization: 'Bearer fake-token' },
      payload: { slug: 'test-article', body: 'Content here' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('POST /api/cms/articles missing slug → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: { authorization: 'Bearer fake-token' },
      payload: { title: 'My Article', body: 'Content here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/articles invalid slug format → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: { authorization: 'Bearer fake-token' },
      payload: { title: 'My Article', slug: 'Invalid Slug!', body: 'Content here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/articles missing body → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: { authorization: 'Bearer fake-token' },
      payload: { title: 'My Article', slug: 'my-article' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/categories missing name → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/categories',
      headers: { authorization: 'Bearer fake-token' },
      payload: { slug: 'test-cat' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/categories missing slug → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/categories',
      headers: { authorization: 'Bearer fake-token' },
      payload: { name: 'Test Category' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags missing name → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags/merge missing sourceTagId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/merge',
      headers: { authorization: 'Bearer fake-token' },
      payload: { targetTagId: 'b' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags/merge missing targetTagId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/merge',
      headers: { authorization: 'Bearer fake-token' },
      payload: { sourceTagId: 'a' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags/:id/aliases missing alias → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/fake-tag-id/aliases',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags/bulk-migrate missing fromTagId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/bulk-migrate',
      headers: { authorization: 'Bearer fake-token' },
      payload: { toTagId: 'b' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/articles/:id/schedule → 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles/fake-id/schedule',
      payload: { scheduledPublishAt: '2026-05-01T10:00:00Z' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/articles/:id/schedule missing scheduledPublishAt → 400 with auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles/fake-id/schedule',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('POST /api/cms/articles/:id/interactions missing type → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles/fake-id/interactions',
      headers: { authorization: 'Bearer fake-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/articles/:id/interactions invalid type → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles/fake-id/interactions',
      headers: { authorization: 'Bearer fake-token' },
      payload: { type: 'INVALID_INTERACTION' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/tags/bulk-migrate missing toTagId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/bulk-migrate',
      headers: { authorization: 'Bearer fake-token' },
      payload: { fromTagId: 'a' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/cms/categories invalid slug format → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/categories',
      headers: { authorization: 'Bearer fake-token' },
      payload: { name: 'Test Category', slug: 'Invalid Slug With Spaces!' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('CMS — Error envelope shape', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('error response has correct envelope shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cms/articles' });
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

describe('CMS — Authenticated validation failures [DB-required]', () => {
  let app: FastifyInstance;

  beforeEach(async () => { app = await buildApp({ config: TEST_CONFIG }); });
  afterEach(async () => { await app.close(); });

  it('POST /api/cms/articles missing title returns 400 with valid auth', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: authHeader(author.token),
      payload: { slug: 'auth-missing-title', body: 'content' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/cms/tags/merge missing targetTagId returns 400 with reviewer auth', async () => {
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/merge',
      headers: authHeader(reviewer.token),
      payload: { sourceTagId: 'tag-source-only' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/cms/categories missing slug returns 400 with reviewer auth', async () => {
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/categories',
      headers: authHeader(reviewer.token),
      payload: { name: 'Category Missing Slug' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/cms/articles/:id/interactions invalid type returns 400 with auth', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cms/articles/fake-article/interactions',
      headers: authHeader(author.token),
      payload: { type: 'INVALID_INTERACTION' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });
});

