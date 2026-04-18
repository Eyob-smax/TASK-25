import { describe, expect, it, vi } from 'vitest';
import authPlugin from '../../src/plugins/auth.plugin.js';

describe('auth.plugin', () => {
  it('authenticate returns 401 envelope when principal is missing', async () => {
    const decorate = vi.fn();
    const fastify = {
      prisma: {},
      decorateRequest: vi.fn(),
      addHook: vi.fn(),
      decorate,
    } as unknown as Parameters<Exclude<typeof authPlugin, undefined>>[0];

    await (authPlugin as any)(fastify, {});

    const authenticate = decorate.mock.calls.find((c) => c[0] === 'authenticate')?.[1] as Function;
    expect(typeof authenticate).toBe('function');

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await authenticate({ principal: null, id: 'req-1' }, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalled();
  });

  it('requireRole returns 403 when principal lacks required role', async () => {
    const decorate = vi.fn();
    const fastify = {
      prisma: {},
      decorateRequest: vi.fn(),
      addHook: vi.fn(),
      decorate,
    } as unknown as Parameters<Exclude<typeof authPlugin, undefined>>[0];

    await (authPlugin as any)(fastify, {});

    const requireRoleFactory = decorate.mock.calls.find((c) => c[0] === 'requireRole')?.[1] as Function;
    expect(typeof requireRoleFactory).toBe('function');

    const handler = requireRoleFactory(['SYSTEM_ADMIN']);
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await handler({ principal: { roles: ['WAREHOUSE_OPERATOR'] }, id: 'req-2' }, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalled();
  });

  it('preValidation rejects protected routes with invalid bearer token', async () => {
    const addHook = vi.fn();
    const fastify = {
      prisma: {},
      decorateRequest: vi.fn(),
      addHook,
      decorate: vi.fn(),
    } as unknown as Parameters<Exclude<typeof authPlugin, undefined>>[0];

    await (authPlugin as any)(fastify, {});

    const preValidation = addHook.mock.calls.find((c) => c[0] === 'preValidation')?.[1] as Function;
    expect(typeof preValidation).toBe('function');

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await preValidation(
      {
        url: '/api/warehouse/facilities',
        principal: null,
        headers: { authorization: 'Bearer fake-token' },
        id: 'req-3',
      },
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalled();
  });
});
