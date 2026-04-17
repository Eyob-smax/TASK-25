import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Warehouse depth — role checks and appointment transitions', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  async function createFacility(token: string, codePrefix = 'FAC-DEPTH') {
    const create = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: authHeader(token),
      payload: {
        name: `Depth Facility ${randomUUID().slice(0, 8)}`,
        code: `${codePrefix}-${randomUUID().slice(0, 6)}`,
      },
    });
    expect(create.statusCode).toBe(201);
    return JSON.parse(create.payload).data.id as string;
  }

  async function createZone(token: string, facilityId: string, codePrefix = 'ZONE') {
    const create = await app.inject({
      method: 'POST',
      url: `/api/warehouse/facilities/${facilityId}/zones`,
      headers: authHeader(token),
      payload: {
        name: `Depth Zone ${randomUUID().slice(0, 6)}`,
        code: `${codePrefix}-${randomUUID().slice(0, 6)}`,
        description: 'Depth zone',
      },
    });
    expect(create.statusCode).toBe(201);
    return JSON.parse(create.payload).data.id as string;
  }

  async function createLocation(token: string, facilityId: string, zoneId?: string) {
    const create = await app.inject({
      method: 'POST',
      url: '/api/warehouse/locations',
      headers: authHeader(token),
      payload: {
        facilityId,
        zoneId,
        code: `LOC-${randomUUID().slice(0, 6)}`,
        type: 'RACK',
        capacityCuFt: 240,
        hazardClass: 'NONE',
        temperatureBand: 'AMBIENT',
        isPickFace: false,
      },
    });
    expect(create.statusCode).toBe(201);
    return JSON.parse(create.payload).data.id as string;
  }

  async function createSku(token: string) {
    const create = await app.inject({
      method: 'POST',
      url: '/api/warehouse/skus',
      headers: authHeader(token),
      payload: {
        code: `SKU-${randomUUID().slice(0, 6)}`,
        name: `Depth SKU ${randomUUID().slice(0, 6)}`,
        abcClass: 'B',
        unitWeightLb: 2.5,
        unitVolumeCuFt: 1.2,
      },
    });
    expect(create.statusCode).toBe(201);
    return JSON.parse(create.payload).data.id as string;
  }

  async function createInventoryLot(token: string, skuId: string, locationId: string) {
    const create = await app.inject({
      method: 'POST',
      url: '/api/warehouse/inventory-lots',
      headers: authHeader(token),
      payload: {
        skuId,
        locationId,
        lotNumber: `LOT-${randomUUID().slice(0, 6)}`,
        onHand: 15,
        reserved: 1,
        damaged: 0,
      },
    });
    expect(create.statusCode).toBe(201);
    return JSON.parse(create.payload).data.id as string;
  }

  it('operator gets 403 for facility create while manager succeeds with 201', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);

    const operatorAttempt = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: authHeader(operator.token),
      payload: {
        name: `Depth Facility ${randomUUID().slice(0, 8)}`,
        code: `FAC-OP-${randomUUID().slice(0, 6)}`,
      },
    });
    expect(operatorAttempt.statusCode).toBe(403);
    expect(JSON.parse(operatorAttempt.payload).error.code).toBe('FORBIDDEN');

    const managerAttempt = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: authHeader(manager.token),
      payload: {
        name: `Depth Facility ${randomUUID().slice(0, 8)}`,
        code: `FAC-MGR-${randomUUID().slice(0, 6)}`,
      },
    });
    expect(managerAttempt.statusCode).toBe(201);
    const body = JSON.parse(managerAttempt.payload);
    expect(body.success).toBe(true);
    expect(typeof body.data.id).toBe('string');
  });

  it('illegal appointment transition returns 409 INVALID_TRANSITION', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);

    const facilityId = await createFacility(manager.token, 'FAC-APT');

    const createAppointment = await app.inject({
      method: 'POST',
      url: '/api/warehouse/appointments',
      headers: authHeader(manager.token),
      payload: {
        facilityId,
        type: 'INBOUND',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(createAppointment.statusCode).toBe(201);
    const appointmentId = JSON.parse(createAppointment.payload).data.id as string;

    // PENDING -> RESCHEDULED is illegal; appointment must be CONFIRMED first.
    const illegalTransition = await app.inject({
      method: 'POST',
      url: `/api/warehouse/appointments/${appointmentId}/reschedule`,
      headers: authHeader(manager.token),
      payload: {
        reason: 'Skipping required states',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    });

    expect(illegalTransition.statusCode).toBe(409);
    const illegalBody = JSON.parse(illegalTransition.payload);
    expect(illegalBody.error.code).toBe('INVALID_TRANSITION');
  });

  it('covers facility detail, patch, zones, and delete endpoints', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const facilityId = await createFacility(manager.token, 'FAC-ZONE');

    const getFacility = await app.inject({
      method: 'GET',
      url: `/api/warehouse/facilities/${facilityId}`,
      headers: authHeader(manager.token),
    });
    expect(getFacility.statusCode).toBe(200);
    const getFacilityBody = JSON.parse(getFacility.payload);
    expect(getFacilityBody.data.id).toBe(facilityId);

    const patchFacility = await app.inject({
      method: 'PATCH',
      url: `/api/warehouse/facilities/${facilityId}`,
      headers: authHeader(manager.token),
      payload: {
        name: 'Depth Facility Updated',
        address: '123 Depth Street',
        isActive: false,
      },
    });
    expect(patchFacility.statusCode).toBe(200);
    const patchFacilityBody = JSON.parse(patchFacility.payload);
    expect(patchFacilityBody.data.name).toBe('Depth Facility Updated');
    expect(patchFacilityBody.data.isActive).toBe(false);

    const zoneId = await createZone(manager.token, facilityId, 'ZONE-DEPTH');

    const listZones = await app.inject({
      method: 'GET',
      url: `/api/warehouse/facilities/${facilityId}/zones`,
      headers: authHeader(manager.token),
    });
    expect(listZones.statusCode).toBe(200);
    const listZonesBody = JSON.parse(listZones.payload);
    expect(Array.isArray(listZonesBody.data)).toBe(true);
    expect(listZonesBody.data.some((z: { id: string }) => z.id === zoneId)).toBe(true);

    const getZone = await app.inject({
      method: 'GET',
      url: `/api/warehouse/facilities/${facilityId}/zones/${zoneId}`,
      headers: authHeader(manager.token),
    });
    expect(getZone.statusCode).toBe(200);
    const getZoneBody = JSON.parse(getZone.payload);
    expect(getZoneBody.data.id).toBe(zoneId);
    expect(getZoneBody.data.facilityId).toBe(facilityId);

    const deleteFacility = await app.inject({
      method: 'DELETE',
      url: `/api/warehouse/facilities/${facilityId}`,
      headers: authHeader(manager.token),
    });
    expect(deleteFacility.statusCode).toBe(200);
    expect(JSON.parse(deleteFacility.payload).data.message).toBe('Facility deleted');

    const getDeleted = await app.inject({
      method: 'GET',
      url: `/api/warehouse/facilities/${facilityId}`,
      headers: authHeader(manager.token),
    });
    expect(getDeleted.statusCode).toBe(404);
    expect(JSON.parse(getDeleted.payload).error.code).toBe('NOT_FOUND');
  });

  it('covers location and sku detail plus patch endpoints', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const facilityId = await createFacility(manager.token, 'FAC-LOC');
    const zoneId = await createZone(manager.token, facilityId, 'ZONE-LOC');

    const locationId = await createLocation(manager.token, facilityId, zoneId);

    const getLocation = await app.inject({
      method: 'GET',
      url: `/api/warehouse/locations/${locationId}`,
      headers: authHeader(manager.token),
    });
    expect(getLocation.statusCode).toBe(200);
    const getLocationBody = JSON.parse(getLocation.payload);
    expect(getLocationBody.data.id).toBe(locationId);
    expect(getLocationBody.data.facilityId).toBe(facilityId);

    const patchLocation = await app.inject({
      method: 'PATCH',
      url: `/api/warehouse/locations/${locationId}`,
      headers: authHeader(manager.token),
      payload: {
        type: 'PICK_FACE',
        capacityCuFt: 300,
        isPickFace: true,
        isActive: false,
      },
    });
    expect(patchLocation.statusCode).toBe(200);
    const patchLocationBody = JSON.parse(patchLocation.payload);
    expect(patchLocationBody.data.type).toBe('PICK_FACE');
    expect(patchLocationBody.data.capacityCuFt).toBe(300);
    expect(patchLocationBody.data.isActive).toBe(false);

    const skuId = await createSku(manager.token);

    const getSku = await app.inject({
      method: 'GET',
      url: `/api/warehouse/skus/${skuId}`,
      headers: authHeader(manager.token),
    });
    expect(getSku.statusCode).toBe(200);
    const getSkuBody = JSON.parse(getSku.payload);
    expect(getSkuBody.data.id).toBe(skuId);

    const patchSku = await app.inject({
      method: 'PATCH',
      url: `/api/warehouse/skus/${skuId}`,
      headers: authHeader(manager.token),
      payload: {
        name: 'Depth SKU Updated',
        abcClass: 'A',
        unitWeightLb: 3.1,
        isActive: false,
      },
    });
    expect(patchSku.statusCode).toBe(200);
    const patchSkuBody = JSON.parse(patchSku.payload);
    expect(patchSkuBody.data.name).toBe('Depth SKU Updated');
    expect(patchSkuBody.data.abcClass).toBe('A');
    expect(patchSkuBody.data.isActive).toBe(false);
  });

  it('covers inventory lot detail and patch endpoints', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const facilityId = await createFacility(manager.token, 'FAC-LOT');
    const zoneId = await createZone(manager.token, facilityId, 'ZONE-LOT');
    const locationId = await createLocation(manager.token, facilityId, zoneId);
    const skuId = await createSku(manager.token);

    const lotId = await createInventoryLot(manager.token, skuId, locationId);

    const getLot = await app.inject({
      method: 'GET',
      url: `/api/warehouse/inventory-lots/${lotId}`,
      headers: authHeader(manager.token),
    });
    expect(getLot.statusCode).toBe(200);
    const getLotBody = JSON.parse(getLot.payload);
    expect(getLotBody.data.id).toBe(lotId);
    expect(getLotBody.data.skuId).toBe(skuId);

    const patchLot = await app.inject({
      method: 'PATCH',
      url: `/api/warehouse/inventory-lots/${lotId}`,
      headers: authHeader(manager.token),
      payload: {
        onHand: 22,
        reserved: 3,
        damaged: 1,
      },
    });
    expect(patchLot.statusCode).toBe(200);
    const patchLotBody = JSON.parse(patchLot.payload);
    expect(patchLotBody.data.onHand).toBe(22);
    expect(patchLotBody.data.reserved).toBe(3);
    expect(patchLotBody.data.damaged).toBe(1);
  });

  it('covers appointment detail and confirm/cancel transitions', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const facilityId = await createFacility(manager.token, 'FAC-APPT');

    const createConfirmTarget = await app.inject({
      method: 'POST',
      url: '/api/warehouse/appointments',
      headers: authHeader(manager.token),
      payload: {
        facilityId,
        type: 'INBOUND',
        scheduledAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      },
    });
    expect(createConfirmTarget.statusCode).toBe(201);
    const confirmTargetId = JSON.parse(createConfirmTarget.payload).data.id as string;

    const getAppointment = await app.inject({
      method: 'GET',
      url: `/api/warehouse/appointments/${confirmTargetId}`,
      headers: authHeader(manager.token),
    });
    expect(getAppointment.statusCode).toBe(200);
    expect(JSON.parse(getAppointment.payload).data.id).toBe(confirmTargetId);

    const confirmAppointment = await app.inject({
      method: 'POST',
      url: `/api/warehouse/appointments/${confirmTargetId}/confirm`,
      headers: authHeader(manager.token),
      payload: { reason: 'Dock assigned' },
    });
    expect(confirmAppointment.statusCode).toBe(200);
    const confirmBody = JSON.parse(confirmAppointment.payload);
    expect(confirmBody.data.state).toBe('CONFIRMED');

    const createCancelTarget = await app.inject({
      method: 'POST',
      url: '/api/warehouse/appointments',
      headers: authHeader(manager.token),
      payload: {
        facilityId,
        type: 'OUTBOUND',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(createCancelTarget.statusCode).toBe(201);
    const cancelTargetId = JSON.parse(createCancelTarget.payload).data.id as string;

    const cancelAppointment = await app.inject({
      method: 'POST',
      url: `/api/warehouse/appointments/${cancelTargetId}/cancel`,
      headers: authHeader(manager.token),
      payload: { reason: 'Carrier no-show' },
    });
    expect(cancelAppointment.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelAppointment.payload);
    expect(cancelBody.data.state).toBe('CANCELLED');

    const getCancelled = await app.inject({
      method: 'GET',
      url: `/api/warehouse/appointments/${cancelTargetId}`,
      headers: authHeader(manager.token),
    });
    expect(getCancelled.statusCode).toBe(200);
    expect(JSON.parse(getCancelled.payload).data.state).toBe('CANCELLED');
  });

  it('returns populated collection payloads for facilities, locations, skus, lots, and appointments', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);
    const facilityId = await createFacility(manager.token, 'FAC-LIST');
    const zoneId = await createZone(manager.token, facilityId, 'ZONE-LIST');
    const locationId = await createLocation(manager.token, facilityId, zoneId);
    const skuId = await createSku(manager.token);
    const lotId = await createInventoryLot(manager.token, skuId, locationId);

    const createAppointment = await app.inject({
      method: 'POST',
      url: '/api/warehouse/appointments',
      headers: authHeader(manager.token),
      payload: {
        facilityId,
        type: 'INBOUND',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(createAppointment.statusCode).toBe(201);
    const appointmentId = JSON.parse(createAppointment.payload).data.id as string;

    const facilities = await app.inject({
      method: 'GET',
      url: '/api/warehouse/facilities?includeInactive=true',
      headers: authHeader(manager.token),
    });
    expect(facilities.statusCode).toBe(200);
    const facilitiesBody = JSON.parse(facilities.payload);
    expect(Array.isArray(facilitiesBody.data)).toBe(true);
    expect(facilitiesBody.data.some((f: { id: string }) => f.id === facilityId)).toBe(true);

    const locations = await app.inject({
      method: 'GET',
      url: `/api/warehouse/locations?facilityId=${facilityId}`,
      headers: authHeader(manager.token),
    });
    expect(locations.statusCode).toBe(200);
    const locationsBody = JSON.parse(locations.payload);
    expect(Array.isArray(locationsBody.data)).toBe(true);
    expect(locationsBody.data.some((l: { id: string }) => l.id === locationId)).toBe(true);

    const skus = await app.inject({
      method: 'GET',
      url: '/api/warehouse/skus?includeInactive=true',
      headers: authHeader(manager.token),
    });
    expect(skus.statusCode).toBe(200);
    const skusBody = JSON.parse(skus.payload);
    expect(Array.isArray(skusBody.data)).toBe(true);
    expect(skusBody.data.some((s: { id: string }) => s.id === skuId)).toBe(true);

    const lots = await app.inject({
      method: 'GET',
      url: `/api/warehouse/inventory-lots?skuId=${skuId}`,
      headers: authHeader(manager.token),
    });
    expect(lots.statusCode).toBe(200);
    const lotsBody = JSON.parse(lots.payload);
    expect(Array.isArray(lotsBody.data)).toBe(true);
    expect(lotsBody.data.some((l: { id: string }) => l.id === lotId)).toBe(true);

    const appointments = await app.inject({
      method: 'GET',
      url: `/api/warehouse/appointments?facilityId=${facilityId}`,
      headers: authHeader(manager.token),
    });
    expect(appointments.statusCode).toBe(200);
    const appointmentsBody = JSON.parse(appointments.payload);
    expect(Array.isArray(appointmentsBody.data)).toBe(true);
    expect(appointmentsBody.data.some((a: { id: string }) => a.id === appointmentId)).toBe(true);
  });
});
