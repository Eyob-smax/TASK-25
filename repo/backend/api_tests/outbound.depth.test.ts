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

    await app.prisma.location.create({
      data: {
        id: randomUUID(),
        facilityId: facility.id,
        code: `OB-LOC-${randomUUID().slice(0, 6)}`,
        type: 'STAGING',
        capacityCuFt: 1000,
        hazardClass: 'NONE',
        temperatureBand: 'AMBIENT',
        isActive: true,
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

    const orderDetail = await app.inject({
      method: 'GET',
      url: `/api/outbound/orders/${order.id}`,
      headers: authHeader(operator.token),
    });
    expect(orderDetail.statusCode).toBe(200);
    const orderDetailBody = JSON.parse(orderDetail.payload);
    expect(orderDetailBody.data.id).toBe(order.id);
    expect(Array.isArray(orderDetailBody.data.lines)).toBe(true);
    expect(orderDetailBody.data.lines.length).toBeGreaterThan(0);

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

  it('returns wave details and supports manager cancellation', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 2);

    const waveCreate = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: {
        ...authHeader(operator.token),
        'idempotency-key': randomUUID(),
      },
      payload: {
        facilityId: facility.id,
        orderIds: [order.id],
      },
    });
    expect(waveCreate.statusCode).toBe(201);
    const waveId = JSON.parse(waveCreate.payload).data.id as string;

    const getWave = await app.inject({
      method: 'GET',
      url: `/api/outbound/waves/${waveId}`,
      headers: authHeader(operator.token),
    });
    expect(getWave.statusCode).toBe(200);
    const getWaveBody = JSON.parse(getWave.payload);
    expect(getWaveBody.data.id).toBe(waveId);
    expect(Array.isArray(getWaveBody.data.pickTasks)).toBe(true);
    expect(getWaveBody.data.pickTasks.length).toBeGreaterThan(0);

    const cancelWave = await app.inject({
      method: 'PATCH',
      url: `/api/outbound/waves/${waveId}/cancel`,
      headers: authHeader(manager.token),
      payload: {},
    });
    expect(cancelWave.statusCode).toBe(200);
    expect(JSON.parse(cancelWave.payload).data.status).toBe('CANCELLED');

    const getCancelledWave = await app.inject({
      method: 'GET',
      url: `/api/outbound/waves/${waveId}`,
      headers: authHeader(operator.token),
    });
    expect(getCancelledWave.statusCode).toBe(200);
    expect(JSON.parse(getCancelledWave.payload).data.status).toBe('CANCELLED');
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

  it('rejects handoff before order is PACKED with PASSED verification', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 2);

    const response = await app.inject({
      method: 'POST',
      url: `/api/outbound/orders/${order.id}/handoff`,
      headers: authHeader(operator.token),
      payload: { carrier: 'DepthCarrier' },
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.payload).error.code).toBe('INVALID_TRANSITION');
  });

  it('requires approval for partial shipment and succeeds after manager approval', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(manager.token, facility.id, sku.id, 5);

    const packVerify = await app.inject({
      method: 'POST',
      url: `/api/outbound/orders/${order.id}/pack-verify`,
      headers: authHeader(manager.token),
      payload: { actualWeightLb: 10, actualVolumeCuFt: 5 },
    });
    expect(packVerify.statusCode).toBe(200);

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
    const approveBody = JSON.parse(approve.payload);
    expect(approveBody.data.approvedForPartialShip).toBe(true);
    expect(approveBody.data.approvedBy).toBe(manager.id);
    expect(typeof approveBody.data.approvedAt).toBe('string');

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

  it('enforces object-level order scope for non-manager operators', async () => {
    const owner = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const otherOperator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(owner.token, facility.id, sku.id, 2);

    const ownerGet = await app.inject({
      method: 'GET',
      url: `/api/outbound/orders/${order.id}`,
      headers: authHeader(owner.token),
    });
    expect(ownerGet.statusCode).toBe(200);

    const otherGet = await app.inject({
      method: 'GET',
      url: `/api/outbound/orders/${order.id}`,
      headers: authHeader(otherOperator.token),
    });
    expect(otherGet.statusCode).toBe(404);
    expect(JSON.parse(otherGet.payload).error.code).toBe('NOT_FOUND');

    const otherList = await app.inject({
      method: 'GET',
      url: `/api/outbound/orders?facilityId=${facility.id}`,
      headers: authHeader(otherOperator.token),
    });
    expect(otherList.statusCode).toBe(200);
    const otherListBody = JSON.parse(otherList.payload);
    expect(otherListBody.data.some((o: { id: string }) => o.id === order.id)).toBe(false);
  });

  it('rejects wave creation for an order owned by another operator', async () => {
    const owner = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const otherOperator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(owner.token, facility.id, sku.id, 2);

    const createWave = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: {
        ...authHeader(otherOperator.token),
        'idempotency-key': randomUUID(),
      },
      payload: {
        facilityId: facility.id,
        orderIds: [order.id],
      },
    });

    expect(createWave.statusCode).toBe(404);
    expect(JSON.parse(createWave.payload).error.code).toBe('NOT_FOUND');
  });

  it('does not auto-create fallback locations during wave generation', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const facility = await app.prisma.facility.create({
      data: {
        id: randomUUID(),
        name: `No Location Facility ${randomUUID().slice(0, 8)}`,
        code: `OB-NL-${randomUUID().slice(0, 6)}`,
      },
    });

    const sku = await app.prisma.sku.create({
      data: {
        id: randomUUID(),
        code: `OB-NLSKU-${randomUUID().slice(0, 6)}`,
        name: 'No Location SKU',
        unitWeightLb: 1,
        unitVolumeCuFt: 1,
      },
    });

    const order = await createOrder(operator.token, facility.id, sku.id, 1);

    const createWave = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: {
        ...authHeader(operator.token),
        'idempotency-key': randomUUID(),
      },
      payload: {
        facilityId: facility.id,
        orderIds: [order.id],
      },
    });

    expect(createWave.statusCode).toBe(409);
    expect(JSON.parse(createWave.payload).error.code).toBe('CONFLICT');

    const facilityLocations = await app.prisma.location.count({ where: { facilityId: facility.id } });
    expect(facilityLocations).toBe(0);
  });

  it('rejects exception quantityShort above remaining line quantity', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 4);

    const standardLineId = order.lines.find((l: { lineType: string }) => l.lineType === 'STANDARD')?.id as string;

    const response = await app.inject({
      method: 'POST',
      url: `/api/outbound/orders/${order.id}/exceptions`,
      headers: authHeader(operator.token),
      payload: {
        lineId: standardLineId,
        shortageReason: 'STOCKOUT',
        quantityShort: 5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error.code).toBe('VALIDATION_FAILED');
  });

  it('records shortage exceptions and creates a backorder line', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 4);

    const standardLineId = order.lines.find((l: { lineType: string }) => l.lineType === 'STANDARD')?.id as string;

    const exception = await app.inject({
      method: 'POST',
      url: `/api/outbound/orders/${order.id}/exceptions`,
      headers: authHeader(operator.token),
      payload: {
        lineId: standardLineId,
        shortageReason: 'STOCKOUT',
        quantityShort: 2,
        notes: 'Depth exception test',
      },
    });
    expect(exception.statusCode).toBe(201);
    const exceptionBody = JSON.parse(exception.payload);
    expect(exceptionBody.data.line.id).toBe(standardLineId);
    expect(exceptionBody.data.line.quantityShort).toBe(2);
    expect(exceptionBody.data.backorder.lineType).toBe('BACKORDER');
    expect(exceptionBody.data.backorder.sourceLineId).toBe(standardLineId);
  });

  it('returns populated collection payloads for orders and waves', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 3);

    const createWave = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: {
        ...authHeader(operator.token),
        'idempotency-key': randomUUID(),
      },
      payload: {
        facilityId: facility.id,
        orderIds: [order.id],
      },
    });
    expect(createWave.statusCode).toBe(201);
    const waveId = JSON.parse(createWave.payload).data.id as string;

    const listOrders = await app.inject({
      method: 'GET',
      url: `/api/outbound/orders?facilityId=${facility.id}`,
      headers: authHeader(operator.token),
    });
    expect(listOrders.statusCode).toBe(200);
    const listOrdersBody = JSON.parse(listOrders.payload);
    expect(Array.isArray(listOrdersBody.data)).toBe(true);
    expect(listOrdersBody.data.some((o: { id: string }) => o.id === order.id)).toBe(true);

    const listWaves = await app.inject({
      method: 'GET',
      url: `/api/outbound/waves?facilityId=${facility.id}`,
      headers: authHeader(operator.token),
    });
    expect(listWaves.statusCode).toBe(200);
    const listWavesBody = JSON.parse(listWaves.payload);
    expect(Array.isArray(listWavesBody.data)).toBe(true);
    expect(listWavesBody.data.some((w: { id: string }) => w.id === waveId)).toBe(true);
  });

  it('rejects SHORT with no shortage and leaves task + order line unchanged (transactional rollback)', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const { facility, sku } = await seedFacilityAndSku();
    const order = await createOrder(operator.token, facility.id, sku.id, 3);

    const waveCreate = await app.inject({
      method: 'POST',
      url: '/api/outbound/waves',
      headers: { ...authHeader(operator.token), 'idempotency-key': randomUUID() },
      payload: { facilityId: facility.id, orderIds: [order.id] },
    });
    expect(waveCreate.statusCode).toBe(201);
    const waveBody = JSON.parse(waveCreate.payload).data;
    const task = waveBody.pickTasks[0];

    // Move PENDING → IN_PROGRESS legally so SHORT is a valid transition target.
    const start = await app.inject({
      method: 'PATCH',
      url: `/api/outbound/pick-tasks/${task.id}`,
      headers: authHeader(operator.token),
      payload: { status: 'IN_PROGRESS' },
    });
    expect(start.statusCode).toBe(200);

    const lineBefore = await app.prisma.outboundOrderLine.findFirst({
      where: { id: task.orderLineId },
    });
    expect(lineBefore?.quantityShort).toBe(0);
    expect(lineBefore?.shortageReason).toBeNull();

    // SHORT with quantityPicked === task.quantity yields shortage = 0 and must fail
    // BEFORE any write. The task and order line must remain unchanged; no
    // backorder line may be created.
    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/outbound/pick-tasks/${task.id}`,
      headers: authHeader(operator.token),
      payload: { status: 'SHORT', quantityPicked: task.quantity },
    });
    expect(bad.statusCode).toBe(422);
    expect(JSON.parse(bad.payload).error.code).toBe('VALIDATION_FAILED');

    const taskAfter = await app.prisma.pickTask.findFirst({ where: { id: task.id } });
    expect(taskAfter?.status).toBe('IN_PROGRESS');
    expect(taskAfter?.completedAt).toBeNull();
    expect(taskAfter?.quantityPicked).toBe(0);

    const lineAfter = await app.prisma.outboundOrderLine.findFirst({
      where: { id: task.orderLineId },
    });
    expect(lineAfter?.quantityShort).toBe(0);
    expect(lineAfter?.shortageReason).toBeNull();

    const backorders = await app.prisma.outboundOrderLine.findMany({
      where: { orderId: order.id, lineType: 'BACKORDER' },
    });
    expect(backorders.length).toBe(0);
  });
});
