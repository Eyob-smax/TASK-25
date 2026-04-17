import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../shared/enums.js';
import { successResponse, errorResponse, ErrorCode, ErrorHttpStatus } from '../shared/envelope.js';
import { tagRequestLogDomain, createDomainLogger } from '../logging/logger.js';
import { parseMasterKey } from '../security/encryption.js';
import {
  createBackupBodySchema,
  restoreBackupBodySchema,
  createParameterBodySchema,
  updateParameterBodySchema,
  createIpAllowlistEntryBodySchema,
  updateIpAllowlistEntryBodySchema,
  listIpAllowlistQuerySchema,
  retentionPurgeBodySchema,
  rotateKeyBodySchema,
} from '../shared/schemas/admin.schemas.js';
import {
  createBackup,
  listBackups,
  getBackup,
  restoreBackup,
  getRetentionReport,
  purgeBillingRecords,
  purgeOperationalLogs,
  listAllParameters,
  getParameter,
  setParameter,
  updateParameterValue,
  removeParameter,
  listIpAllowlist,
  addIpAllowlistEntry,
  modifyIpAllowlistEntry,
  removeIpAllowlistEntry,
  listEncryptionKeyVersions,
  triggerKeyRotation,
  getDiagnostics,
  AdminServiceError,
} from '../services/admin.service.js';

const adminOnly = [Role.SYSTEM_ADMIN];

interface SnapshotIdParams { snapshotId: string }
interface EntryIdParams { entryId: string }
interface ParamKeyParams { key: string }
interface RestoreBody { confirm: boolean }
interface CreateParameterBody { key: string; value: string; description?: string }
interface UpdateParameterBody { value: string; description?: string }
interface CreateIpAllowlistBody { cidr: string; routeGroup: string; description?: string; isActive?: boolean }
interface UpdateIpAllowlistBody { cidr?: string; isActive?: boolean; description?: string }
interface ListIpAllowlistQuery { routeGroup?: string }
interface RetentionPurgeBody { confirm: boolean }
interface RotateKeyBody { keyHash: string }

