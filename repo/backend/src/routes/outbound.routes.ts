import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../shared/enums.js';
import { ErrorCode, ErrorHttpStatus, successResponse, errorResponse } from '../shared/envelope.js';
import { tagRequestLogDomain } from '../logging/logger.js';
import {
  createOutboundOrderBodySchema,
  generateWaveBodySchema,
  packVerificationBodySchema,
  handoffBodySchema,
  reportExceptionBodySchema,
  approvePartialBodySchema,
  updatePickTaskBodySchema,
  listOrdersQuerySchema,
  listWavesQuerySchema,
} from '../shared/schemas/outbound.schemas.js';
import {
  createOutboundOrder,
  getOutboundOrder,
  listOutboundOrders,
  generateWave,
  getWave,
  listWaves,
  cancelWave,
  getPickTask,
  updatePickTask,
  verifyPack,
  reportException,
  recordHandoff,
  approvePartialShipment,
  OutboundServiceError,
} from '../services/outbound.service.js';

const operatorRoles = [Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER, Role.SYSTEM_ADMIN];
const managerRoles = [Role.WAREHOUSE_MANAGER, Role.SYSTEM_ADMIN];

function handleServiceError(
  err: unknown,
  request: Parameters<FastifyPluginAsync>[0]['inject'] extends (...args: infer A) => unknown ? never : unknown,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  requestId: string,
): unknown {
  if (err instanceof OutboundServiceError) {
    const status = ErrorHttpStatus[err.code] ?? 500;
    return reply.status(status).send(errorResponse(err.code, err.message, requestId));
  }
  throw err;
}

export const outboundRoutes: FastifyPluginAsync = async (fastify) => {
  tagRequestLogDomain(fastify, 'outbound');

  // ---- Orders ----

  fastify.get(
    '/orders',
    { schema: { querystring: listOrdersQuerySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      const query = request.query as { facilityId?: string; status?: string };
      const orders = await listOutboundOrders(fastify.prisma, query, request.principal!);
      return reply.status(200).send(successResponse(orders, request.id));
    },
  );

  fastify.post(
    '/orders',
    { schema: { body: createOutboundOrderBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const body = request.body as {
          facilityId: string;
          type: string;
          referenceNumber?: string;
          requestedShipDate?: string;
          lines: Array<{ skuId: string; quantity: number }>;
        };
        const order = await createOutboundOrder(
          fastify.prisma,
          {
            ...body,
            requestedShipDate: body.requestedShipDate ? new Date(body.requestedShipDate) : undefined,
          },
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(order, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.get(
    '/orders/:orderId',
    { preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const order = await getOutboundOrder(fastify.prisma, orderId, request.principal!);
        return reply.status(200).send(successResponse(order, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.patch(
    '/orders/:orderId/approve-partial',
    { schema: { body: approvePartialBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)] },
    async (request, reply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const order = await approvePartialShipment(fastify.prisma, orderId, request.principal!.userId);
        return reply.status(200).send(successResponse(order, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.post(
    '/orders/:orderId/exceptions',
    { schema: { body: reportExceptionBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const body = request.body as {
          lineId: string;
          shortageReason: string;
          quantityShort: number;
          notes?: string;
        };
        const result = await reportException(
          fastify.prisma,
          orderId,
          body,
          request.principal!.userId,
          request.principal!,
        );
        return reply.status(201).send(successResponse(result, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.post(
    '/orders/:orderId/pack-verify',
    { schema: { body: packVerificationBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const body = request.body as { actualWeightLb: number; actualVolumeCuFt: number };
        const verification = await verifyPack(
          fastify.prisma,
          orderId,
          body,
          request.principal!.userId,
          request.principal!,
        );
        return reply.status(200).send(successResponse(verification, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.post(
    '/orders/:orderId/handoff',
    { schema: { body: handoffBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const body = request.body as { carrier: string; trackingNumber?: string; notes?: string };
        const handoff = await recordHandoff(
          fastify.prisma,
          orderId,
          body,
          request.principal!.userId,
          request.principal!,
        );
        return reply.status(201).send(successResponse(handoff, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  // ---- Waves ----

  fastify.get(
    '/waves',
    { schema: { querystring: listWavesQuerySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      const query = request.query as { facilityId?: string; status?: string };
      const waves = await listWaves(fastify.prisma, query, request.principal!);
      return reply.status(200).send(successResponse(waves, request.id));
    },
  );

  fastify.post(
    '/waves',
    { schema: { body: generateWaveBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
        if (!idempotencyKey) {
          return reply
            .status(400)
            .send(errorResponse(ErrorCode.VALIDATION_FAILED, 'Idempotency-Key header is required', request.id));
        }
        const body = request.body as { facilityId: string; orderIds: string[] };
        const result = await generateWave(
          fastify.prisma,
          idempotencyKey,
          body,
          request.principal!.userId,
          request.principal!,
        );
        const status = result.fromCache ? 200 : 201;
        return reply.status(status).send(successResponse(result.wave, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.get(
    '/waves/:waveId',
    { preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const { waveId } = request.params as { waveId: string };
        const wave = await getWave(fastify.prisma, waveId, request.principal!);
        return reply.status(200).send(successResponse(wave, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.patch(
    '/waves/:waveId/cancel',
    { preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)] },
    async (request, reply) => {
      try {
        const { waveId } = request.params as { waveId: string };
        const wave = await cancelWave(fastify.prisma, waveId, request.principal!.userId);
        return reply.status(200).send(successResponse(wave, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  // ---- Pick Tasks ----

  fastify.get(
    '/pick-tasks/:taskId',
    { preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const task = await getPickTask(fastify.prisma, taskId, request.principal!);
        return reply.status(200).send(successResponse(task, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );

  fastify.patch(
    '/pick-tasks/:taskId',
    { schema: { body: updatePickTaskBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)] },
    async (request, reply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const body = request.body as {
          status?: string;
          quantityPicked?: number;
          actualDistance?: number;
        };
        const task = await updatePickTask(
          fastify.prisma,
          taskId,
          body,
          request.principal!.userId,
          request.principal!,
        );
        return reply.status(200).send(successResponse(task, request.id));
      } catch (err) {
        return handleServiceError(err, request as never, reply, request.id);
      }
    },
  );
};
