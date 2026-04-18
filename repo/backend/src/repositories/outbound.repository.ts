import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ---- OutboundOrder ----

export async function createOutboundOrder(
  prisma: PrismaClient,
  data: {
    facilityId: string;
    type: string;
    referenceNumber?: string;
    requestedShipDate?: Date;
    createdBy: string;
    lines: Array<{ skuId: string; quantity: number }>;
  },
) {
  const orderId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const order = await tx.outboundOrder.create({
      data: {
        id: orderId,
        facilityId: data.facilityId,
        type: data.type,
        status: 'DRAFT',
        referenceNumber: data.referenceNumber ?? null,
        requestedShipDate: data.requestedShipDate ?? null,
        createdBy: data.createdBy,
      },
    });
    await tx.outboundOrderLine.createMany({
      data: data.lines.map((line) => ({
        id: randomUUID(),
        orderId,
        skuId: line.skuId,
        quantity: line.quantity,
        quantityFulfilled: 0,
        quantityShort: 0,
        lineType: 'STANDARD',
      })),
    });
    return tx.outboundOrder.findFirst({
      where: { id: orderId },
      include: { lines: { include: { sku: true } } },
    });
  });
}

export async function findOutboundOrderById(prisma: PrismaClient, id: string) {
  return prisma.outboundOrder.findFirst({
    where: { id, deletedAt: null },
    include: {
      lines: { include: { sku: true } },
      packVerifications: { orderBy: { verifiedAt: 'desc' } },
      handoffRecords: { orderBy: { handoffAt: 'desc' } },
      pickTasks: { include: { sku: true, location: true }, orderBy: { sequence: 'asc' } },
    },
  });
}

export async function findOutboundOrderByIdScoped(
  prisma: PrismaClient,
  id: string,
  opts: { createdBy?: string } = {},
) {
  return prisma.outboundOrder.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
    },
    include: {
      lines: { include: { sku: true } },
      packVerifications: { orderBy: { verifiedAt: 'desc' } },
      handoffRecords: { orderBy: { handoffAt: 'desc' } },
      pickTasks: { include: { sku: true, location: true }, orderBy: { sequence: 'asc' } },
    },
  });
}

