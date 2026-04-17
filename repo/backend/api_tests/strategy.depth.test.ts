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
});
