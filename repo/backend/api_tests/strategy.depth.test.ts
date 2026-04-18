import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Strategy depth — role authorization and DB-backed happy paths', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  async function seedFacilityLocationAndSku() {
    const facility = await app.prisma.facility.create({
      data: {
        id: randomUUID(),
        name: `Strategy Facility ${randomUUID().slice(0, 8)}`,
        code: `STR-FAC-${randomUUID().slice(0, 6)}`,
      },
    });

    const location = await app.prisma.location.create({
      data: {
        id: randomUUID(),
        facilityId: facility.id,
        code: `STR-LOC-${randomUUID().slice(0, 6)}`,
        type: 'RACK',
        capacityCuFt: 500,
        hazardClass: 'NONE',
        temperatureBand: 'AMBIENT',
        isPickFace: false,
      },
    });

    const sku = await app.prisma.sku.create({
      data: {
        id: randomUUID(),
        code: `STR-SKU-${randomUUID().slice(0, 6)}`,
        name: 'Strategy Depth SKU',
        abcClass: 'A',
        unitWeightLb: 2,
        unitVolumeCuFt: 1,
        hazardClass: 'NONE',
        temperatureBand: 'AMBIENT',
      },
    });

    return { facility, location, sku };
  }

  it('rejects non-strategy role for ruleset listing with 403', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const listRulesets = await app.inject({
      method: 'GET',
      url: '/api/strategy/rulesets',
      headers: authHeader(operator.token),
    });

    expect(listRulesets.statusCode).toBe(403);
    const body = JSON.parse(listRulesets.payload);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('creates ruleset and returns ranked putaway locations for compatible SKU/facility', async () => {
    const strategyManager = await seedUserWithSession(app, ['STRATEGY_MANAGER']);
    const { facility, sku } = await seedFacilityLocationAndSku();

    const createRuleset = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      headers: authHeader(strategyManager.token),
      payload: {
        name: `Depth Ruleset ${randomUUID().slice(0, 8)}`,
        fifoWeight: 1,
        fefoWeight: 1,
        abcWeight: 2,
        heatLevelWeight: 1,
        pathCostWeight: 1,
      },
    });
    expect(createRuleset.statusCode).toBe(201);
    const rulesetId = JSON.parse(createRuleset.payload).data.id as string;

    const getRuleset = await app.inject({
      method: 'GET',
      url: `/api/strategy/rulesets/${rulesetId}`,
      headers: authHeader(strategyManager.token),
    });
    expect(getRuleset.statusCode).toBe(200);
    const getRulesetBody = JSON.parse(getRuleset.payload);
    expect(getRulesetBody.data.id).toBe(rulesetId);
    expect(getRulesetBody.data.abcWeight).toBe(2);

    const patchRuleset = await app.inject({
      method: 'PATCH',
      url: `/api/strategy/rulesets/${rulesetId}`,
      headers: authHeader(strategyManager.token),
      payload: {
        name: 'Depth Ruleset Updated',
        pathCostWeight: 3,
      },
    });
    expect(patchRuleset.statusCode).toBe(200);
    const patchRulesetBody = JSON.parse(patchRuleset.payload);
    expect(patchRulesetBody.data.name).toBe('Depth Ruleset Updated');
    expect(patchRulesetBody.data.pathCostWeight).toBe(3);

    const putawayRank = await app.inject({
      method: 'POST',
      url: '/api/strategy/putaway-rank',
      headers: authHeader(strategyManager.token),
      payload: {
        facilityId: facility.id,
        skuId: sku.id,
        quantity: 10,
        rulesetId,
      },
    });

    expect(putawayRank.statusCode).toBe(200);
    const rankBody = JSON.parse(putawayRank.payload);
    expect(rankBody.success).toBe(true);
    expect(Array.isArray(rankBody.data.ranked)).toBe(true);
    expect(rankBody.data.ranked.length).toBeGreaterThan(0);
  });

  it('plans pick path for generated wave tasks and returns ranked sequence', async () => {
    const planner = await seedUserWithSession(app, ['STRATEGY_MANAGER', 'WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityLocationAndSku();

    const createRuleset = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      headers: authHeader(planner.token),
      payload: {
        name: `Path Ruleset ${randomUUID().slice(0, 8)}`,
      },
    });
    expect(createRuleset.statusCode).toBe(201);
    const rulesetId = JSON.parse(createRuleset.payload).data.id as string;

    const createOrder = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: authHeader(planner.token),
      payload: {
        facilityId: facility.id,
        type: 'SALES',
        lines: [{ skuId: sku.id, quantity: 2 }],
      },
    });
    expect(createOrder.statusCode).toBe(201);
    const orderId = JSON.parse(createOrder.payload).data.id as string;

    const createWave = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: {
        ...authHeader(planner.token),
        'idempotency-key': randomUUID(),
      },
      payload: {
        facilityId: facility.id,
        orderIds: [orderId],
      },
    });
    expect(createWave.statusCode).toBe(201);
    const pickTaskIds = (JSON.parse(createWave.payload).data.pickTasks as Array<{ id: string }>).map((t) => t.id);
    expect(pickTaskIds.length).toBeGreaterThan(0);

    const pickPath = await app.inject({
      method: 'POST',
      url: '/api/strategy/pick-path',
      headers: authHeader(planner.token),
      payload: {
        facilityId: facility.id,
        pickTaskIds,
        rulesetId,
      },
    });
    expect(pickPath.statusCode).toBe(200);
    const pickPathBody = JSON.parse(pickPath.payload);
    expect(Array.isArray(pickPathBody.data.tasks)).toBe(true);
    expect(pickPathBody.data.tasks.length).toBe(pickTaskIds.length);
    expect(pickPathBody.data.tasks[0].suggestedSequence).toBe(1);
    expect(typeof pickPathBody.data.tasks[0].score).toBe('number');
  });

  it('runs simulation successfully and returns deterministic envelope fields', async () => {
    const strategyManager = await seedUserWithSession(app, ['STRATEGY_MANAGER']);
    const { facility } = await seedFacilityLocationAndSku();

    const createRuleset = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      headers: authHeader(strategyManager.token),
      payload: {
        name: `Sim Ruleset ${randomUUID().slice(0, 8)}`,
      },
    });
    expect(createRuleset.statusCode).toBe(201);
    const rulesetId = JSON.parse(createRuleset.payload).data.id as string;

    const simulate = await app.inject({
      method: 'POST',
      url: '/api/strategy/simulate',
      headers: authHeader(strategyManager.token),
      payload: {
        facilityId: facility.id,
        rulesetIds: [rulesetId],
        windowDays: 30,
      },
    });

    expect(simulate.statusCode).toBe(200);
    const body = JSON.parse(simulate.payload);
    expect(body.success).toBe(true);
    expect(typeof body.data.windowDays).toBe('number');
    expect(typeof body.data.totalTasks).toBe('number');
    expect(Array.isArray(body.data.results)).toBe(true);
  });

  it('rejects simulation when windowDays is not 30', async () => {
    const strategyManager = await seedUserWithSession(app, ['STRATEGY_MANAGER']);
    const { facility } = await seedFacilityLocationAndSku();

    const createRuleset = await app.inject({
      method: 'POST',
      url: '/api/strategy/rulesets',
      headers: authHeader(strategyManager.token),
      payload: {
        name: `Sim Ruleset Strict ${randomUUID().slice(0, 8)}`,
      },
    });
    expect(createRuleset.statusCode).toBe(201);
    const rulesetId = JSON.parse(createRuleset.payload).data.id as string;

    const simulate = await app.inject({
      method: 'POST',
      url: '/api/strategy/simulate',
      headers: authHeader(strategyManager.token),
      payload: {
        facilityId: facility.id,
        rulesetIds: [rulesetId],
        windowDays: 14,
      },
    });

    expect(simulate.statusCode).toBe(400);
    expect(JSON.parse(simulate.payload).error.code).toBe('VALIDATION_FAILED');
  });
});
