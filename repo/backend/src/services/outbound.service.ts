import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '../shared/envelope.js';
import { calculateVariancePercent, computePackVerificationStatus } from '../shared/invariants.js';
import { auditCreate, auditUpdate } from '../audit/audit.js';
import {
  createOutboundOrder as repoCreateOrder,
  findOutboundOrderById,
  listOutboundOrders as repoListOrders,
  updateOutboundOrderStatus,
  findOutboundOrderLineById,
  updateOrderLine,
  createBackorderLine,
  findIdempotencyRecord,
  createIdempotencyRecord,
  updateIdempotencyResponseBody,
  replaceExpiredIdempotencyRecord,
  createWave as repoCreateWave,
  findWaveById,
  listWaves as repoListWaves,
  updateWaveStatus,
  findPickTaskById,
  updatePickTask as repoUpdatePickTask,
  listPickTasksByWave,
  createPackVerification as repoCreatePackVerification,
  createHandoffRecord as repoCreateHandoffRecord,
} from '../repositories/outbound.repository.js';
import {
  findFacilityById,
  findSkuById,
  findInventoryLotById,
} from '../repositories/warehouse.repository.js';
import {
  findInventoryLotsForSku,
} from '../repositories/strategy.repository.js';

export class OutboundServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OutboundServiceError';
  }
}

// ---- Order management ----

export async function createOutboundOrder(
  prisma: PrismaClient,
  data: {
    facilityId: string;
    type: string;
    referenceNumber?: string;
    requestedShipDate?: Date;
    lines: Array<{ skuId: string; quantity: number }>;
  },
  actorId: string,
) {
  const facility = await findFacilityById(prisma, data.facilityId);
  if (!facility) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Facility not found');

  for (const line of data.lines) {
    const sku = await findSkuById(prisma, line.skuId);
    if (!sku) throw new OutboundServiceError(ErrorCode.NOT_FOUND, `SKU not found: ${line.skuId}`);
  }

  const order = await repoCreateOrder(prisma, { ...data, createdBy: actorId });
  await auditCreate(prisma, actorId, 'OutboundOrder', order!.id, order);
  return order;
}

export async function getOutboundOrder(prisma: PrismaClient, orderId: string) {
  const order = await findOutboundOrderById(prisma, orderId);
  if (!order) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Order not found');
  return order;
}

export async function listOutboundOrders(
  prisma: PrismaClient,
  opts: { facilityId?: string; status?: string } = {},
) {
  return repoListOrders(prisma, opts);
}

// ---- Wave generation with 24-hour idempotency ----

