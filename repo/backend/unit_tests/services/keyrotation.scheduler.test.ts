import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/keyversion.repository.js', () => ({
  getActiveKeyVersion: vi.fn(),
}));

vi.mock('../../src/services/admin.service.js', () => ({
  triggerKeyRotation: vi.fn(),
}));

import { runKeyRotationPass } from '../../src/services/keyrotation.scheduler.js';
import { getActiveKeyVersion } from '../../src/repositories/keyversion.repository.js';
import { triggerKeyRotation } from '../../src/services/admin.service.js';

const mockedGetActiveKeyVersion = vi.mocked(getActiveKeyVersion);
const mockedTriggerKeyRotation = vi.mocked(triggerKeyRotation);

function buildSilentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  };
}

describe('runKeyRotationPass', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('initializes key version 1 when no active key exists', async () => {
    mockedGetActiveKeyVersion.mockResolvedValue(null as never);
    mockedTriggerKeyRotation.mockResolvedValue({ version: 1 } as never);
    const logger = buildSilentLogger();

    const result = await runKeyRotationPass(
      {} as never,
      logger as never,
      Buffer.alloc(32, 1),
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(result).toEqual({ rotated: true, version: 1 });
    expect(mockedTriggerKeyRotation).toHaveBeenCalledTimes(1);
    expect(mockedTriggerKeyRotation).toHaveBeenCalledWith(
      {} as never,
      expect.any(String),
      'SYSTEM',
    );
    expect(logger.info).toHaveBeenCalledWith(
      { version: 1 },
      'Initialized encryption key version',
    );
  });

  it('is a no-op when active key has not expired', async () => {
    mockedGetActiveKeyVersion.mockResolvedValue({
      version: 3,
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    } as never);
    const logger = buildSilentLogger();

    const result = await runKeyRotationPass(
      {} as never,
      logger as never,
      Buffer.alloc(32, 2),
      new Date('2026-05-01T00:00:00.000Z'),
    );

    expect(result).toEqual({ rotated: false, version: 3 });
    expect(mockedTriggerKeyRotation).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rotates when active key is overdue', async () => {
    mockedGetActiveKeyVersion.mockResolvedValue({
      version: 7,
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    } as never);
    mockedTriggerKeyRotation.mockResolvedValue({ version: 8 } as never);
    const logger = buildSilentLogger();

    const result = await runKeyRotationPass(
      {} as never,
      logger as never,
      Buffer.alloc(32, 3),
      new Date('2026-02-01T00:00:00.000Z'),
    );

    expect(result).toEqual({ rotated: true, version: 8 });
    expect(mockedTriggerKeyRotation).toHaveBeenCalledTimes(1);
    expect(mockedTriggerKeyRotation).toHaveBeenCalledWith(
      {} as never,
      expect.any(String),
      'SYSTEM',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { previousVersion: 7, version: 8 },
      'Auto-rotated overdue encryption key version',
    );
  });
});