export async function listOutboundOrders(
  prisma: PrismaClient,
  opts: { facilityId?: string; status?: string; createdBy?: string } = {},
) {
  return prisma.outboundOrder.findMany({
    where: {
      deletedAt: null,
      ...(opts.facilityId ? { facilityId: opts.facilityId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
    },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateOutboundOrderStatus(
  prisma: PrismaClient,
  id: string,
  status: string,
  extra?: {
    approvedForPartialShip?: boolean;
    approvedBy?: string;
    approvedAt?: Date;
  },
) {
  return prisma.outboundOrder.update({
    where: { id },
    data: {
      status,
      ...(extra?.approvedForPartialShip !== undefined
        ? { approvedForPartialShip: extra.approvedForPartialShip }
        : {}),
      ...(extra?.approvedBy ? { approvedBy: extra.approvedBy } : {}),
      ...(extra?.approvedAt ? { approvedAt: extra.approvedAt } : {}),
    },
  });
}

export async function findOutboundOrderLineById(prisma: PrismaClient, id: string) {
  return prisma.outboundOrderLine.findFirst({
    where: { id },
    include: { sku: true, order: true },
  });
}

export async function updateOrderLine(
  prisma: PrismaClient,
  id: string,
  data: { quantityFulfilled?: number; quantityShort?: number; shortageReason?: string },
) {
  return prisma.outboundOrderLine.update({ where: { id }, data });
}

export async function createBackorderLine(
  prisma: PrismaClient,
  data: {
    orderId: string;
    skuId: string;
    quantity: number;
    sourceLineId: string;
    shortageReason: string;
  },
) {
  return prisma.outboundOrderLine.create({
    data: {
      id: randomUUID(),
      orderId: data.orderId,
      skuId: data.skuId,
      quantity: data.quantity,
      quantityFulfilled: 0,
      quantityShort: 0,
      lineType: 'BACKORDER',
      sourceLineId: data.sourceLineId,
      shortageReason: data.shortageReason,
    },
  });
}

// ---- Idempotency ----

export async function findIdempotencyRecord(prisma: PrismaClient, key: string) {
  return prisma.idempotencyRecord.findFirst({ where: { key } });
}

export async function createIdempotencyRecord(
  prisma: PrismaClient,
  data: { key: string; requestHash: string; expiresAt: Date },
) {
  return prisma.idempotencyRecord.create({
    data: { id: randomUUID(), key: data.key, requestHash: data.requestHash, expiresAt: data.expiresAt },
  });
}

export async function updateIdempotencyResponseBody(
  prisma: PrismaClient,
  key: string,
  responseBody: string,
) {
  return prisma.idempotencyRecord.update({ where: { key }, data: { responseBody } });
}

export async function replaceExpiredIdempotencyRecord(
  prisma: PrismaClient,
  key: string,
  requestHash: string,
  expiresAt: Date,
) {
  return prisma.idempotencyRecord.update({
    where: { key },
    data: {
      requestHash,
      expiresAt,
      responseBody: null,
    },
  });
}

// ---- Wave ----

export async function createWave(
  prisma: PrismaClient,
  data: {
    facilityId: string;
    idempotencyKey: string;
    createdBy: string;
    pickTasks: Array<{
      orderId: string;
      orderLineId: string;
      skuId: string;
      locationId: string;
      quantity: number;
      sequence: number;
      estimatedDistance?: number;
    }>;
  },
) {
  const waveId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const wave = await tx.wave.create({
      data: {
        id: waveId,
        facilityId: data.facilityId,
        idempotencyKey: data.idempotencyKey,
        status: 'CREATED',
        createdBy: data.createdBy,
      },
    });
    await tx.pickTask.createMany({
      data: data.pickTasks.map((t) => ({
        id: randomUUID(),
        waveId,
        orderId: t.orderId,
        orderLineId: t.orderLineId,
        skuId: t.skuId,
        locationId: t.locationId,
        quantity: t.quantity,
        quantityPicked: 0,
        status: 'PENDING',
        sequence: t.sequence,
        estimatedDistance: t.estimatedDistance ?? null,
      })),
    });
    return tx.wave.findFirst({
      where: { id: waveId },
      include: {
        pickTasks: {
          include: { sku: true, location: true, orderLine: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });
  });
}

export async function findWaveById(prisma: PrismaClient, id: string) {
  return prisma.wave.findFirst({
    where: { id },
    include: {
      pickTasks: {
        include: { sku: true, location: true, orderLine: true },
        orderBy: { sequence: 'asc' },
      },
    },
  });
}

export async function findWaveByIdScoped(
  prisma: PrismaClient,
  id: string,
  opts: { createdBy?: string } = {},
) {
  return prisma.wave.findFirst({
    where: {
      id,
      ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
    },
    include: {
      pickTasks: {
        include: { sku: true, location: true, orderLine: true },
        orderBy: { sequence: 'asc' },
      },
    },
  });
}

export async function listWaves(
  prisma: PrismaClient,
  opts: { facilityId?: string; status?: string; createdBy?: string } = {},
) {
  return prisma.wave.findMany({
    where: {
      ...(opts.facilityId ? { facilityId: opts.facilityId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
    },
    include: { _count: { select: { pickTasks: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateWaveStatus(prisma: PrismaClient, id: string, status: string) {
  return prisma.wave.update({ where: { id }, data: { status } });
}

// ---- PickTask ----

export async function findPickTaskById(prisma: PrismaClient, id: string) {
  return prisma.pickTask.findFirst({
    where: { id },
    include: {
      wave: true,
      order: { select: { id: true, createdBy: true } },
      orderLine: true,
      sku: true,
      location: true,
    },
  });
}

export async function updatePickTask(
  prisma: PrismaClient,
  id: string,
  data: {
    status?: string;
    quantityPicked?: number;
    actualDistance?: number;
    startedAt?: Date;
    completedAt?: Date;
    assignedTo?: string;
  },
) {
  return prisma.pickTask.update({ where: { id }, data });
}

export async function listPickTasksByWave(prisma: PrismaClient, waveId: string) {
  return prisma.pickTask.findMany({
    where: { waveId },
    include: { sku: true, location: true },
    orderBy: { sequence: 'asc' },
  });
}

// ---- PackVerification ----

export async function createPackVerification(
  prisma: PrismaClient,
  data: {
    orderId: string;
    expectedWeightLb: number;
    actualWeightLb: number;
    expectedVolumeCuFt: number;
    actualVolumeCuFt: number;
    weightVariancePct: number;
    volumeVariancePct: number;
    status: string;
    verifiedBy: string;
    rejectionReason?: string;
  },
) {
  return prisma.packVerification.create({
    data: {
      id: randomUUID(),
      orderId: data.orderId,
      expectedWeightLb: data.expectedWeightLb,
      actualWeightLb: data.actualWeightLb,
      expectedVolumeCuFt: data.expectedVolumeCuFt,
      actualVolumeCuFt: data.actualVolumeCuFt,
      weightVariancePct: data.weightVariancePct,
      volumeVariancePct: data.volumeVariancePct,
      status: data.status,
      verifiedBy: data.verifiedBy,
      rejectionReason: data.rejectionReason ?? null,
    },
  });
}

export async function findPackVerificationsByOrder(prisma: PrismaClient, orderId: string) {
  return prisma.packVerification.findMany({
    where: { orderId },
    orderBy: { verifiedAt: 'desc' },
  });
}

// ---- HandoffRecord ----

export async function createHandoffRecord(
  prisma: PrismaClient,
  data: { orderId: string; carrier: string; trackingNumber?: string; handoffBy: string; notes?: string },
) {
  return prisma.handoffRecord.create({
    data: {
      id: randomUUID(),
      orderId: data.orderId,
      carrier: data.carrier,
      trackingNumber: data.trackingNumber ?? null,
      handoffBy: data.handoffBy,
      notes: data.notes ?? null,
    },
  });
}

export async function findHandoffRecordsByOrder(prisma: PrismaClient, orderId: string) {
  return prisma.handoffRecord.findMany({ where: { orderId }, orderBy: { handoffAt: 'desc' } });
}

// ---- Simulation query ----

export async function findCompletedPickTasksInWindow(
  prisma: PrismaClient,
  facilityId: string,
  since: Date,
) {
  return prisma.pickTask.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: since },
      wave: { facilityId },
    },
    include: { sku: true, location: true, orderLine: true },
    orderBy: { sequence: 'asc' },
  });
}
