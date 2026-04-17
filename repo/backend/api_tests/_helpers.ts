import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { hashPassword, wrapPasswordHash } from '../src/security/password.js';
import {
  generateSessionToken,
  hashSessionToken,
  computeSessionExpiry,
} from '../src/security/session.js';
import { parseMasterKey } from '../src/security/encryption.js';

export const TEST_CONFIG = {
  port: 0,
  host: '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL ?? 'file:../database/test.db',
  nodeEnv: 'test' as const,
  logLevel: 'silent' as const,
  encryptionMasterKey: 'ab'.repeat(32),
  sessionTimeoutHours: 8,
  loginMaxAttempts: 5,
  loginWindowMinutes: 15,
  ipAllowlistStrictMode: false,
};

export const MASTER_KEY = parseMasterKey(TEST_CONFIG.encryptionMasterKey);

export interface SeededUser {
  id: string;
  username: string;
  password: string;
  token: string;
  roles: string[];
}

/**
 * Seed a user directly via Prisma with a properly wrapped password hash and
 * an active session. Returns the plaintext token so tests can set
 * `Authorization: Bearer <token>` without logging in.
 */
export async function seedUserWithSession(
  app: FastifyInstance,
  roles: string[],
  opts: { username?: string; password?: string } = {},
): Promise<SeededUser> {
  const username = opts.username ?? `depth-${randomUUID()}`;
  const password = opts.password ?? 'DepthTestPass123!';

  const scryptHash = await hashPassword(password);
  const wrapped = wrapPasswordHash(scryptHash, MASTER_KEY, 1);

  const user = await app.prisma.user.create({
    data: {
      id: randomUUID(),
      username,
      passwordHash: wrapped,
      passwordVersion: 1,
      encryptionKeyVersion: '1',
      isActive: true,
      roles: {
        create: roles.map((role) => ({
          id: randomUUID(),
          role,
          assignedBy: 'SYSTEM',
        })),
      },
    },
    include: { roles: true },
  });

  const token = generateSessionToken();
  await app.prisma.session.create({
    data: {
      id: randomUUID(),
      token: hashSessionToken(token),
      userId: user.id,
      passwordVersion: 1,
      expiresAt: computeSessionExpiry(8),
      ipAddress: '127.0.0.1',
    },
  });

  return { id: user.id, username, password, token, roles };
}

export function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
