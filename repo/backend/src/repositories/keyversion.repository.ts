import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { KeyStatus } from '../shared/enums.js';

const ROTATION_DAYS = 180;

/** Return the highest-version ACTIVE key, or null if none exists. */
export async function getActiveKeyVersion(prisma: PrismaClient) {
  return prisma.encryptionKeyVersion.findFirst({
    where: { status: KeyStatus.ACTIVE },
    orderBy: { version: 'desc' },
  });
}

/** Return a specific version record by its version number. */
export async function getKeyVersionByNumber(prisma: PrismaClient, version: number) {
  return prisma.encryptionKeyVersion.findUnique({ where: { version } });
}

/** Return all ACTIVE and ROTATED key versions, newest first. */
export async function getDecryptionKeyVersions(prisma: PrismaClient) {
  return prisma.encryptionKeyVersion.findMany({
    where: { status: { in: [KeyStatus.ACTIVE, KeyStatus.ROTATED] } },
    orderBy: { version: 'desc' },
  });
}

/** Create the initial key version (version 1). */
export async function createInitialKeyVersion(
  prisma: PrismaClient,
  keyHash: string,
) {
  const now = new Date();
  return prisma.encryptionKeyVersion.create({
    data: {
      id: randomUUID(),
      version: 1,
      status: KeyStatus.ACTIVE,
      algorithm: 'aes-256-gcm',
      keyHash,
      expiresAt: new Date(now.getTime() + ROTATION_DAYS * 86_400_000),
    },
  });
}

/**
 * Rotate: mark the current active version as ROTATED and create a new ACTIVE one.
 * Returns the new version record.
 */
export async function rotateKeyVersion(
  prisma: PrismaClient,
  currentVersion: number,
  newKeyHash: string,
) {
  const now = new Date();
  const newVersion = currentVersion + 1;
  const [, created] = await prisma.$transaction([
    prisma.encryptionKeyVersion.update({
      where: { version: currentVersion },
      data: { status: KeyStatus.ROTATED, rotatedAt: now },
    }),
    prisma.encryptionKeyVersion.create({
      data: {
        id: randomUUID(),
        version: newVersion,
        status: KeyStatus.ACTIVE,
        algorithm: 'aes-256-gcm',
        keyHash: newKeyHash,
        expiresAt: new Date(now.getTime() + ROTATION_DAYS * 86_400_000),
      },
    }),
  ]);
  return created;
}