export async function generateWave(
  prisma: PrismaClient,
  idempotencyKey: string,
  data: { facilityId: string; orderIds: string[] },
  actorId: string,
) {
  const now = new Date();
  const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Check for existing idempotency record and enforce conflict + expiry semantics
  const existing = await findIdempotencyRecord(prisma, idempotencyKey);
  if (existing && existing.expiresAt > now) {
    // Active window: request hash must match to be a valid replay
    if (existing.requestHash !== requestHash) {
      throw new OutboundServiceError(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        'Idempotency key reused with different payload',
      );
    }
    if (existing.responseBody) {
      return { fromCache: true, wave: JSON.parse(existing.responseBody) };
    }
    // Same payload, record exists but response not yet stored (concurrent in-flight)
    throw new OutboundServiceError(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      'Idempotency key already in use (concurrent request)',
    );
  }

  const facility = await findFacilityById(prisma, data.facilityId);
  if (!facility) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Facility not found');

  // Validate orders
  const orders = [];
  for (const orderId of data.orderIds) {
    const order = await findOutboundOrderById(prisma, orderId);
    if (!order) throw new OutboundServiceError(ErrorCode.NOT_FOUND, `Order not found: ${orderId}`);
    if (order.status !== 'DRAFT') {
      throw new OutboundServiceError(ErrorCode.CONFLICT, `Order ${orderId} is not in DRAFT status`);
    }
    orders.push(order);
  }

  // Create or refresh idempotency record (pre-wave, no responseBody yet)
  if (existing && existing.expiresAt <= now) {
    // Expired record: refresh hash, expiry, and clear any stale cached response
    await replaceExpiredIdempotencyRecord(prisma, idempotencyKey, requestHash, expiresAt);
  } else if (!existing) {
    await createIdempotencyRecord(prisma, { key: idempotencyKey, requestHash, expiresAt });
  }

  // Transition orders to PICKING (audit each transition)
  for (const order of orders) {
    await updateOutboundOrderStatus(prisma, order.id, 'PICKING');
    await auditUpdate(
      prisma,
      actorId,
      'OutboundOrder',
      order.id,
      { status: order.status },
      { status: 'PICKING' },
      { reason: 'wave-generation', waveIdempotencyKey: idempotencyKey },
    );
  }

  // Build pick tasks from order lines with FIFO lot selection
  const pickTaskInputs: Array<{
    orderId: string;
    orderLineId: string;
    skuId: string;
    locationId: string;
    quantity: number;
    sequence: number;
    estimatedDistance?: number;
  }> = [];

  let sequence = 1;
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.lineType !== 'STANDARD') continue;
      // Find oldest available inventory lot (FIFO)
      const lots = await findInventoryLotsForSku(prisma, line.skuId);
      const lot = lots.find((l) => l.onHand > 0);
      if (!lot) {
        // No stock available — still create pick task pointing to first available location
        // Use first active location in facility as fallback (shortage will be detected at pick time)
        const locations = await prisma.location.findMany({
          where: { facilityId: data.facilityId, isActive: true, deletedAt: null },
          take: 1,
        });
        if (locations.length > 0) {
          pickTaskInputs.push({
            orderId: order.id,
            orderLineId: line.id,
            skuId: line.skuId,
            locationId: locations[0].id,
            quantity: line.quantity,
            sequence: sequence++,
          });
        }
      } else {
        pickTaskInputs.push({
          orderId: order.id,
          orderLineId: line.id,
          skuId: line.skuId,
          locationId: lot.locationId,
          quantity: line.quantity,
          sequence: sequence++,
        });
      }
    }
  }

  const wave = await repoCreateWave(prisma, {
    facilityId: data.facilityId,
    idempotencyKey,
    createdBy: actorId,
    pickTasks: pickTaskInputs,
  });

  await auditCreate(prisma, actorId, 'Wave', wave!.id, wave);

  // Cache the wave response body for idempotent replays
  await updateIdempotencyResponseBody(prisma, idempotencyKey, JSON.stringify(wave));

  return { fromCache: false, wave };
}

export async function getWave(prisma: PrismaClient, waveId: string) {
  const wave = await findWaveById(prisma, waveId);
  if (!wave) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Wave not found');
  return wave;
}

export async function listWaves(
  prisma: PrismaClient,
  opts: { facilityId?: string; status?: string } = {},
) {
  return repoListWaves(prisma, opts);
}

export async function cancelWave(prisma: PrismaClient, waveId: string, actorId: string) {
  const wave = await findWaveById(prisma, waveId);
  if (!wave) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Wave not found');
  if (wave.status === 'COMPLETED' || wave.status === 'CANCELLED') {
    throw new OutboundServiceError(ErrorCode.INVALID_TRANSITION, `Cannot cancel wave in ${wave.status} status`);
  }
  const before = { status: wave.status };
  await updateWaveStatus(prisma, waveId, 'CANCELLED');
  await auditUpdate(prisma, actorId, 'Wave', waveId, before, { status: 'CANCELLED' });
  return findWaveById(prisma, waveId);
}

// ---- Pick task lifecycle ----

export async function getPickTask(prisma: PrismaClient, taskId: string) {
  const task = await findPickTaskById(prisma, taskId);
  if (!task) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Pick task not found');
  return task;
}

