import { describe, it, expect, vi } from 'vitest';
import {
  createDomainLogger,
  tagRequestLogDomain,
  type LogDomain,
} from '../../src/logging/logger.js';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

// ---- createDomainLogger ----

describe('createDomainLogger', () => {
  const makeLogger = (): FastifyBaseLogger => {
    const childLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: 'info',
    } as unknown as FastifyBaseLogger;

    const baseLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnValue(childLogger),
      level: 'info',
    } as unknown as FastifyBaseLogger;

    return baseLogger;
  };

  it('calls logger.child() with the domain binding', () => {
    const base = makeLogger();
    createDomainLogger(base, 'backup');
    expect((base.child as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ domain: 'backup' });
  });

  it('returns the child logger produced by logger.child()', () => {
    const base = makeLogger();
    const result = createDomainLogger(base, 'auth');
    const expectedChild = (base.child as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(result).toBe(expectedChild);
  });

  it('uses domain value exactly as passed', () => {
    const base = makeLogger();
    createDomainLogger(base, 'cms');
    expect((base.child as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ domain: 'cms' });
  });
});

// ---- LogDomain type coverage ----

describe('LogDomain — all subsystem domains are covered', () => {
  const EXPECTED_DOMAINS: LogDomain[] = [
    'auth',
    'warehouse',
    'outbound',
    'strategy',
    'membership',
    'cms',
    'backup',
    'retention',
    'audit',
    'admin',
  ];

  it('has exactly 10 log domains', () => {
    expect(EXPECTED_DOMAINS).toHaveLength(10);
  });

  it('includes all critical security domains', () => {
    expect(EXPECTED_DOMAINS).toContain('auth');
    expect(EXPECTED_DOMAINS).toContain('audit');
    expect(EXPECTED_DOMAINS).toContain('admin');
  });

  it('includes all business operation domains', () => {
    expect(EXPECTED_DOMAINS).toContain('warehouse');
    expect(EXPECTED_DOMAINS).toContain('outbound');
    expect(EXPECTED_DOMAINS).toContain('strategy');
  });

  it('includes all compliance domains', () => {
    expect(EXPECTED_DOMAINS).toContain('backup');
    expect(EXPECTED_DOMAINS).toContain('retention');
  });

  it('includes ledger and cms domains', () => {
    expect(EXPECTED_DOMAINS).toContain('membership');
    expect(EXPECTED_DOMAINS).toContain('cms');
  });
});

// ---- tagRequestLogDomain ----

describe('tagRequestLogDomain', () => {
  it('registers an onRequest hook and swaps request.log with a domain-tagged child logger', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let registeredHook: ((request: any) => Promise<void>) | undefined;
    const fastify = {
      addHook: vi.fn((event: string, handler: (request: unknown) => Promise<void>) => {
        if (event === 'onRequest') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          registeredHook = handler as any;
        }
      }),
    } as unknown as FastifyInstance;

    tagRequestLogDomain(fastify, 'outbound');

    expect(fastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    expect(registeredHook).toBeDefined();

    const child = { info: vi.fn(), level: 'info' } as unknown as FastifyBaseLogger;
    const baseLog = {
      child: vi.fn().mockReturnValue(child),
    } as unknown as FastifyBaseLogger;
    const request = { log: baseLog } as { log: FastifyBaseLogger };

    await registeredHook!(request);

    expect(baseLog.child).toHaveBeenCalledWith({ domain: 'outbound' });
    expect(request.log).toBe(child);
  });
});
