import type { FastifyPluginAsync } from 'fastify';
import { Role, AppointmentState } from '../shared/enums.js';
import { tagRequestLogDomain } from '../logging/logger.js';
import { successResponse, errorResponse, ErrorCode, ErrorHttpStatus } from '../shared/envelope.js';
import {
  createFacilityBodySchema,
  updateFacilityBodySchema,
  createZoneBodySchema,
  createLocationBodySchema,
  updateLocationBodySchema,
  createSkuBodySchema,
  updateSkuBodySchema,
  createInventoryLotBodySchema,
  updateInventoryLotBodySchema,
  createAppointmentBodySchema,
  appointmentTransitionBodySchema,
  listFacilitiesQuerySchema,
  listLocationsQuerySchema,
  listSkusQuerySchema,
  listInventoryLotsQuerySchema,
  listAppointmentsQuerySchema,
} from '../shared/schemas/warehouse.schemas.js';
import {
  createFacility,
  updateFacility,
  softDeleteFacility,
  createZone,
  createLocation,
  updateLocation,
  createSku,
  updateSku,
  createInventoryLot,
  updateInventoryLotCounts,
  createAppointment,
  transitionAppointment,
  WarehouseServiceError,
} from '../services/warehouse.service.js';
import {
  findFacilityById,
  listFacilities,
  findZoneById,
  listZonesByFacility,
  findLocationById,
  listLocations,
  findSkuById,
  listSkus,
  findInventoryLotById,
  listInventoryLots,
  findAppointmentById,
  listAppointments,
} from '../repositories/warehouse.repository.js';

// ---- Interfaces ----

interface FacilityIdParams { facilityId: string }
interface ZoneIdParams { facilityId: string; zoneId: string }
interface LocationIdParams { locationId: string }
interface SkuIdParams { skuId: string }
interface LotIdParams { lotId: string }
interface AppointmentIdParams { appointmentId: string }

interface CreateFacilityBody { name: string; code: string; address?: string }
interface UpdateFacilityBody { name?: string; address?: string; isActive?: boolean }
interface CreateZoneBody { name: string; code: string; description?: string }
interface CreateLocationBody {
  facilityId: string; zoneId?: string; code: string;
  type?: string; capacityCuFt: number; hazardClass?: string;
  temperatureBand?: string; isPickFace?: boolean;
}
interface UpdateLocationBody {
  type?: string; capacityCuFt?: number; hazardClass?: string;
  temperatureBand?: string; isPickFace?: boolean; isActive?: boolean;
}
interface CreateSkuBody {
  code: string; name: string; description?: string; abcClass?: string;
  unitWeightLb: number; unitVolumeCuFt: number; hazardClass?: string; temperatureBand?: string;
}
interface UpdateSkuBody {
  name?: string; description?: string; abcClass?: string; unitWeightLb?: number;
  unitVolumeCuFt?: number; hazardClass?: string; temperatureBand?: string; isActive?: boolean;
}
interface CreateInventoryLotBody {
  skuId: string; locationId: string; lotNumber: string; batchNumber?: string;
  expirationDate?: string; onHand?: number; reserved?: number; damaged?: number;
}
interface UpdateInventoryLotBody { onHand?: number; reserved?: number; damaged?: number }
interface CreateAppointmentBody {
  facilityId: string; type: string; scheduledAt: string;
  carrierId?: string; referenceNumber?: string; notes?: string;
}
interface AppointmentTransitionBody { reason: string; scheduledAt?: string }
interface ListFacilitiesQuery { includeInactive?: boolean }
interface ListLocationsQuery { facilityId?: string; zoneId?: string; includeInactive?: boolean }
interface ListSkusQuery { includeInactive?: boolean }
interface ListInventoryLotsQuery { skuId?: string; locationId?: string }
interface ListAppointmentsQuery { facilityId?: string; state?: string; type?: string }

// ---- Helper ----

