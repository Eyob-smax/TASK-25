// Fastify JSON Schema definitions for Warehouse Operations endpoints

export const createFacilityBodySchema = {
  type: 'object',
  required: ['name', 'code'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    code: { type: 'string', minLength: 1, maxLength: 50 },
    address: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

export const updateFacilityBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    address: { type: 'string', maxLength: 500 },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export const createZoneBodySchema = {
  type: 'object',
  required: ['name', 'code'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    code: { type: 'string', minLength: 1, maxLength: 50 },
    description: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

export const createLocationBodySchema = {
  type: 'object',
  required: ['facilityId', 'code', 'capacityCuFt'],
  properties: {
    facilityId: { type: 'string' },
    zoneId: { type: 'string' },
    code: { type: 'string', minLength: 1, maxLength: 50 },
    type: {
      type: 'string',
      enum: ['RACK', 'FLOOR', 'BULK', 'PICK_FACE', 'STAGING', 'RECEIVING', 'SHIPPING'],
      default: 'RACK',
    },
    capacityCuFt: { type: 'number', exclusiveMinimum: 0 },
    hazardClass: {
      type: 'string',
      enum: ['NONE', 'FLAMMABLE', 'CORROSIVE', 'TOXIC', 'OXIDIZER', 'COMPRESSED_GAS'],
      default: 'NONE',
    },
    temperatureBand: {
      type: 'string',
      enum: ['AMBIENT', 'COOL', 'COLD', 'FROZEN'],
      default: 'AMBIENT',
    },
    isPickFace: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

export const updateLocationBodySchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['RACK', 'FLOOR', 'BULK', 'PICK_FACE', 'STAGING', 'RECEIVING', 'SHIPPING'],
    },
    capacityCuFt: { type: 'number', exclusiveMinimum: 0 },
    hazardClass: {
      type: 'string',
      enum: ['NONE', 'FLAMMABLE', 'CORROSIVE', 'TOXIC', 'OXIDIZER', 'COMPRESSED_GAS'],
    },
    temperatureBand: {
      type: 'string',
      enum: ['AMBIENT', 'COOL', 'COLD', 'FROZEN'],
    },
    isPickFace: { type: 'boolean' },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export const createSkuBodySchema = {
  type: 'object',
  required: ['code', 'name', 'unitWeightLb', 'unitVolumeCuFt'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 50 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    abcClass: { type: 'string', enum: ['A', 'B', 'C'], default: 'C' },
    unitWeightLb: { type: 'number', exclusiveMinimum: 0 },
    unitVolumeCuFt: { type: 'number', exclusiveMinimum: 0 },
    hazardClass: {
      type: 'string',
      enum: ['NONE', 'FLAMMABLE', 'CORROSIVE', 'TOXIC', 'OXIDIZER', 'COMPRESSED_GAS'],
      default: 'NONE',
    },
    temperatureBand: {
      type: 'string',
      enum: ['AMBIENT', 'COOL', 'COLD', 'FROZEN'],
      default: 'AMBIENT',
    },
  },
  additionalProperties: false,
} as const;

export const createInventoryLotBodySchema = {
  type: 'object',
  required: ['skuId', 'locationId', 'lotNumber'],
  properties: {
    skuId: { type: 'string' },
    locationId: { type: 'string' },
    lotNumber: { type: 'string', minLength: 1, maxLength: 50 },
    batchNumber: { type: 'string', maxLength: 50 },
    expirationDate: { type: 'string', format: 'date-time' },
    onHand: { type: 'integer', minimum: 0, default: 0 },
    reserved: { type: 'integer', minimum: 0, default: 0 },
    damaged: { type: 'integer', minimum: 0, default: 0 },
  },
  additionalProperties: false,
} as const;

export const updateInventoryLotBodySchema = {
  type: 'object',
  properties: {
    onHand: { type: 'integer', minimum: 0 },
    reserved: { type: 'integer', minimum: 0 },
    damaged: { type: 'integer', minimum: 0 },
  },
  additionalProperties: false,
} as const;

export const createAppointmentBodySchema = {
  type: 'object',
  required: ['facilityId', 'type', 'scheduledAt'],
  properties: {
    facilityId: { type: 'string' },
    type: { type: 'string', enum: ['INBOUND', 'OUTBOUND'] },
    scheduledAt: { type: 'string', format: 'date-time' },
    carrierId: { type: 'string' },
    referenceNumber: { type: 'string', maxLength: 100 },
    notes: { type: 'string', maxLength: 1000 },
  },
  additionalProperties: false,
} as const;

export const appointmentTransitionBodySchema = {
  type: 'object',
  required: ['reason'],
  properties: {
    reason: { type: 'string', minLength: 1, maxLength: 500 },
    scheduledAt: { type: 'string', format: 'date-time' }, // for reschedule
  },
  additionalProperties: false,
} as const;

export const updateSkuBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    abcClass: { type: 'string', enum: ['A', 'B', 'C'] },
    unitWeightLb: { type: 'number', exclusiveMinimum: 0 },
    unitVolumeCuFt: { type: 'number', exclusiveMinimum: 0 },
    hazardClass: {
      type: 'string',
      enum: ['NONE', 'FLAMMABLE', 'CORROSIVE', 'TOXIC', 'OXIDIZER', 'COMPRESSED_GAS'],
    },
    temperatureBand: { type: 'string', enum: ['AMBIENT', 'COOL', 'COLD', 'FROZEN'] },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export const listFacilitiesQuerySchema = {
  type: 'object',
  properties: {
    includeInactive: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

export const listLocationsQuerySchema = {
  type: 'object',
  properties: {
    facilityId: { type: 'string' },
    zoneId: { type: 'string' },
    includeInactive: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

export const listSkusQuerySchema = {
  type: 'object',
  properties: {
    includeInactive: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

export const listInventoryLotsQuerySchema = {
  type: 'object',
  properties: {
    skuId: { type: 'string' },
    locationId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const listAppointmentsQuerySchema = {
  type: 'object',
  properties: {
    facilityId: { type: 'string' },
    state: {
      type: 'string',
      enum: ['PENDING', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'EXPIRED'],
    },
    type: { type: 'string', enum: ['INBOUND', 'OUTBOUND'] },
  },
  additionalProperties: false,
} as const;
