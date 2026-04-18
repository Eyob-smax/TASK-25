import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ---- User ----

export async function findUserByUsername(prisma: PrismaClient, username: string) {
  return prisma.user.findUnique({
    where: { username },
    include: { roles: { where: { isActive: true, deletedAt: null } } },
  });
}

export async function findUserById(prisma: PrismaClient, id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { roles: { where: { isActive: true, deletedAt: null } } },
  });
}

export async function createUser(
  prisma: PrismaClient,
  data: {
    username: string;
    passwordHash: string;
    passwordVersion: number;
    encryptionKeyVersion: string;
    isActive: boolean;
  },
  roles: string[],
  assignedBy: string,
) {
  return prisma.user.create({
    data: {
      id: randomUUID(),
      username: data.username,
      passwordHash: data.passwordHash,
      passwordVersion: data.passwordVersion,
      encryptionKeyVersion: data.encryptionKeyVersion,
      isActive: data.isActive,
      roles: {
        create: roles.map((role) => ({
          id: randomUUID(),
          role,
          assignedBy,
          isActive: true,
        })),
      },
    },
    include: { roles: { where: { isActive: true, deletedAt: null } } },
  });
}

export async function updateUserPassword(
  prisma: PrismaClient,
  userId: string,
  passwordHash: string,
  newPasswordVersion: number,
) {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordVersion: newPasswordVersion },
  });
}

export async function setUserRoles(
  prisma: PrismaClient,
  userId: string,
  newRoles: string[],
  assignedBy: string,
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.userRole.updateMany({
      where: { userId, isActive: true, deletedAt: null },
      data: { isActive: false, deletedAt: now, deletedBy: assignedBy },
    });

    for (const role of newRoles) {
      await tx.userRole.upsert({
        where: { userId_role: { userId, role } },
        update: {
          isActive: true,
          deletedAt: null,
          deletedBy: null,
          assignedBy,
        },
        create: {
          id: randomUUID(),
          userId,
          role,
          assignedBy,
          isActive: true,
        },
      });
    }
  });
}

// ---- Session ----

export async function createSession(
  prisma: PrismaClient,
  data: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
    passwordVersion: number;
    ipAddress: string | null;
  },
) {
  return prisma.session.create({
    data: {
      id: randomUUID(),
      token: data.tokenHash,
      userId: data.userId,
      expiresAt: data.expiresAt,
      passwordVersion: data.passwordVersion,
      ipAddress: data.ipAddress,
    },
  });
}

export async function findSessionByTokenHash(prisma: PrismaClient, tokenHash: string) {
  return prisma.session.findUnique({
    where: { token: tokenHash },
    include: {
      user: { include: { roles: { where: { isActive: true, deletedAt: null } } } },
    },
  });
}

export async function revokeSession(prisma: PrismaClient, tokenHash: string) {
  return prisma.session.update({
    where: { token: tokenHash },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(prisma: PrismaClient, userId: string) {
  return prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ---- Rate Limiting ----

export async function getLatestRateLimitBucket(prisma: PrismaClient, principalId: string) {
  return prisma.rateLimitBucket.findFirst({
    where: { principalId },
    orderBy: { windowStart: 'desc' },
  });
}

export async function createRateLimitBucket(
  prisma: PrismaClient,
  principalId: string,
  windowStart: Date,
) {
  return prisma.rateLimitBucket.create({
    data: {
      id: randomUUID(),
      principalId,
      windowStart,
      requestCount: 1,
    },
  });
}

export async function incrementRateLimitBucket(prisma: PrismaClient, bucketId: string) {
  return prisma.rateLimitBucket.update({
    where: { id: bucketId },
    data: { requestCount: { increment: 1 } },
  });
}

// ---- IP Allowlist ----

export async function getIpAllowlistForGroup(prisma: PrismaClient, routeGroup: string) {
  return prisma.ipAllowlistEntry.findMany({
    where: { routeGroup, isActive: true, deletedAt: null },
  });
}
