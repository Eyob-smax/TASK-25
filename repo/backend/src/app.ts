import Fastify, { type FastifyInstance } from 'fastify';
import { type AppConfig, loadConfig, assertEncryptionKeyOrFail } from './config.js';
import { errorResponse, ErrorCode } from './shared/envelope.js';
import prismaPlugin from './plugins/prisma.plugin.js';
import authPlugin from './plugins/auth.plugin.js';
import securityPlugin from './plugins/security.plugin.js';
import { authRoutes } from './routes/auth.routes.js';
import { warehouseRoutes } from './routes/warehouse.routes.js';
import { outboundRoutes } from './routes/outbound.routes.js';
import { strategyRoutes } from './routes/strategy.routes.js';
import { membershipRoutes } from './routes/membership.routes.js';
import { cmsRoutes } from './routes/cms.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { startAppointmentExpireScheduler } from './services/appointment.scheduler.js';
import { startCmsPublishScheduler } from './services/cms.scheduler.js';
import { createDomainLogger } from './logging/logger.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export interface BuildAppOptions {
  config?: AppConfig;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  // Hard-fail early when the encryption key is missing/malformed in any non-test
  // runtime, even if a caller passed a pre-built config that bypassed loadConfig.
  assertEncryptionKeyOrFail(config);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Redact sensitive request fields from log output
      redact: {
        paths: [
          'req.headers.authorization',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.last4',
        ],
        censor: '[REDACTED]',
      },
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
  });

  // Make config available to all plugins and routes
  app.decorate('config', config);

  // Global error handler — normalize Fastify validation and uncaught errors
  // into the standard envelope. Route handlers that send their own error
  // envelopes are unaffected because they return before throwing.
  app.setErrorHandler((error, request, reply) => {
    if (error.validation && error.validation.length > 0) {
      const details = error.validation.map((v) => {
        // `instancePath` is like "/body/username"; strip the leading slash.
        const rawField = (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
        const missing = (v.params as { missingProperty?: string } | undefined)?.missingProperty;
        const field = missing ? (rawField ? `${rawField}.${missing}` : missing) : rawField || undefined;
        return { field, message: v.message ?? 'invalid value' };
      });
      return reply.status(400).send(
        errorResponse(ErrorCode.VALIDATION_FAILED, 'Request validation failed', request.id, details),
      );
    }
    if (error.statusCode === 401) {
      return reply.status(401).send(
        errorResponse(ErrorCode.UNAUTHORIZED, error.message || 'Unauthorized', request.id),
      );
    }
    if (error.statusCode === 403) {
      return reply.status(403).send(
        errorResponse(ErrorCode.FORBIDDEN, error.message || 'Forbidden', request.id),
      );
    }
    if (error.statusCode === 404) {
      return reply.status(404).send(
        errorResponse(ErrorCode.NOT_FOUND, error.message || 'Not found', request.id),
      );
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(error.statusCode ?? 500).send(
      errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || 'Internal server error',
        request.id,
      ),
    );
  });

  // Infrastructure plugins — registration order is load order
  await app.register(prismaPlugin, { databaseUrl: config.databaseUrl });
  await app.register(authPlugin);
  await app.register(securityPlugin);

  // --- Health endpoint (always available, no auth required) ---
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // --- Domain route registrations ---
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(warehouseRoutes, { prefix: '/api/warehouse' });
  await app.register(outboundRoutes, { prefix: '/api/outbound' });
  await app.register(strategyRoutes, { prefix: '/api/strategy' });
  await app.register(membershipRoutes, { prefix: '/api/membership' });
  await app.register(cmsRoutes, { prefix: '/api/cms' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // Start background schedulers; cleared on close. Each scheduler gets a
  // domain-tagged child logger so its output is tagged with `{ domain: '...' }`
  // in structured logs, making production filtering straightforward.
  app.addHook('onReady', async () => {
    const appointmentTimer = startAppointmentExpireScheduler(
      app.prisma,
      createDomainLogger(app.log, 'warehouse'),
    );
    const cmsTimer = startCmsPublishScheduler(
      app.prisma,
      createDomainLogger(app.log, 'cms'),
    );
    app.addHook('onClose', async () => {
      clearInterval(appointmentTimer);
      clearInterval(cmsTimer);
    });
  });

  return app;
}
