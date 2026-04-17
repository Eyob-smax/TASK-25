import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { hashSessionToken, isSessionValid } from '../security/session.js';
import { findSessionByTokenHash } from '../repositories/auth.repository.js';
import { errorResponse, ErrorCode } from '../shared/envelope.js';
import type { RoleType } from '../shared/enums.js';

export interface SessionPrincipal {
  userId: string;
  username: string;
  roles: RoleType[];
  sessionId: string;
  passwordVersion: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Reject the request with 401 if no valid session is present. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Return a preHandler that rejects unless the principal holds one of the given roles. */
    requireRole: (roles: RoleType[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** Populated by the auth onRequest hook for any request carrying a valid Bearer token. */
    principal: SessionPrincipal | null;
  }
}

/**
 * Shared `authenticate` implementation. It is stored at module scope so that
 * both the `fastify.authenticate` decorator and the `preValidation` barrier
 * below can compare against the same function reference via `Array.includes`.
 */
async function authenticateImpl(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.principal) {
    await reply
      .status(401)
      .send(errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', request.id));
  }
}

/**
 * Extract the preHandler list from a route config. Fastify normalizes the
 * preHandler option to either a single function or an array of functions.
 */
function extractPreHandlers(route: { preHandler?: unknown }): unknown[] {
  const ph = route.preHandler;
  if (!ph) return [];
  return Array.isArray(ph) ? ph : [ph];
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate every request with a null principal — populated if a valid token is found
  fastify.decorateRequest('principal', null);

  // Session resolver runs at `onRequest` — before schema validation — so
  // `request.principal` is already populated by the time `preValidation` runs.
  // This closes the prior gap where protected routes could leak schema hints
  // to unauthenticated callers via 400 VALIDATION_FAILED.
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return;

    const token = authHeader.slice(7).trim();
    if (!token) return;

    try {
      const tokenHash = hashSessionToken(token);
      const session = await findSessionByTokenHash(fastify.prisma, tokenHash);
      if (!session) return;

      const valid = isSessionValid(
        {
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
          passwordVersion: session.passwordVersion,
        },
        session.user.passwordVersion,
      );
      if (!valid) return;

      request.principal = {
        userId: session.userId,
        username: session.user.username,
        roles: session.user.roles.map((r) => r.role as RoleType),
        sessionId: session.id,
        passwordVersion: session.passwordVersion,
      };
    } catch (err) {
      // Log at debug level; never reject — route-level guards decide the rest
      request.log.debug({ err }, 'Session resolution failed');
    }
  });

  // Auth-before-validation barrier: Fastify runs `validation` before
  // `preHandler`, so an unauthenticated caller hitting a protected route would
  // otherwise see schema-shape error details. Inspect the matched route's
  // preHandler list — if `authenticateImpl` is wired in AND no principal has
  // been resolved, send 401 UNAUTHORIZED immediately, before validation runs.
  fastify.addHook('preValidation', async (request: FastifyRequest, reply: FastifyReply) => {
    const routeOptions = (request as unknown as { routeOptions?: { preHandler?: unknown } })
      .routeOptions;
    if (!routeOptions) return;
    const preHandlers = extractPreHandlers(routeOptions);
    if (preHandlers.length === 0) return;
    const guardsAuth = preHandlers.includes(authenticateImpl);
    if (!guardsAuth) return;
    if (!request.principal) {
      await reply
        .status(401)
        .send(errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', request.id));
    }
  });

  // `fastify.authenticate` — attach as preHandler on protected routes
  fastify.decorate('authenticate', authenticateImpl);

  // `fastify.requireRole(roles)` — factory for role-gated preHandlers
  fastify.decorate(
    'requireRole',
    (requiredRoles: RoleType[]) =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (!request.principal) {
          await reply
            .status(401)
            .send(errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', request.id));
          return;
        }
        const hasRequired = requiredRoles.some((r) => request.principal!.roles.includes(r));
        if (!hasRequired) {
          await reply
            .status(403)
            .send(
              errorResponse(
                ErrorCode.FORBIDDEN,
                `Requires one of: ${requiredRoles.join(', ')}`,
                request.id,
              ),
            );
        }
      },
  );
};

export default fp(authPlugin, { name: 'auth', dependencies: ['prisma'] });
