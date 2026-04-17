import type { PrismaClient } from '@prisma/client';
import { AppointmentState } from '../shared/enums.js';
import {
  isValidAppointmentTransition,
} from '../shared/invariants.js';
import { ErrorCode } from '../shared/envelope.js';
import { auditCreate, auditUpdate, auditTransition } from '../audit/audit.js';
import {
  createFacility as repoCreateFacility,
  findFacilityById,
  findFacilityByCode,
  updateFacility as repoUpdateFacility,
  softDeleteFacility as repoSoftDeleteFacility,
  createZone as repoCreateZone,
  findZoneByFacilityAndCode,
  createLocation as repoCreateLocation,
  findLocationById,
  findLocationByCode,
  updateLocation as repoUpdateLocation,
  createSku as repoCreateSku,
  findSkuById,
  findSkuByCode,
  updateSku as repoUpdateSku,
  createInventoryLot as repoCreateInventoryLot,
  findInventoryLotById,
  updateInventoryLotCounts as repoUpdateInventoryLotCounts,
  createAppointment as repoCreateAppointment,
  findAppointmentById,
  updateAppointmentState,
  createAppointmentHistoryEntry,
} from '../repositories/warehouse.repository.js';

export class WarehouseServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WarehouseServiceError';
  }
}

function buildTimestampPatch(
  newState: string,
  now: Date,
  extra?: { scheduledAt?: Date },
): {
  confirmedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
  scheduledAt?: Date;
} {
  switch (newState) {
    case AppointmentState.CONFIRMED:
      return { confirmedAt: now };
    case AppointmentState.RESCHEDULED:
      return extra?.scheduledAt ? { scheduledAt: extra.scheduledAt } : {};
    case AppointmentState.CANCELLED:
      return { cancelledAt: now };
    case AppointmentState.EXPIRED:
      return { expiredAt: now };
    default:
      return {};
  }
}

// ---- Facility ----

export async function createFacility(
  prisma: PrismaClient,
  data: { name: string; code: string; address?: string },
  actorId: string,
) {
  const existing = await findFacilityByCode(prisma, data.code);
  if (existing) {
    throw new WarehouseServiceError(ErrorCode.CONFLICT, `Facility code '${data.code}' already exists`);
  }
  const facility = await repoCreateFacility(prisma, data);
  await auditCreate(prisma, actorId, 'Facility', facility.id, { name: data.name, code: data.code });
  return facility;
}

export async function updateFacility(
  prisma: PrismaClient,
  facilityId: string,
  data: { name?: string; address?: string; isActive?: boolean },
  actorId: string,
) {
  const facility = await findFacilityById(prisma, facilityId);
  if (!facility) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Facility not found');
  }
  const updated = await repoUpdateFacility(prisma, facilityId, data);
  await auditUpdate(prisma, actorId, 'Facility', facilityId, { name: facility.name, isActive: facility.isActive }, data);
  return updated;
}

export async function softDeleteFacility(
  prisma: PrismaClient,
  facilityId: string,
  actorId: string,
) {
  const facility = await findFacilityById(prisma, facilityId);
  if (!facility) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Facility not found');
  }
  await repoSoftDeleteFacility(prisma, facilityId);
  await auditUpdate(prisma, actorId, 'Facility', facilityId, { deletedAt: null }, { deletedAt: new Date().toISOString() });
}

// ---- Zone ----

export async function createZone(
  prisma: PrismaClient,
  facilityId: string,
  data: { name: string; code: string; description?: string },
  actorId: string,
) {
  const facility = await findFacilityById(prisma, facilityId);
  if (!facility) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Facility not found');
  }
  const existing = await findZoneByFacilityAndCode(prisma, facilityId, data.code);
  if (existing) {
    throw new WarehouseServiceError(ErrorCode.CONFLICT, `Zone code '${data.code}' already exists in this facility`);
  }
  const zone = await repoCreateZone(prisma, { facilityId, ...data });
  await auditCreate(prisma, actorId, 'Zone', zone.id, { facilityId, name: data.name, code: data.code });
  return zone;
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
  actorId: string,
) {
  const facility = await findFacilityById(prisma, data.facilityId);
  if (!facility) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Facility not found');
  }
  const existing = await findLocationByCode(prisma, data.code);
  if (existing) {
    throw new WarehouseServiceError(ErrorCode.CONFLICT, `Location code '${data.code}' already exists`);
  }
  const location = await repoCreateLocation(prisma, data);
  await auditCreate(prisma, actorId, 'Location', location.id, { facilityId: data.facilityId, code: data.code });
  return location;
}

