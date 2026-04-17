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

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('creates a valid Fastify instance', async () => {
    app = await buildApp({ config: TEST_CONFIG });
    expect(app).toBeDefined();
    expect(typeof app.inject).toBe('function');
  });

  it('returns 200 with status ok', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });

  it('returns valid ISO 8601 timestamp', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = JSON.parse(response.payload);
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });

  it('returns 404 for unknown routes', async () => {
    app = await buildApp({ config: TEST_CONFIG });

    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });
});