export async function updatePickTask(
  prisma: PrismaClient,
  taskId: string,
  data: { status?: string; quantityPicked?: number; actualDistance?: number },
  actorId: string,
) {
  const task = await findPickTaskById(prisma, taskId);
  if (!task) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Pick task not found');

  const before = { status: task.status, quantityPicked: task.quantityPicked };
  const now = new Date();
  const updateData: Record<string, unknown> = { ...data };

  // Status transitions
  if (data.status) {
    if (data.status === 'IN_PROGRESS' && task.status === 'PENDING') {
      updateData.startedAt = now;
    } else if (
      (data.status === 'COMPLETED' || data.status === 'SHORT' || data.status === 'CANCELLED') &&
      task.status === 'IN_PROGRESS'
    ) {
      updateData.completedAt = now;
    } else if (task.status !== data.status) {
      throw new OutboundServiceError(
        ErrorCode.INVALID_TRANSITION,
        `Cannot transition pick task from ${task.status} to ${data.status}`,
      );
    }
  }

  await repoUpdatePickTask(prisma, taskId, updateData as Parameters<typeof repoUpdatePickTask>[2]);

  // Post-transition effects
  const pickedQty = data.quantityPicked ?? task.quantityPicked;
  if (data.status === 'COMPLETED') {
    await updateOrderLine(prisma, task.orderLineId, { quantityFulfilled: pickedQty });
  }

  if (data.status === 'SHORT') {
    const shortage = task.quantity - pickedQty;
    if (shortage > 0) {
      await updateOrderLine(prisma, task.orderLineId, {
        quantityShort: shortage,
        shortageReason: 'STOCKOUT',
      });
      await createBackorderLine(prisma, {
        orderId: task.orderId,
        skuId: task.skuId,
        quantity: shortage,
        sourceLineId: task.orderLineId,
        shortageReason: 'STOCKOUT',
      });
    }
  }

  // Check if entire wave is complete
  const allTasks = await listPickTasksByWave(prisma, task.waveId);
  const terminal = ['COMPLETED', 'SHORT', 'CANCELLED'];
  const allDone = allTasks.every((t) => terminal.includes(t.id === taskId ? (data.status ?? t.status) : t.status));
  if (allDone) {
    await updateWaveStatus(prisma, task.waveId, 'COMPLETED');
  }

  const after = await findPickTaskById(prisma, taskId);
  await auditUpdate(prisma, actorId, 'PickTask', taskId, before, { status: after?.status, quantityPicked: after?.quantityPicked });
  return after;
}

// ---- Pack verification ----

export async function verifyPack(
  prisma: PrismaClient,
  orderId: string,
  data: { actualWeightLb: number; actualVolumeCuFt: number },
  actorId: string,
) {
  const order = await findOutboundOrderById(prisma, orderId);
  if (!order) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Order not found');

  // Compute expected totals from order lines
  let expectedWeightLb = 0;
  let expectedVolumeCuFt = 0;
  for (const line of order.lines) {
    expectedWeightLb += line.quantity * line.sku.unitWeightLb;
    expectedVolumeCuFt += line.quantity * line.sku.unitVolumeCuFt;
  }

  const weightVariancePct = calculateVariancePercent(data.actualWeightLb, expectedWeightLb);
  const volumeVariancePct = calculateVariancePercent(data.actualVolumeCuFt, expectedVolumeCuFt);
  const status = computePackVerificationStatus(weightVariancePct, volumeVariancePct);

  let rejectionReason: string | undefined;
  if (status !== 'PASSED') {
    const parts: string[] = [];
    if (status === 'FAILED_WEIGHT' || status === 'FAILED_BOTH') {
      parts.push(`Weight variance ${weightVariancePct > 0 ? '+' : ''}${weightVariancePct.toFixed(1)}% exceeds ±5% tolerance`);
    }
    if (status === 'FAILED_VOLUME' || status === 'FAILED_BOTH') {
      parts.push(`Volume variance ${volumeVariancePct > 0 ? '+' : ''}${volumeVariancePct.toFixed(1)}% exceeds ±5% tolerance`);
    }
    rejectionReason = parts.join('; ');
  }

  const verification = await repoCreatePackVerification(prisma, {
    orderId,
    expectedWeightLb,
    actualWeightLb: data.actualWeightLb,
    expectedVolumeCuFt,
    actualVolumeCuFt: data.actualVolumeCuFt,
    weightVariancePct,
    volumeVariancePct,
    status,
    verifiedBy: actorId,
    rejectionReason,
  });

  await auditCreate(prisma, actorId, 'PackVerification', verification.id, verification);

  if (status !== 'PASSED') {
    throw new OutboundServiceError(ErrorCode.VARIANCE_EXCEEDED, rejectionReason!);
  }

  await updateOutboundOrderStatus(prisma, orderId, 'PACKED');
  return verification;
}