export async function updateLocation(
  prisma: PrismaClient,
  locationId: string,
  data: {
    type?: string;
    capacityCuFt?: number;
    hazardClass?: string;
    temperatureBand?: string;
    isPickFace?: boolean;
    isActive?: boolean;
  },
  actorId: string,
) {
  const location = await findLocationById(prisma, locationId);
  if (!location) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Location not found');
  }
  const updated = await repoUpdateLocation(prisma, locationId, data);
  await auditUpdate(prisma, actorId, 'Location', locationId, { type: location.type, isActive: location.isActive }, data);
  return updated;
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
  actorId: string,
) {
  const existing = await findSkuByCode(prisma, data.code);
  if (existing) {
    throw new WarehouseServiceError(ErrorCode.CONFLICT, `SKU code '${data.code}' already exists`);
  }
  const sku = await repoCreateSku(prisma, data);
  await auditCreate(prisma, actorId, 'Sku', sku.id, { code: data.code, name: data.name });
  return sku;
}

export async function updateSku(
  prisma: PrismaClient,
  skuId: string,
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
  actorId: string,
) {
  const sku = await findSkuById(prisma, skuId);
  if (!sku) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'SKU not found');
  }
  const updated = await repoUpdateSku(prisma, skuId, data);
  await auditUpdate(prisma, actorId, 'Sku', skuId, { name: sku.name, isActive: sku.isActive }, data);
  return updated;
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
  actorId: string,
) {
  const sku = await findSkuById(prisma, data.skuId);
  if (!sku) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'SKU not found');
  }
  const location = await findLocationById(prisma, data.locationId);
  if (!location) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Location not found');
  }
  const lot = await repoCreateInventoryLot(prisma, data);
  await auditCreate(prisma, actorId, 'InventoryLot', lot.id, {
    skuId: data.skuId,
    locationId: data.locationId,
    lotNumber: data.lotNumber,
  });
  return lot;
}

export async function updateInventoryLotCounts(
  prisma: PrismaClient,
  lotId: string,
  data: { onHand?: number; reserved?: number; damaged?: number },
  actorId: string,
) {
  const lot = await findInventoryLotById(prisma, lotId);
  if (!lot) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Inventory lot not found');
  }
  const updated = await repoUpdateInventoryLotCounts(prisma, lotId, data);
  await auditUpdate(prisma, actorId, 'InventoryLot', lotId,
    { onHand: lot.onHand, reserved: lot.reserved, damaged: lot.damaged },
    data,
  );
  return updated;
}

// ---- Appointment ----

export async function createAppointment(
  prisma: PrismaClient,
  data: {
    facilityId: string;
    type: string;
    scheduledAt: Date;
    carrierId?: string;
    referenceNumber?: string;
    notes?: string;
  },
  actorId: string,
) {
  const facility = await findFacilityById(prisma, data.facilityId);
  if (!facility) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Facility not found');
  }
  const appointment = await repoCreateAppointment(prisma, {
    ...data,
    state: AppointmentState.PENDING,
    createdBy: actorId,
  });
  // Record the initial creation as first history entry
  await createAppointmentHistoryEntry(prisma, {
    appointmentId: appointment.id,
    actor: actorId,
    priorState: '',
    newState: AppointmentState.PENDING,
    reason: 'Created',
  });
  await auditCreate(prisma, actorId, 'Appointment', appointment.id, {
    facilityId: data.facilityId,
    type: data.type,
    state: AppointmentState.PENDING,
  });
  return appointment;
}

export async function transitionAppointment(
  prisma: PrismaClient,
  appointmentId: string,
  newState: string,
  actor: string,
  reason?: string,
  extra?: { scheduledAt?: Date },
) {
  const appointment = await findAppointmentById(prisma, appointmentId);
  if (!appointment) {
    throw new WarehouseServiceError(ErrorCode.NOT_FOUND, 'Appointment not found');
  }

  if (!isValidAppointmentTransition(appointment.state, newState)) {
    const from = appointment.state;
    throw new WarehouseServiceError(
      ErrorCode.INVALID_TRANSITION,
      `Cannot transition appointment from '${from}' to '${newState}'`,
    );
  }

  // Reschedule (CONFIRMED → RESCHEDULED) requires a new scheduledAt
  const isReschedule =
    appointment.state === AppointmentState.CONFIRMED && newState === AppointmentState.RESCHEDULED;
  if (isReschedule && !extra?.scheduledAt) {
    throw new WarehouseServiceError(
      ErrorCode.VALIDATION_FAILED,
      'Reschedule requires a new scheduledAt date',
    );
  }

  const now = new Date();
  const timestamps = buildTimestampPatch(newState, now, extra);

  await updateAppointmentState(prisma, appointmentId, newState, timestamps);
  await createAppointmentHistoryEntry(prisma, {
    appointmentId,
    actor,
    priorState: appointment.state,
    newState,
    reason,
  });
  await auditTransition(prisma, actor, 'Appointment', appointmentId, appointment.state, newState, { reason });

  return findAppointmentById(prisma, appointmentId);
}
