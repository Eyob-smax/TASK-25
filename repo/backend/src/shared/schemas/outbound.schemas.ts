// Fastify JSON Schema definitions for Outbound Execution endpoints

export const createOutboundOrderBodySchema = {
  type: 'object',
  required: ['facilityId', 'type', 'lines'],
  properties: {
    facilityId: { type: 'string' },
    type: { type: 'string', enum: ['SALES', 'RETURN', 'TRANSFER'] },
    referenceNumber: { type: 'string', maxLength: 100 },
    requestedShipDate: { type: 'string', format: 'date-time' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        required: ['skuId', 'quantity'],
        properties: {
          skuId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  additionalProperties: false,
} as const;

export const generateWaveBodySchema = {
  type: 'object',
  required: ['facilityId', 'orderIds'],
  properties: {
    facilityId: { type: 'string' },
    orderIds: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
  },
  additionalProperties: false,
} as const;

export const generateWaveHeadersSchema = {
  type: 'object',
  required: ['idempotency-key'],
  properties: {
    'idempotency-key': { type: 'string', format: 'uuid' },
  },
} as const;

export const packVerificationBodySchema = {
  type: 'object',
  required: ['actualWeightLb', 'actualVolumeCuFt'],
  properties: {
    actualWeightLb: { type: 'number', exclusiveMinimum: 0 },
    actualVolumeCuFt: { type: 'number', exclusiveMinimum: 0 },
  },
  additionalProperties: false,
} as const;

export const handoffBodySchema = {
  type: 'object',
  required: ['carrier'],
  properties: {
    carrier: { type: 'string', minLength: 1, maxLength: 200 },
    trackingNumber: { type: 'string', maxLength: 100 },
    notes: { type: 'string', maxLength: 1000 },
  },
  additionalProperties: false,
} as const;

export const reportExceptionBodySchema = {
  type: 'object',
  required: ['lineId', 'shortageReason', 'quantityShort'],
  properties: {
    lineId: { type: 'string' },
    shortageReason: { type: 'string', enum: ['STOCKOUT', 'DAMAGE', 'OVERSELL'] },
    quantityShort: { type: 'integer', minimum: 1 },
    notes: { type: 'string', maxLength: 1000 },
  },
  additionalProperties: false,
} as const;

export const approvePartialBodySchema = {
  type: 'object',
  properties: {
    reason: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

export const updatePickTaskBodySchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'SHORT', 'CANCELLED'] },
    quantityPicked: { type: 'integer', minimum: 0 },
    actualDistance: { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
} as const;

export const listOrdersQuerySchema = {
  type: 'object',
  properties: {
    facilityId: { type: 'string' },
    status: {
      type: 'string',
      enum: ['DRAFT', 'PICKING', 'PACKING', 'PACKED', 'SHIPPED', 'PARTIAL_SHIPPED', 'CANCELLED'],
    },
  },
  additionalProperties: false,
} as const;

export const listWavesQuerySchema = {
  type: 'object',
  properties: {
    facilityId: { type: 'string' },
    status: { type: 'string', enum: ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
  },
  additionalProperties: false,
} as const;