function handleServiceError(err: unknown, request: { id: string }, reply: { status: (n: number) => { send: (v: unknown) => unknown } }) {
  if (err instanceof WarehouseServiceError) {
    const status = ErrorHttpStatus[err.code] ?? 500;
    return reply.status(status).send(errorResponse(err.code, err.message, request.id));
  }
  throw err;
}

// ---- Plugin ----

export const warehouseRoutes: FastifyPluginAsync = async (fastify) => {
  tagRequestLogDomain(fastify, 'warehouse');

  const managerRoles = [Role.WAREHOUSE_MANAGER, Role.SYSTEM_ADMIN];
  const operatorRoles = [Role.WAREHOUSE_OPERATOR, Role.WAREHOUSE_MANAGER, Role.SYSTEM_ADMIN];

  // ===== FACILITIES =====

  fastify.get<{ Querystring: ListFacilitiesQuery }>(
    '/facilities',
    { preHandler: [fastify.authenticate], schema: { querystring: listFacilitiesQuerySchema } },
    async (request, reply) => {
      const facilities = await listFacilities(fastify.prisma, {
        includeInactive: request.query.includeInactive ?? false,
      });
      return reply.status(200).send(successResponse(facilities, request.id));
    },
  );

  fastify.post<{ Body: CreateFacilityBody }>(
    '/facilities',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: createFacilityBodySchema },
    },
    async (request, reply) => {
      try {
        const facility = await createFacility(fastify.prisma, request.body, request.principal!.userId);
        return reply.status(201).send(successResponse(facility, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: FacilityIdParams }>(
    '/facilities/:facilityId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const facility = await findFacilityById(fastify.prisma, request.params.facilityId);
      if (!facility) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'Facility not found', request.id));
      }
      return reply.status(200).send(successResponse(facility, request.id));
    },
  );

  fastify.patch<{ Params: FacilityIdParams; Body: UpdateFacilityBody }>(
    '/facilities/:facilityId',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: updateFacilityBodySchema },
    },
    async (request, reply) => {
      try {
        const facility = await updateFacility(fastify.prisma, request.params.facilityId, request.body, request.principal!.userId);
        return reply.status(200).send(successResponse(facility, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.delete<{ Params: FacilityIdParams }>(
    '/facilities/:facilityId',
    { preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)] },
    async (request, reply) => {
      try {
        await softDeleteFacility(fastify.prisma, request.params.facilityId, request.principal!.userId);
        return reply.status(200).send(successResponse({ message: 'Facility deleted' }, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== ZONES =====

  fastify.get<{ Params: FacilityIdParams }>(
    '/facilities/:facilityId/zones',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const facility = await findFacilityById(fastify.prisma, request.params.facilityId);
      if (!facility) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'Facility not found', request.id));
      }
      const zones = await listZonesByFacility(fastify.prisma, request.params.facilityId);
      return reply.status(200).send(successResponse(zones, request.id));
    },
  );

  fastify.post<{ Params: FacilityIdParams; Body: CreateZoneBody }>(
    '/facilities/:facilityId/zones',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: createZoneBodySchema },
    },
    async (request, reply) => {
      try {
        const zone = await createZone(fastify.prisma, request.params.facilityId, request.body, request.principal!.userId);
        return reply.status(201).send(successResponse(zone, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: ZoneIdParams }>(
    '/facilities/:facilityId/zones/:zoneId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const zone = await findZoneById(fastify.prisma, request.params.zoneId);
      if (!zone || zone.facilityId !== request.params.facilityId) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'Zone not found', request.id));
      }
      return reply.status(200).send(successResponse(zone, request.id));
    },
  );

  // ===== LOCATIONS =====

  fastify.get<{ Querystring: ListLocationsQuery }>(
    '/locations',
    { preHandler: [fastify.authenticate], schema: { querystring: listLocationsQuerySchema } },
    async (request, reply) => {
      const locations = await listLocations(fastify.prisma, {
        facilityId: request.query.facilityId,
        zoneId: request.query.zoneId,
        includeInactive: request.query.includeInactive ?? false,
      });
      return reply.status(200).send(successResponse(locations, request.id));
    },
  );

  fastify.post<{ Body: CreateLocationBody }>(
    '/locations',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: createLocationBodySchema },
    },
    async (request, reply) => {
      try {
        const location = await createLocation(
          fastify.prisma,
          {
            facilityId: request.body.facilityId,
            zoneId: request.body.zoneId,
            code: request.body.code,
            type: request.body.type ?? 'RACK',
            capacityCuFt: request.body.capacityCuFt,
            hazardClass: request.body.hazardClass ?? 'NONE',
            temperatureBand: request.body.temperatureBand ?? 'AMBIENT',
            isPickFace: request.body.isPickFace ?? false,
          },
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(location, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: LocationIdParams }>(
    '/locations/:locationId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const location = await findLocationById(fastify.prisma, request.params.locationId);
      if (!location) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'Location not found', request.id));
      }
      return reply.status(200).send(successResponse(location, request.id));
    },
  );

  fastify.patch<{ Params: LocationIdParams; Body: UpdateLocationBody }>(
    '/locations/:locationId',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: updateLocationBodySchema },
    },
    async (request, reply) => {
      try {
        const location = await updateLocation(fastify.prisma, request.params.locationId, request.body, request.principal!.userId);
        return reply.status(200).send(successResponse(location, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== SKUS =====

  fastify.get<{ Querystring: ListSkusQuery }>(
    '/skus',
    { preHandler: [fastify.authenticate], schema: { querystring: listSkusQuerySchema } },
    async (request, reply) => {
      const skus = await listSkus(fastify.prisma, { includeInactive: request.query.includeInactive ?? false });
      return reply.status(200).send(successResponse(skus, request.id));
    },
  );

  fastify.post<{ Body: CreateSkuBody }>(
    '/skus',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: createSkuBodySchema },
    },
    async (request, reply) => {
      try {
        const sku = await createSku(
          fastify.prisma,
          {
            code: request.body.code,
            name: request.body.name,
            description: request.body.description,
            abcClass: request.body.abcClass ?? 'C',
            unitWeightLb: request.body.unitWeightLb,
            unitVolumeCuFt: request.body.unitVolumeCuFt,
            hazardClass: request.body.hazardClass ?? 'NONE',
            temperatureBand: request.body.temperatureBand ?? 'AMBIENT',
          },
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(sku, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: SkuIdParams }>(
    '/skus/:skuId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const sku = await findSkuById(fastify.prisma, request.params.skuId);
      if (!sku) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'SKU not found', request.id));
      }
      return reply.status(200).send(successResponse(sku, request.id));
    },
  );

  fastify.patch<{ Params: SkuIdParams; Body: UpdateSkuBody }>(
    '/skus/:skuId',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: updateSkuBodySchema },
    },
    async (request, reply) => {
      try {
        const sku = await updateSku(fastify.prisma, request.params.skuId, request.body, request.principal!.userId);
        return reply.status(200).send(successResponse(sku, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== INVENTORY LOTS =====

  fastify.get<{ Querystring: ListInventoryLotsQuery }>(
    '/inventory-lots',
    { preHandler: [fastify.authenticate], schema: { querystring: listInventoryLotsQuerySchema } },
    async (request, reply) => {
      const lots = await listInventoryLots(fastify.prisma, {
        skuId: request.query.skuId,
        locationId: request.query.locationId,
      });
      return reply.status(200).send(successResponse(lots, request.id));
    },
  );

  fastify.post<{ Body: CreateInventoryLotBody }>(
    '/inventory-lots',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)],
      schema: { body: createInventoryLotBodySchema },
    },
    async (request, reply) => {
      try {
        const lot = await createInventoryLot(
          fastify.prisma,
          {
            skuId: request.body.skuId,
            locationId: request.body.locationId,
            lotNumber: request.body.lotNumber,
            batchNumber: request.body.batchNumber,
            expirationDate: request.body.expirationDate ? new Date(request.body.expirationDate) : undefined,
            onHand: request.body.onHand ?? 0,
            reserved: request.body.reserved ?? 0,
            damaged: request.body.damaged ?? 0,
          },
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(lot, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: LotIdParams }>(
    '/inventory-lots/:lotId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const lot = await findInventoryLotById(fastify.prisma, request.params.lotId);
      if (!lot) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'Inventory lot not found', request.id));
      }
      return reply.status(200).send(successResponse(lot, request.id));
    },
  );

  fastify.patch<{ Params: LotIdParams; Body: UpdateInventoryLotBody }>(
    '/inventory-lots/:lotId',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)],
      schema: { body: updateInventoryLotBodySchema },
    },
    async (request, reply) => {
      try {
        const lot = await updateInventoryLotCounts(fastify.prisma, request.params.lotId, request.body, request.principal!.userId);
        return reply.status(200).send(successResponse(lot, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== APPOINTMENTS =====

  fastify.get<{ Querystring: ListAppointmentsQuery }>(
    '/appointments',
    { preHandler: [fastify.authenticate], schema: { querystring: listAppointmentsQuerySchema } },
    async (request, reply) => {
      const appointments = await listAppointments(fastify.prisma, {
        facilityId: request.query.facilityId,
        state: request.query.state,
        type: request.query.type,
      });
      return reply.status(200).send(successResponse(appointments, request.id));
    },
  );

  fastify.post<{ Body: CreateAppointmentBody }>(
    '/appointments',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)],
      schema: { body: createAppointmentBodySchema },
    },
    async (request, reply) => {
      try {
        const appointment = await createAppointment(
          fastify.prisma,
          {
            facilityId: request.body.facilityId,
            type: request.body.type,
            scheduledAt: new Date(request.body.scheduledAt),
            carrierId: request.body.carrierId,
            referenceNumber: request.body.referenceNumber,
            notes: request.body.notes,
          },
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(appointment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: AppointmentIdParams }>(
    '/appointments/:appointmentId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const appointment = await findAppointmentById(fastify.prisma, request.params.appointmentId);
      if (!appointment) {
        return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'Appointment not found', request.id));
      }
      return reply.status(200).send(successResponse(appointment, request.id));
    },
  );

  // ---- Appointment transitions ----

  fastify.post<{ Params: AppointmentIdParams; Body: AppointmentTransitionBody }>(
    '/appointments/:appointmentId/confirm',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)],
      schema: { body: appointmentTransitionBodySchema },
    },
    async (request, reply) => {
      try {
        const appointment = await transitionAppointment(
          fastify.prisma,
          request.params.appointmentId,
          AppointmentState.CONFIRMED,
          request.principal!.userId,
          request.body.reason,
        );
        return reply.status(200).send(successResponse(appointment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: AppointmentIdParams; Body: AppointmentTransitionBody }>(
    '/appointments/:appointmentId/cancel',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)],
      schema: { body: appointmentTransitionBodySchema },
    },
    async (request, reply) => {
      try {
        const appointment = await transitionAppointment(
          fastify.prisma,
          request.params.appointmentId,
          AppointmentState.CANCELLED,
          request.principal!.userId,
          request.body.reason,
        );
        return reply.status(200).send(successResponse(appointment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: AppointmentIdParams; Body: AppointmentTransitionBody }>(
    '/appointments/:appointmentId/reschedule',
    {
      preHandler: [fastify.authenticate, fastify.requireRole(managerRoles)],
      schema: { body: appointmentTransitionBodySchema },
    },
    async (request, reply) => {
      try {
        const appointment = await transitionAppointment(
          fastify.prisma,
          request.params.appointmentId,
          AppointmentState.RESCHEDULED,
          request.principal!.userId,
          request.body.reason,
          { scheduledAt: request.body.scheduledAt ? new Date(request.body.scheduledAt) : undefined },
        );
        return reply.status(200).send(successResponse(appointment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );
};
