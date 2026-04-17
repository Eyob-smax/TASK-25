import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ---- Facility ----

export async function createFacility(
  prisma: PrismaClient,
  data: { name: string; code: string; address?: string },
) {
  return prisma.facility.create({
    data: { id: randomUUID(), name: data.name, code: data.code, address: data.address ?? null },
  });
}

export async function findFacilityById(prisma: PrismaClient, id: string) {
  return prisma.facility.findFirst({
    where: { id, deletedAt: null },
    include: { zones: { where: { deletedAt: null } }, locations: { where: { deletedAt: null } } },
  });
}

export async function findFacilityByCode(prisma: PrismaClient, code: string) {
  return prisma.facility.findFirst({ where: { code, deletedAt: null } });
}

export async function listFacilities(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return prisma.facility.findMany({
    where: {
      deletedAt: null,
      ...(opts.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: 'asc' },
  });
}

export async function updateFacility(
  prisma: PrismaClient,
  id: string,
  data: { name?: string; address?: string; isActive?: boolean },
) {
  return prisma.facility.update({ where: { id }, data });
}

export async function softDeleteFacility(prisma: PrismaClient, id: string) {
  return prisma.facility.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ---- Zone ----

export async function createZone(
  prisma: PrismaClient,
  data: { facilityId: string; name: string; code: string; description?: string },
) {
  return prisma.zone.create({
    data: {
      id: randomUUID(),
      facilityId: data.facilityId,
      name: data.name,
      code: data.code,
      description: data.description ?? null,
    },
  });
}

export async function findZoneById(prisma: PrismaClient, id: string) {
  return prisma.zone.findFirst({ where: { id, deletedAt: null } });
}

export async function findZoneByFacilityAndCode(
  prisma: PrismaClient,
  facilityId: string,
  code: string,
) {
  return prisma.zone.findFirst({ where: { facilityId, code, deletedAt: null } });
}

export async function listZonesByFacility(prisma: PrismaClient, facilityId: string) {
  return prisma.zone.findMany({
    where: { facilityId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

// ---- Location ----

export async function createLocation(
  prisma: PrismaClient,
  data: {
    facilityId: string;
    zoneId?: string;
    code: string;
    type: string;
    capacityCuFt: number;
    hazardClass: string;
    temperatureBand: string;
    isPickFace: boolean;
  },
) {
  return prisma.location.create({
    data: {
      id: randomUUID(),
      facilityId: data.facilityId,
      zoneId: data.zoneId ?? null,
      code: data.code,
      type: data.type,
      capacityCuFt: data.capacityCuFt,
      hazardClass: data.hazardClass,
      temperatureBand: data.temperatureBand,
      isPickFace: data.isPickFace,
    },
  });
}

export async function findLocationById(prisma: PrismaClient, id: string) {
  return prisma.location.findFirst({
    where: { id, deletedAt: null },
    include: { zone: true, facility: true },
  });
}

export async function findLocationByCode(prisma: PrismaClient, code: string) {
  return prisma.location.findFirst({ where: { code, deletedAt: null } });
}

export async function listLocations(
  prisma: PrismaClient,
  opts: { facilityId?: string; zoneId?: string; includeInactive?: boolean } = {},
) {
  return prisma.location.findMany({
    where: {
      deletedAt: null,
      ...(opts.facilityId ? { facilityId: opts.facilityId } : {}),
      ...(opts.zoneId ? { zoneId: opts.zoneId } : {}),
      ...(opts.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { code: 'asc' },
  });
}

export async function updateLocation(
  prisma: PrismaClient,
  id: string,
  data: {
    type?: string;
    capacityCuFt?: number;
    hazardClass?: string;
    temperatureBand?: string;
    isPickFace?: boolean;
    isActive?: boolean;
  },
) {
  return prisma.location.update({ where: { id }, data });
}

// ---- SKU ----

export async function createSku(
  prisma: PrismaClient,
  data: {
    code: string;
    name: string;
    description?: string;
    abcClass: string;
    unitWeightLb: number;
    unitVolumeCuFt: number;
    hazardClass: string;
    temperatureBand: string;
  },
) {
  return prisma.sku.create({
    data: {
      id: randomUUID(),
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      abcClass: data.abcClass,
      unitWeightLb: data.unitWeightLb,
      unitVolumeCuFt: data.unitVolumeCuFt,
      hazardClass: data.hazardClass,
      temperatureBand: data.temperatureBand,
    },
  });
}

export async function findSkuById(prisma: PrismaClient, id: string) {
  return prisma.sku.findFirst({ where: { id, deletedAt: null } });
}

export async function findSkuByCode(prisma: PrismaClient, code: string) {
  return prisma.sku.findFirst({ where: { code, deletedAt: null } });
}

export async function listSkus(prisma: PrismaClient, opts: { includeInactive?: boolean } = {}) {
  return prisma.sku.findMany({
    where: {
      deletedAt: null,
      ...(opts.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { code: 'asc' },
  });
}

export async function updateSku(
  prisma: PrismaClient,
  id: string,
  data: {
    name?: string;
    description?: string;
    abcClass?: string;
    unitWeightLb?: number;
    unitVolumeCuFt?: number;
    hazardClass?: string;
    temperatureBand?: string;
    isActive?: boolean;
  },
) {
  return prisma.sku.update({ where: { id }, data });
}

// ---- InventoryLot ----

export async function createInventoryLot(
  prisma: PrismaClient,
  data: {
    skuId: string;
    locationId: string;
    lotNumber: string;
    batchNumber?: string;
    expirationDate?: Date;
    onHand: number;
    reserved: number;
    damaged: number;
  },
) {
  return prisma.inventoryLot.create({
    data: {
      id: randomUUID(),
      skuId: data.skuId,
      locationId: data.locationId,
      lotNumber: data.lotNumber,
      batchNumber: data.batchNumber ?? null,
      expirationDate: data.expirationDate ?? null,
      onHand: data.onHand,
      reserved: data.reserved,
      damaged: data.damaged,
    },
    include: { sku: true, location: true },
  });
}

export async function findInventoryLotById(prisma: PrismaClient, id: string) {
  return prisma.inventoryLot.findFirst({
    where: { id, deletedAt: null },
    include: { sku: true, location: true },
  });
}

export async function listInventoryLots(
  prisma: PrismaClient,
  opts: { skuId?: string; locationId?: string } = {},
) {
  return prisma.inventoryLot.findMany({
    where: {
      deletedAt: null,
      ...(opts.skuId ? { skuId: opts.skuId } : {}),
      ...(opts.locationId ? { locationId: opts.locationId } : {}),
    },
    include: { sku: true, location: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateInventoryLotCounts(
  prisma: PrismaClient,
  id: string,
  data: { onHand?: number; reserved?: number; damaged?: number },
) {
  return prisma.inventoryLot.update({ where: { id }, data });
}

// ---- Appointment ----

export async function createAppointment(
  prisma: PrismaClient,
  data: {
    facilityId: string;
    type: string;
    state: string;
    scheduledAt: Date;
    carrierId?: string;
    referenceNumber?: string;
    notes?: string;
    createdBy: string;
  },
) {
  return prisma.appointment.create({
    data: {
      id: randomUUID(),
      facilityId: data.facilityId,
      type: data.type,
      state: data.state,
      scheduledAt: data.scheduledAt,
      carrierId: data.carrierId ?? null,
      referenceNumber: data.referenceNumber ?? null,
      notes: data.notes ?? null,
      createdBy: data.createdBy,
    },
  });
}

export async function findAppointmentById(prisma: PrismaClient, id: string) {
  return prisma.appointment.findUnique({
    where: { id },
    include: {
      operationHistory: { orderBy: { timestamp: 'asc' } },
    },
  });
}

export async function listAppointments(
  prisma: PrismaClient,
  opts: { facilityId?: string; state?: string; type?: string } = {},
) {
  return prisma.appointment.findMany({
    where: {
      ...(opts.facilityId ? { facilityId: opts.facilityId } : {}),
      ...(opts.state ? { state: opts.state } : {}),
      ...(opts.type ? { type: opts.type } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
  });
}

export async function updateAppointmentState(
  prisma: PrismaClient,
  id: string,
  newState: string,
  timestamps: {
    confirmedAt?: Date;
    cancelledAt?: Date;
    expiredAt?: Date;
    scheduledAt?: Date;
  } = {},
) {
  return prisma.appointment.update({
    where: { id },
    data: {
      state: newState,
      ...(timestamps.confirmedAt !== undefined ? { confirmedAt: timestamps.confirmedAt } : {}),
      ...(timestamps.cancelledAt !== undefined ? { cancelledAt: timestamps.cancelledAt } : {}),
      ...(timestamps.expiredAt !== undefined ? { expiredAt: timestamps.expiredAt } : {}),
      ...(timestamps.scheduledAt !== undefined ? { scheduledAt: timestamps.scheduledAt } : {}),
    },
  });
}

export async function createAppointmentHistoryEntry(
  prisma: PrismaClient,
  data: {
    appointmentId: string;
    actor: string;
    priorState: string;
    newState: string;
    reason?: string;
  },
) {
  return prisma.appointmentOperationHistory.create({
    data: {
      id: randomUUID(),
      appointmentId: data.appointmentId,
      actor: data.actor,
      priorState: data.priorState,
      newState: data.newState,
      reason: data.reason ?? null,
    },
  });
}

export async function findExpiredAppointments(prisma: PrismaClient, now: Date) {
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  return prisma.appointment.findMany({
    where: {
      state: 'PENDING',
      createdAt: { lte: twoHoursAgo },
    },
  });
}
