import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

/**
 * Structured log domains for consistent troubleshooting across subsystems.
 * Each domain label appears as `{ domain: '...' }` in every log line emitted
 * by a child logger, enabling log filtering by subsystem in production tooling.
 */
export type LogDomain =
  | 'auth'
  | 'warehouse'
  | 'outbound'
  | 'strategy'
  | 'membership'
  | 'cms'
  | 'backup'
  | 'retention'
  | 'audit'
  | 'admin';

/**
 * Create a child logger bound to a specific operational domain.
 * Every log entry from the returned logger includes `{ domain }` in its
 * structured output, supporting grep-based and query-based log triage.
 *
 * Usage:
 *   const log = createDomainLogger(fastify.log, 'backup');
 *   log.info({ snapshotId }, 'Backup created');
 *   // → { domain: 'backup', snapshotId: '...', msg: 'Backup created' }
 */
export function createDomainLogger(
  logger: FastifyBaseLogger,
  domain: LogDomain,
): FastifyBaseLogger {
  return logger.child({ domain });
}

/**
 * Attach a domain tag to every request handled by a Fastify plugin scope.
 * Call this at the top of a route plugin body; an `onRequest` hook replaces
 * `request.log` with a domain-tagged child logger so every downstream log
 * emission (service, handler, error handler) carries `{ domain }` in its
 * structured output — without touching individual logger call sites.
 */
export function tagRequestLogDomain(fastify: FastifyInstance, domain: LogDomain): void {
  fastify.addHook('onRequest', async (request) => {
    // `request.log` is declared as `FastifyBaseLogger` without `readonly` in
    // Fastify 5, but casting through the structural shape keeps this helper
    // resilient if the typing tightens in a future release.
    (request as unknown as { log: FastifyBaseLogger }).log = createDomainLogger(
      request.log,
      domain,
    );
  });
}