// ---- Exception reporting ----

export async function reportException(
  prisma: PrismaClient,
  orderId: string,
  data: { lineId: string; shortageReason: string; quantityShort: number; notes?: string },
  actorId: string,
) {
  const order = await findOutboundOrderById(prisma, orderId);
  if (!order) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Order not found');

  const line = await findOutboundOrderLineById(prisma, data.lineId);
  if (!line || line.order.id !== orderId) {
    throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Order line not found on this order');
  }

  const before = { quantityShort: line.quantityShort, shortageReason: line.shortageReason };
  await updateOrderLine(prisma, data.lineId, {
    quantityShort: data.quantityShort,
    shortageReason: data.shortageReason,
  });

  const backorder = await createBackorderLine(prisma, {
    orderId,
    skuId: line.skuId,
    quantity: data.quantityShort,
    sourceLineId: data.lineId,
    shortageReason: data.shortageReason,
  });

  await auditUpdate(prisma, actorId, 'OutboundOrderLine', data.lineId, before, {
    quantityShort: data.quantityShort,
    shortageReason: data.shortageReason,
  });
  await auditCreate(prisma, actorId, 'OutboundOrderLine', backorder.id, backorder);

  return { line: await findOutboundOrderLineById(prisma, data.lineId), backorder };
}

// ---- Handoff recording ----

export async function recordHandoff(
  prisma: PrismaClient,
  orderId: string,
  data: { carrier: string; trackingNumber?: string; notes?: string },
  actorId: string,
) {
  const order = await findOutboundOrderById(prisma, orderId);
  if (!order) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Order not found');

  const hasShortage = order.lines.some((l) => l.quantityShort > 0);
  if (hasShortage && !order.approvedForPartialShip) {
    throw new OutboundServiceError(
      ErrorCode.APPROVAL_REQUIRED,
      'Order has shortages — partial shipment requires manager approval',
    );
  }

  const handoff = await repoCreateHandoffRecord(prisma, {
    orderId,
    carrier: data.carrier,
    trackingNumber: data.trackingNumber,
    handoffBy: actorId,
    notes: data.notes,
  });

  const finalStatus = hasShortage ? 'PARTIAL_SHIPPED' : 'SHIPPED';
  const before = { status: order.status };
  await updateOutboundOrderStatus(prisma, orderId, finalStatus);

  await auditCreate(prisma, actorId, 'HandoffRecord', handoff.id, handoff);
  await auditUpdate(prisma, actorId, 'OutboundOrder', orderId, before, { status: finalStatus });

  return handoff;
}

// ---- Approve partial shipment ----

export async function approvePartialShipment(prisma: PrismaClient, orderId: string, actorId: string) {
  const order = await findOutboundOrderById(prisma, orderId);
  if (!order) throw new OutboundServiceError(ErrorCode.NOT_FOUND, 'Order not found');

  const hasShortage = order.lines.some((l) => l.quantityShort > 0);
  if (!hasShortage) {
    throw new OutboundServiceError(ErrorCode.CONFLICT, 'Order has no shortages requiring approval');
  }
  if (order.approvedForPartialShip) {
    throw new OutboundServiceError(ErrorCode.CONFLICT, 'Order already approved for partial shipment');
  }

  const before = { approvedForPartialShip: false };
  await updateOutboundOrderStatus(prisma, orderId, order.status, {
    approvedForPartialShip: true,
    approvedBy: actorId,
    approvedAt: new Date(),
  });

  await auditUpdate(prisma, actorId, 'OutboundOrder', orderId, before, { approvedForPartialShip: true });
  return findOutboundOrderById(prisma, orderId);
}
