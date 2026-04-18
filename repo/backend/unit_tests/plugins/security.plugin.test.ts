import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/repositories/auth.repository.js', () => ({
  getLatestRateLimitBucket: vi.fn(),
  createRateLimitBucket: vi.fn(),
  incrementRateLimitBucket: vi.fn(),
  getIpAllowlistForGroup: vi.fn(),
}));

vi.mock('../../src/security/ipallowlist.js', () => ({
  isIpAllowed: vi.fn(),
}));

import securityPlugin from '../../src/plugins/security.plugin.js';
import {
  getIpAllowlistForGroup,
  getLatestRateLimitBucket,
} from '../../src/repositories/auth.repository.js';
import { isIpAllowed } from '../../src/security/ipallowlist.js';

const mockedGetIpAllowlistForGroup = vi.mocked(getIpAllowlistForGroup);
const mockedGetLatestRateLimitBucket = vi.mocked(getLatestRateLimitBucket);
const mockedIsIpAllowed = vi.mocked(isIpAllowed);

describe('security.plugin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('checkIpAllowlist returns 403 when IP is not allowed', async () => {
    const decorate = vi.fn();
    const fastify = {
      prisma: {},
      config: { ipAllowlistStrictMode: true },
      addHook: vi.fn(),
      decorate,
    } as unknown as Parameters<Exclude<typeof securityPlugin, undefined>>[0];

    await (securityPlugin as any)(fastify, {});

    mockedGetIpAllowlistForGroup.mockResolvedValue([] as never);
    mockedIsIpAllowed.mockReturnValue(false);

    const checkIpAllowlistFactory = decorate.mock.calls.find((c) => c[0] === 'checkIpAllowlist')?.[1] as Function;
    const handler = checkIpAllowlistFactory('admin');

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
      header: vi.fn().mockReturnThis(),
    };

    await handler(
      {
        ip: '10.0.0.55',
        id: 'req-1',
        log: { error: vi.fn(), warn: vi.fn() },
      },
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalled();
  });

  it('rate-limit backend failures return 503 (fail-closed)', async () => {
    const addHook = vi.fn();
    const fastify = {
      prisma: {},
      config: { ipAllowlistStrictMode: true },
      addHook,
      decorate: vi.fn(),
    } as unknown as Parameters<Exclude<typeof securityPlugin, undefined>>[0];

    await (securityPlugin as any)(fastify, {});

    mockedGetLatestRateLimitBucket.mockRejectedValue(new Error('db unavailable'));

    const rateLimitHook = addHook.mock.calls.find((c) => c[0] === 'preHandler')?.[1] as Function;
    expect(typeof rateLimitHook).toBe('function');

    const reply = {
      header: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await rateLimitHook(
      {
        principal: { userId: 'user-1' },
        id: 'req-2',
        log: { error: vi.fn(), warn: vi.fn() },
      },
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      }),
    );
  });
});
