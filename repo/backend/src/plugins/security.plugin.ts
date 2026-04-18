import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  evaluateRateLimit,
  evaluateBurstLimit,
  isWindowExpired,
} from '../security/ratelimit.js';
import { isIpAllowed, type AllowlistEntry } from '../security/ipallowlist.js';
import {
  getLatestRateLimitBucket,
  createRateLimitBucket,
  incrementRateLimitBucket,
  getIpAllowlistForGroup,
} from '../repositories/auth.repository.js';
import { errorResponse, ErrorCode } from '../shared/envelope.js';
import { RATE_LIMIT_DEFAULTS } from '../shared/types.js';
import type { AppConfig } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Return a preHandler that rejects requests whose source IP is not in the
     * allowlist for the given routeGroup.  An empty allowlist permits all IPs.
     */
    checkIpAllowlist: (
      routeGroup: string,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const securityPlugin: FastifyPluginAsync = async (fastify) => {
  const config = (fastify as typeof fastify & { config: AppConfig }).config;

  // --- Per-principal fixed-window rate limiting (authenticated requests only) ---
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const principal = request.principal;
    if (!principal) return; // unauthenticated requests are not subject to this check

    const principalKey = `user:${principal.userId}`;
    const now = new Date();

    try {
      const bucket = await getLatestRateLimitBucket(fastify.prisma, principalKey);

      let result;
      if (!bucket || isWindowExpired(bucket.windowStart, now)) {
        // Start a fresh window
        await createRateLimitBucket(fastify.prisma, principalKey, now);
        result = {
          allowed: true,
          remaining: RATE_LIMIT_DEFAULTS.requestsPerMinute - 1,
          resetAt: new Date(now.getTime() + 60_000),
          limit: RATE_LIMIT_DEFAULTS.requestsPerMinute,
        };
      } else {
        result = evaluateRateLimit(
          bucket.requestCount,
          bucket.windowStart,
          now,
          RATE_LIMIT_DEFAULTS.requestsPerMinute,
        );

        if (result.allowed) {
          await incrementRateLimitBucket(fastify.prisma, bucket.id);
        }
      }

      reply.header('X-RateLimit-Limit', String(result.limit));
      reply.header('X-RateLimit-Remaining', String(result.remaining));
      reply.header('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

      if (!result.allowed) {
        const retryAfter = Math.ceil((result.resetAt.getTime() - now.getTime()) / 1000);
        reply.header('Retry-After', String(retryAfter));
        await reply
          .status(429)
          .send(
            errorResponse(
              ErrorCode.RATE_LIMITED,
              'Rate limit exceeded. Please slow down.',
              request.id,
              undefined,
              { retryAfterSeconds: retryAfter },
            ),
          );
        return;
      }

      // --- Burst sub-window layer: reject tight spikes even under the minute cap ---
      const burstKey = `burst:${principal.userId}`;
      const burstBucket = await getLatestRateLimitBucket(fastify.prisma, burstKey);
      let burstResult;
      if (!burstBucket || isWindowExpired(burstBucket.windowStart, now, 10_000)) {
        await createRateLimitBucket(fastify.prisma, burstKey, now);
        burstResult = {
          allowed: true,
          remaining: RATE_LIMIT_DEFAULTS.burstLimit - 1,
          resetAt: new Date(now.getTime() + 10_000),
          limit: RATE_LIMIT_DEFAULTS.burstLimit,
        };
      } else {
        burstResult = evaluateBurstLimit(
          burstBucket.requestCount,
          burstBucket.windowStart,
          now,
          RATE_LIMIT_DEFAULTS.burstLimit,
        );
        if (burstResult.allowed) {
          await incrementRateLimitBucket(fastify.prisma, burstBucket.id);
        }
      }

      if (!burstResult.allowed) {
        const retryAfter = Math.ceil((burstResult.resetAt.getTime() - now.getTime()) / 1000);
        reply.header('Retry-After', String(retryAfter));
        await reply
          .status(429)
          .send(
            errorResponse(
              ErrorCode.RATE_LIMITED,
              'Burst rate limit exceeded. Please slow down.',
              request.id,
              undefined,
              { retryAfterSeconds: retryAfter, burstLimit: burstResult.limit },
            ),
          );
      }
    } catch (err) {
      request.log.error({ err, principalKey }, 'Rate limit check failed; denying request');
      await reply
        .status(503)
        .send(
          errorResponse(
            ErrorCode.INTERNAL_ERROR,
            'Rate limiting temporarily unavailable',
            request.id,
          ),
        );
      return;
    }
  });

  // --- IP allowlist factory ---
  fastify.decorate(
    'checkIpAllowlist',
    (routeGroup: string) =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const ip = request.ip;
        try {
          const entries = await getIpAllowlistForGroup(fastify.prisma, routeGroup);
          if (
            !isIpAllowed(ip, entries as AllowlistEntry[], {
              // Default to fail-closed when the flag is unset — an empty active
              // allowlist on a privileged route group denies requests rather
              // than silently permitting them. `ipAllowlistStrictMode: false`
              // is an explicit opt-out for offline/dev bootstrap scenarios.
              failClosed: config.ipAllowlistStrictMode ?? true,
            })
          ) {
            await reply
              .status(403)
              .send(
                errorResponse(
                  ErrorCode.IP_BLOCKED,
                  'Access denied: your IP address is not on the allowlist',
                  request.id,
                ),
              );
            return;
          }
        } catch (err) {
          request.log.error({ err, routeGroup, ip }, 'IP allowlist check failed; denying request');
          await reply
            .status(500)
            .send(
              errorResponse(
                ErrorCode.INTERNAL_ERROR,
                'IP allowlist validation unavailable',
                request.id,
              ),
            );
          return;
        }
      },
  );

};

export default fp(securityPlugin, { name: 'security', dependencies: ['prisma', 'auth'] });
