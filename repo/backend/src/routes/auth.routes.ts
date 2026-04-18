import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { tagRequestLogDomain } from '../logging/logger.js';
import {
  findUserByUsername,
  findUserById,
  createUser,
  updateUserPassword,
  setUserRoles,
  createSession,
  revokeSession,
  revokeAllUserSessions,
  getLatestRateLimitBucket,
  createRateLimitBucket,
  incrementRateLimitBucket,
} from '../repositories/auth.repository.js';
import { getActiveKeyVersion } from '../repositories/keyversion.repository.js';
import { hashPassword, verifyWrappedPassword, wrapPasswordHash } from '../security/password.js';
import { parseMasterKey } from '../security/encryption.js';
import { generateSessionToken, hashSessionToken, computeSessionExpiry } from '../security/session.js';
import { maskUser } from '../security/masking.js';
import { isWindowExpired, evaluateLoginThrottle } from '../security/ratelimit.js';
import { auditCreate, auditUpdate } from '../audit/audit.js';
import { successResponse, errorResponse, ErrorCode } from '../shared/envelope.js';
import { Role } from '../shared/enums.js';
import type { RoleType } from '../shared/enums.js';
import {
  loginBodySchema,
  rotatePasswordBodySchema,
  createUserBodySchema,
  updateUserRolesBodySchema,
} from '../shared/schemas/auth.schemas.js';
import type { AppConfig } from '../config.js';

