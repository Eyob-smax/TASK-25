import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { deriveKeyForVersion } from '../security/encryption.js';
import { getActiveKeyVersion } from '../repositories/keyversion.repository.js';
import { triggerKeyRotation } from './admin.service.js';

function computeKeyHash(masterKey: Buffer, version: number): string {
  const keyMaterial = deriveKeyForVersion(masterKey, version);
  return createHash('sha256').update(keyMaterial).digest('hex');
}

/**
 * Executes one key-rotation enforcement pass.
 * - If no active key exists, initialize version 1.
 * - If active key is overdue, rotate to the next version.
 * - Otherwise, no-op.
 */
export async function runKeyRotationPass(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  masterKey: Buffer,
  now: Date = new Date(),
): Promise<{ rotated: boolean; version: number | null }> {
  const active = await getActiveKeyVersion(prisma);

  if (!active) {
    const keyHash = computeKeyHash(masterKey, 1);
    const created = await triggerKeyRotation(prisma, keyHash, 'SYSTEM');
    logger.info({ version: created.version }, 'Initialized encryption key version');
    return { rotated: true, version: created.version };
  }

  if (active.expiresAt && now < active.expiresAt) {
    return { rotated: false, version: active.version };
  }

  const nextVersion = active.version + 1;
  const keyHash = computeKeyHash(masterKey, nextVersion);
  const rotated = await triggerKeyRotation(prisma, keyHash, 'SYSTEM');

  logger.warn(
    { previousVersion: active.version, version: rotated.version },
    'Auto-rotated overdue encryption key version',
  );

  return { rotated: true, version: rotated.version };
}

export function startKeyRotationScheduler(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  masterKey: Buffer,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await runKeyRotationPass(prisma, logger, masterKey);
    } catch (err) {
      logger.error({ err }, 'Key rotation scheduler error');
    }
  }, intervalMs);
}
