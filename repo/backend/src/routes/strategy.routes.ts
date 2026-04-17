import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../shared/enums.js';
import { ErrorHttpStatus, successResponse, errorResponse } from '../shared/envelope.js';
import { tagRequestLogDomain } from '../logging/logger.js';
import {
  createRulesetBodySchema,
  updateRulesetBodySchema,
  listRulesetsQuerySchema,
  putawayRankBodySchema,
  pickPathBodySchema,
  simulateBodySchema,
} from '../shared/schemas/strategy.schemas.js';
import {
  createRuleset,
  getRuleset,
  listRulesets,
  updateRuleset,
  rankPutawayLocations,
  planPickPath,
  runSimulation,
  StrategyServiceError,
} from '../services/strategy.service.js';

const strategyRoles = [Role.STRATEGY_MANAGER, Role.SYSTEM_ADMIN];
const warehouseAndStrategyRoles = [
  Role.WAREHOUSE_OPERATOR,
  Role.WAREHOUSE_MANAGER,
  Role.STRATEGY_MANAGER,
  Role.SYSTEM_ADMIN,
];

function handleServiceError(
  err: unknown,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  requestId: string,
): unknown {
  if (err instanceof StrategyServiceError) {
    const status = ErrorHttpStatus[err.code] ?? 500;
    return reply.status(status).send(errorResponse(err.code, err.message, requestId));
  }
  throw err;
}

export const strategyRoutes: FastifyPluginAsync = async (fastify) => {
  tagRequestLogDomain(fastify, 'strategy');

  // ---- Rulesets ----

  fastify.get(
    '/rulesets',
    { schema: { querystring: listRulesetsQuerySchema }, preHandler: [fastify.authenticate, fastify.requireRole(strategyRoles)] },
    async (request, reply) => {
      const query = request.query as { includeInactive?: boolean };
      const rulesets = await listRulesets(fastify.prisma, { includeInactive: query.includeInactive });
      return reply.status(200).send(successResponse(rulesets, request.id));
    },
  );

  fastify.post(
    '/rulesets',
    { schema: { body: createRulesetBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(strategyRoles)] },
    async (request, reply) => {
      try {
        const body = request.body as {
          name: string;
          description?: string;
          fifoWeight?: number;
          fefoWeight?: number;
          abcWeight?: number;
          heatLevelWeight?: number;
          pathCostWeight?: number;
        };
        const ruleset = await createRuleset(fastify.prisma, body, request.principal!.userId);
        return reply.status(201).send(successResponse(ruleset, request.id));
      } catch (err) {
        return handleServiceError(err, reply, request.id);
      }
    },
  );

  fastify.get(
    '/rulesets/:rulesetId',
    { preHandler: [fastify.authenticate, fastify.requireRole(strategyRoles)] },
    async (request, reply) => {
      try {
        const { rulesetId } = request.params as { rulesetId: string };
        const ruleset = await getRuleset(fastify.prisma, rulesetId);
        return reply.status(200).send(successResponse(ruleset, request.id));
      } catch (err) {
        return handleServiceError(err, reply, request.id);
      }
    },
  );

  fastify.patch(
    '/rulesets/:rulesetId',
    { schema: { body: updateRulesetBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(strategyRoles)] },
    async (request, reply) => {
      try {
        const { rulesetId } = request.params as { rulesetId: string };
        const body = request.body as {
          name?: string;
          description?: string;
          fifoWeight?: number;
          fefoWeight?: number;
          abcWeight?: number;
          heatLevelWeight?: number;
          pathCostWeight?: number;
          isActive?: boolean;
        };
        const ruleset = await updateRuleset(fastify.prisma, rulesetId, body, request.principal!.userId);
        return reply.status(200).send(successResponse(ruleset, request.id));
      } catch (err) {
        return handleServiceError(err, reply, request.id);
      }
    },
  );

  // ---- Strategy queries ----

  fastify.post(
    '/putaway-rank',
    { schema: { body: putawayRankBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(warehouseAndStrategyRoles)] },
    async (request, reply) => {
      try {
        const body = request.body as {
          facilityId: string;
          skuId: string;
          quantity: number;
          rulesetId?: string;
          lotNumber?: string;
          expirationDate?: string;
        };
        const result = await rankPutawayLocations(
          fastify.prisma,
          {
            ...body,
            expirationDate: body.expirationDate ? new Date(body.expirationDate) : undefined,
          },
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        return handleServiceError(err, reply, request.id);
      }
    },
  );

  fastify.post(
    '/pick-path',
    { schema: { body: pickPathBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(warehouseAndStrategyRoles)] },
    async (request, reply) => {
      try {
        const body = request.body as {
          facilityId: string;
          pickTaskIds: string[];
          rulesetId?: string;
        };
        const result = await planPickPath(fastify.prisma, body, request.principal!.userId);
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        return handleServiceError(err, reply, request.id);
      }
    },
  );

  fastify.post(
    '/simulate',
    { schema: { body: simulateBodySchema }, preHandler: [fastify.authenticate, fastify.requireRole(strategyRoles)] },
    async (request, reply) => {
      try {
        const body = request.body as {
          facilityId: string;
          rulesetIds: string[];
          windowDays?: number;
        };
        const result = await runSimulation(fastify.prisma, body, request.principal!.userId);
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        return handleServiceError(err, reply, request.id);
      }
    },
  );
};
