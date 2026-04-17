// ============================================================
// GreenCycle Admin Domain — Fastify JSON Schema Definitions
// ============================================================

export const createBackupBodySchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export const restoreBackupBodySchema = {
  type: 'object',
  required: ['confirm'],
  properties: {
    confirm: { type: 'boolean', enum: [true] },
  },
  additionalProperties: false,
} as const;

export const createParameterBodySchema = {
  type: 'object',
  required: ['key', 'value'],
  properties: {
    key: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      pattern: '^[a-zA-Z0-9._:-]+$',
    },
    value: { type: 'string', maxLength: 4000 },
    description: { type: 'string', maxLength: 1000 },
  },
  additionalProperties: false,
} as const;

export const updateParameterBodySchema = {
  type: 'object',
  required: ['value'],
  properties: {
    value: { type: 'string', maxLength: 4000 },
    description: { type: 'string', maxLength: 1000 },
  },
  additionalProperties: false,
} as const;

export const createIpAllowlistEntryBodySchema = {
  type: 'object',
  required: ['cidr', 'routeGroup'],
  properties: {
    cidr: { type: 'string', minLength: 1, maxLength: 50 },
    routeGroup: { type: 'string', enum: ['admin', 'backup'] },
    description: { type: 'string', maxLength: 500 },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export const updateIpAllowlistEntryBodySchema = {
  type: 'object',
  properties: {
    cidr: { type: 'string', minLength: 1, maxLength: 50 },
    isActive: { type: 'boolean' },
    description: { type: 'string', maxLength: 500 },
  },
  additionalProperties: false,
} as const;

export const listIpAllowlistQuerySchema = {
  type: 'object',
  properties: {
    routeGroup: { type: 'string', enum: ['admin', 'backup'] },
  },
  additionalProperties: false,
} as const;

export const retentionPurgeBodySchema = {
  type: 'object',
  required: ['confirm'],
  properties: {
    confirm: { type: 'boolean', enum: [true] },
  },
  additionalProperties: false,
} as const;

export const rotateKeyBodySchema = {
  type: 'object',
  required: ['keyHash'],
  properties: {
    keyHash: { type: 'string', minLength: 1, maxLength: 200 },
  },
  additionalProperties: false,
} as const;