function handleServiceError(
  err: unknown,
  request: { id: string },
  reply: { status: (n: number) => { send: (v: unknown) => unknown } },
) {
  if (err instanceof AdminServiceError) {
    const status = ErrorHttpStatus[err.code] ?? 500;
    return reply.status(status).send(errorResponse(err.code, err.message, request.id));
  }
  throw err;
}

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  tagRequestLogDomain(fastify, 'admin');

  const ipCheckAdmin = fastify.checkIpAllowlist('admin');

  // ===== DIAGNOSTICS =====

  fastify.get(
    '/diagnostics',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      try {
        const data = await getDiagnostics(fastify.prisma);
        return reply.status(200).send(successResponse(data, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== BACKUP =====

  fastify.post(
    '/backup',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: createBackupBodySchema },
    },
    async (request, reply) => {
      const backupLog = createDomainLogger(request.log, 'backup');
      try {
        const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
        const backupDir = request.server.config.backupDir ?? '../backups';
        backupLog.info({ actorId: request.principal!.userId }, 'Backup snapshot requested');
        const snapshot = await createBackup(
          fastify.prisma,
          request.server.config.databaseUrl,
          backupDir,
          masterKey,
          request.principal!.userId,
        );
        backupLog.info(
          { snapshotId: snapshot.id, sizeBytes: snapshot.sizeBytes },
          'Backup snapshot created',
        );
        return reply.status(201).send(successResponse(snapshot, request.id));
      } catch (err) {
        backupLog.error({ err }, 'Backup snapshot failed');
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get(
    '/backup',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      const snapshots = await listBackups(fastify.prisma);
      return reply.status(200).send(successResponse(snapshots, request.id));
    },
  );

  fastify.get<{ Params: SnapshotIdParams }>(
    '/backup/:snapshotId',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      try {
        const snapshot = await getBackup(fastify.prisma, request.params.snapshotId);
        return reply.status(200).send(successResponse(snapshot, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: SnapshotIdParams; Body: RestoreBody }>(
    '/backup/:snapshotId/restore',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: restoreBackupBodySchema },
    },
    async (request, reply) => {
      const backupLog = createDomainLogger(request.log, 'backup');
      try {
        const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
        const backupDir = request.server.config.backupDir ?? '../backups';
        backupLog.warn(
          { snapshotId: request.params.snapshotId, actorId: request.principal!.userId },
          'Backup restore requested',
        );
        const result = await restoreBackup(
          fastify.prisma,
          request.params.snapshotId,
          request.server.config.databaseUrl,
          backupDir,
          masterKey,
          request.principal!.userId,
        );
        backupLog.info(
          { snapshotId: request.params.snapshotId },
          'Backup restore completed',
        );
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        backupLog.error(
          { err, snapshotId: request.params.snapshotId },
          'Backup restore failed',
        );
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== RETENTION =====

  fastify.get(
    '/retention/report',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      try {
        const report = await getRetentionReport(fastify.prisma);
        return reply.status(200).send(successResponse(report, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Body: RetentionPurgeBody }>(
    '/retention/purge-billing',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: retentionPurgeBodySchema },
    },
    async (request, reply) => {
      const retentionLog = createDomainLogger(request.log, 'retention');
      try {
        const result = await purgeBillingRecords(fastify.prisma, request.principal!.userId);
        retentionLog.info(
          { actorId: request.principal!.userId, purged: result },
          'Billing retention purge executed',
        );
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        retentionLog.error({ err }, 'Billing retention purge failed');
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Body: RetentionPurgeBody }>(
    '/retention/purge-operational',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: retentionPurgeBodySchema },
    },
    async (request, reply) => {
      const retentionLog = createDomainLogger(request.log, 'retention');
      try {
        const result = await purgeOperationalLogs(fastify.prisma, request.principal!.userId);
        retentionLog.info(
          { actorId: request.principal!.userId, purged: result },
          'Operational retention purge executed',
        );
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        retentionLog.error({ err }, 'Operational retention purge failed');
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== PARAMETERS =====

  fastify.get(
    '/parameters',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      const params = await listAllParameters(fastify.prisma);
      return reply.status(200).send(successResponse(params, request.id));
    },
  );

  fastify.post<{ Body: CreateParameterBody }>(
    '/parameters',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: createParameterBodySchema },
    },
    async (request, reply) => {
      try {
        const param = await setParameter(
          fastify.prisma,
          request.body,
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(param, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: ParamKeyParams }>(
    '/parameters/:key',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      try {
        const param = await getParameter(fastify.prisma, request.params.key);
        return reply.status(200).send(successResponse(param, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.put<{ Params: ParamKeyParams; Body: UpdateParameterBody }>(
    '/parameters/:key',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: updateParameterBodySchema },
    },
    async (request, reply) => {
      try {
        const param = await updateParameterValue(
          fastify.prisma,
          request.params.key,
          request.body,
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(param, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.delete<{ Params: ParamKeyParams }>(
    '/parameters/:key',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      try {
        await removeParameter(fastify.prisma, request.params.key, request.principal!.userId);
        return reply.status(204).send();
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== IP ALLOWLIST =====

  fastify.get<{ Querystring: ListIpAllowlistQuery }>(
    '/ip-allowlist',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { querystring: listIpAllowlistQuerySchema },
    },
    async (request, reply) => {
      const entries = await listIpAllowlist(fastify.prisma, request.query.routeGroup);
      return reply.status(200).send(successResponse(entries, request.id));
    },
  );

  fastify.post<{ Body: CreateIpAllowlistBody }>(
    '/ip-allowlist',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: createIpAllowlistEntryBodySchema },
    },
    async (request, reply) => {
      try {
        const entry = await addIpAllowlistEntry(
          fastify.prisma,
          request.body,
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(entry, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.patch<{ Params: EntryIdParams; Body: UpdateIpAllowlistBody }>(
    '/ip-allowlist/:entryId',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: updateIpAllowlistEntryBodySchema },
    },
    async (request, reply) => {
      try {
        const entry = await modifyIpAllowlistEntry(
          fastify.prisma,
          request.params.entryId,
          request.body,
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(entry, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.delete<{ Params: EntryIdParams }>(
    '/ip-allowlist/:entryId',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      try {
        await removeIpAllowlistEntry(
          fastify.prisma,
          request.params.entryId,
          request.principal!.userId,
        );
        return reply.status(204).send();
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== ENCRYPTION KEY VERSIONS =====

  fastify.get(
    '/key-versions',
    { preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin] },
    async (request, reply) => {
      const versions = await listEncryptionKeyVersions(fastify.prisma);
      return reply.status(200).send(successResponse(versions, request.id));
    },
  );

  fastify.post<{ Body: RotateKeyBody }>(
    '/key-versions/rotate',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(adminOnly), ipCheckAdmin],
      schema: { body: rotateKeyBodySchema },
    },
    async (request, reply) => {
      try {
        const newVersion = await triggerKeyRotation(
          fastify.prisma,
          request.body.keyHash,
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(newVersion, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );
};