interface LoginBody { username: string; password: string }
interface RotatePasswordBody { currentPassword: string; newPassword: string }
interface CreateUserBody { username: string; password: string; roles: string[] }
interface UpdateUserRolesBody { roles: string[] }
interface UserIdParams { userId: string }

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  tagRequestLogDomain(fastify, 'auth');

  const config = (fastify as typeof fastify & { config: AppConfig }).config;
  const masterKey = parseMasterKey(config.encryptionMasterKey);

  const resolveActiveKeyVersion = async (): Promise<number> => {
    const active = await getActiveKeyVersion(fastify.prisma);
    return active?.version ?? 1;
  };

  // ---- POST /api/auth/login ----
  fastify.post<{ Body: LoginBody }>(
    '/login',
    { schema: { body: loginBodySchema } },
    async (request, reply) => {
      const { username, password } = request.body;
      const now = new Date();

      // Login throttle: track failed attempts per username
      const throttleKey = `login:${username}`;
      const bucket = await getLatestRateLimitBucket(fastify.prisma, throttleKey);
      const windowMs = config.loginWindowMinutes * 60_000;
      const throttleEnabled = config.nodeEnv !== 'test';

      if (throttleEnabled && bucket && !isWindowExpired(bucket.windowStart, now, windowMs)) {
        const throttle = evaluateLoginThrottle(
          bucket.requestCount,
          bucket.windowStart,
          now,
          config.loginMaxAttempts,
          config.loginWindowMinutes,
        );
        if (!throttle.allowed) {
          const retryAfter = Math.ceil((throttle.resetAt.getTime() - now.getTime()) / 1000);
          return reply.status(429).send(
            errorResponse(
              ErrorCode.RATE_LIMITED,
              'Too many failed login attempts. Try again later.',
              request.id,
              undefined,
              { retryAfterSeconds: retryAfter },
            ),
          );
        }
      }

      const trackFailedAttempt = async () => {
        if (!throttleEnabled) return;
        if (bucket && !isWindowExpired(bucket.windowStart, now, windowMs)) {
          await incrementRateLimitBucket(fastify.prisma, bucket.id);
        } else {
          await createRateLimitBucket(fastify.prisma, throttleKey, now);
        }
      };

      // Find user — return identical error for unknown user vs wrong password (prevents enumeration)
      const user = await findUserByUsername(fastify.prisma, username);
      if (!user || !user.isActive) {
        await trackFailedAttempt();
        return reply.status(401).send(
          errorResponse(ErrorCode.UNAUTHORIZED, 'Invalid credentials', request.id),
        );
      }

      const valid = await verifyWrappedPassword(password, user.passwordHash, masterKey);
      if (!valid) {
        await trackFailedAttempt();
        return reply.status(401).send(
          errorResponse(ErrorCode.UNAUTHORIZED, 'Invalid credentials', request.id),
        );
      }

      // Issue session
      const token = generateSessionToken();
      const tokenHash = hashSessionToken(token);
      const expiresAt = computeSessionExpiry(config.sessionTimeoutHours, now);

      await createSession(fastify.prisma, {
        tokenHash,
        userId: user.id,
        expiresAt,
        passwordVersion: user.passwordVersion,
        ipAddress: request.ip ?? null,
      });

      // Non-empty sanitized after-state so the audit digest is deterministic
      // and non-empty. The raw token is never persisted; only a hash prefix.
      const tokenHashPrefix = tokenHash.slice(0, 16);
      await auditCreate(
        fastify.prisma,
        user.id,
        'Session',
        tokenHashPrefix,
        {
          userId: user.id,
          tokenHashPrefix,
          expiresAt: expiresAt.toISOString(),
          passwordVersion: user.passwordVersion,
        },
        { ip: request.ip ?? null },
      );

      const userRoles = user.roles.map((r) => r.role as RoleType);
      return reply.status(200).send(
        successResponse(
          {
            token,
            expiresAt: expiresAt.toISOString(),
            user: maskUser(user, user.roles.map((r) => r.role), userRoles),
          },
          request.id,
        ),
      );
    },
  );

  // ---- POST /api/auth/logout ----
  fastify.post(
    '/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const token = request.headers.authorization!.slice(7).trim();
      const tokenHash = hashSessionToken(token);
      await revokeSession(fastify.prisma, tokenHash);
      await auditUpdate(
        fastify.prisma,
        request.principal!.userId,
        'Session',
        tokenHash.slice(0, 16),
        { active: true },
        { active: false },
      );
      return reply.status(200).send(successResponse({ message: 'Logged out successfully' }, request.id));
    },
  );

  // ---- POST /api/auth/rotate-password ----
  fastify.post<{ Body: RotatePasswordBody }>(
    '/rotate-password',
    { preHandler: [fastify.authenticate], schema: { body: rotatePasswordBodySchema } },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body;
      const userId = request.principal!.userId;

      const user = await findUserById(fastify.prisma, userId);
      if (!user) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'User not found', request.id));
      }

      if (!await verifyWrappedPassword(currentPassword, user.passwordHash, masterKey)) {
        return reply.status(401).send(
          errorResponse(ErrorCode.UNAUTHORIZED, 'Current password is incorrect', request.id),
        );
      }

      const newScrypt = await hashPassword(newPassword);
      const activeVersion = await resolveActiveKeyVersion();
      const newHash = wrapPasswordHash(newScrypt, masterKey, activeVersion);
      const newVersion = user.passwordVersion + 1;

      await updateUserPassword(fastify.prisma, userId, newHash, newVersion);
      // Invalidate all sessions — password version now mismatches
      await revokeAllUserSessions(fastify.prisma, userId);

      await auditUpdate(
        fastify.prisma,
        userId,
        'User',
        userId,
        { passwordVersion: user.passwordVersion },
        { passwordVersion: newVersion },
        { reason: 'password_rotation' },
      );

      return reply.status(200).send(
        successResponse({ message: 'Password rotated. All sessions have been invalidated.' }, request.id),
      );
    },
  );

  // ---- GET /api/auth/me ----
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await findUserById(fastify.prisma, request.principal!.userId);
      if (!user) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'User not found', request.id));
      }
      const roles = user.roles.map((r) => r.role as RoleType);
      return reply.status(200).send(
        successResponse(maskUser(user, user.roles.map((r) => r.role), roles), request.id),
      );
    },
  );

  // ---- POST /api/auth/users — create user (SYSTEM_ADMIN only) ----
  fastify.post<{ Body: CreateUserBody }>(
    '/users',
    {
      preHandler: [fastify.authenticate, fastify.requireRole([Role.SYSTEM_ADMIN])],
      schema: { body: createUserBodySchema },
    },
    async (request, reply) => {
      const { username, password, roles } = request.body;

      // Roles are already validated by JSON schema enum constraint
      const existing = await findUserByUsername(fastify.prisma, username);
      if (existing) {
        return reply.status(409).send(
          errorResponse(ErrorCode.CONFLICT, 'Username already exists', request.id),
        );
      }

      const keyVersion = await getActiveKeyVersion(fastify.prisma);
      const activeVersion = keyVersion?.version ?? 1;
      const keyVersionStr = String(activeVersion);
      const actorId = request.principal!.userId;

      const scryptHash = await hashPassword(password);
      const wrappedHash = wrapPasswordHash(scryptHash, masterKey, activeVersion);

      const newUser = await createUser(
        fastify.prisma,
        {
          username,
          passwordHash: wrappedHash,
          passwordVersion: 1,
          encryptionKeyVersion: keyVersionStr,
          isActive: true,
        },
        roles,
        actorId,
      );

      await auditCreate(fastify.prisma, actorId, 'User', newUser.id, { username, roles });

      return reply.status(201).send(
        successResponse(
          maskUser(newUser, newUser.roles.map((r) => r.role), request.principal!.roles),
          request.id,
        ),
      );
    },
  );

  // ---- PUT /api/auth/users/:userId/roles — update roles (SYSTEM_ADMIN only) ----
  fastify.put<{ Params: UserIdParams; Body: UpdateUserRolesBody }>(
    '/users/:userId/roles',
    {
      preHandler: [fastify.authenticate, fastify.requireRole([Role.SYSTEM_ADMIN])],
      schema: { body: updateUserRolesBodySchema },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { roles } = request.body;

      const user = await findUserById(fastify.prisma, userId);
      if (!user) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'User not found', request.id));
      }

      const oldRoles = user.roles.map((r) => r.role);
      await setUserRoles(fastify.prisma, userId, roles, request.principal!.userId);
      await auditUpdate(
        fastify.prisma,
        request.principal!.userId,
        'UserRole',
        userId,
        { roles: oldRoles },
        { roles },
      );

      return reply.status(200).send(successResponse({ userId, roles }, request.id));
    },
  );
};
