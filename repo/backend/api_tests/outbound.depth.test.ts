import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Outbound depth — idempotency, variance, and approval gates', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  async function seedFacilityAndSku() {
    const facility = await app.prisma.facility.create({
      data: {
        id: randomUUID(),
        name: `Depth Facility ${randomUUID().slice(0, 8)}`,
        code: `OB-FAC-${randomUUID().slice(0, 6)}`,
      },
    });

    const sku = await app.prisma.sku.create({
      data: {
        id: randomUUID(),
        code: `OB-SKU-${randomUUID().slice(0, 6)}`,
        name: 'Depth Test SKU',
        unitWeightLb: 2,
        unitVolumeCuFt: 1,
      },
    });

    return { facility, sku };
  }

  async function createOrder(token: string, facilityId: string, skuId: string, quantity = 2) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/orders',
      headers: authHeader(token),
      payload: {
        facilityId,
        type: 'SALES',
        lines: [{ skuId, quantity }],
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.payload).data;
  }

  it('supports idempotent replay and rejects mismatched payload with IDEMPOTENCY_CONFLICT', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 1);

    const key = randomUUID();

    const first = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: { ...authHeader(operator.token), 'idempotency-key': key },
      payload: { facilityId: facility.id, orderIds: [order.id] },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.payload);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: { ...authHeader(operator.token), 'idempotency-key': key },
      payload: { facilityId: facility.id, orderIds: [order.id] },
    });
    expect(replay.statusCode).toBe(200);
    const replayBody = JSON.parse(replay.payload);
    expect(replayBody.data.id).toBe(firstBody.data.id);

    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: { ...authHeader(operator.token), 'idempotency-key': key },
      payload: { facilityId: `${facility.id}-different`, orderIds: [order.id] },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(JSON.parse(mismatch.payload).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects pack verify beyond tolerance with 422 VARIANCE_EXCEEDED', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 2);

    const verify = await app.inject({
      method: 'POST',
      url: `/api/outbound/orders/${order.id}/pack-verify`,
      headers: authHeader(operator.token),
      payload: { actualWeightLb: 999, actualVolumeCuFt: 999 },
    });

    expect(verify.statusCode).toBe(422);
    const body = JSON.parse(verify.payload);
    expect(body.error.code).toBe('VARIANCE_EXCEEDED');
  });

  it('requires approval for partial shipment and succeeds after manager approval', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(manager.token, facility.id, sku.id, 5);

    // Simulate shortage produced during picking.
    await app.prisma.outboundOrderLine.updateMany({
      where: { orderId: order.id, lineType: 'STANDARD' },
      data: { quantityShort: 2, shortageReason: 'STOCKOUT' },
    });

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/outbound/orders/${order.id}/handoff`,
      headers: authHeader(manager.token),
      payload: { carrier: 'DepthCarrier' },
    });
    expect(blocked.statusCode).toBe(422);
    expect(JSON.parse(blocked.payload).error.code).toBe('APPROVAL_REQUIRED');

    const approve = await app.inject({
      method: 'PATCH',
      url: `/api/outbound/orders/${order.id}/approve-partial`,
      headers: authHeader(manager.token),
      payload: { reason: 'Manager approved partial shipment' },
    });
    expect(approve.statusCode).toBe(200);

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/outbound/orders/${order.id}/handoff`,
      headers: authHeader(manager.token),
      payload: { carrier: 'DepthCarrier', trackingNumber: 'DEPTH-TRACK-1' },
    });
    expect(handoff.statusCode).toBe(201);

    const orderAfter = await app.inject({
      method: 'GET',
      url: `/api/outbound/orders/${order.id}`,
      headers: authHeader(manager.token),
    });
    expect(orderAfter.statusCode).toBe(200);
    expect(JSON.parse(orderAfter.payload).data.status).toBe('PARTIAL_SHIPPED');
  });
});
