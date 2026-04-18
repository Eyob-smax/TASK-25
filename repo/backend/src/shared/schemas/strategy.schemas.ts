// Fastify JSON Schema definitions for Strategy Center endpoints

export const createRulesetBodySchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    fifoWeight: { type: 'number', minimum: 0, maximum: 10, default: 1.0 },
    fefoWeight: { type: 'number', minimum: 0, maximum: 10, default: 0.0 },
    abcWeight: { type: 'number', minimum: 0, maximum: 10, default: 1.0 },
    heatLevelWeight: { type: 'number', minimum: 0, maximum: 10, default: 1.0 },
    pathCostWeight: { type: 'number', minimum: 0, maximum: 10, default: 1.0 },
  },
  additionalProperties: false,
} as const;

export const putawayRankBodySchema = {
  type: 'object',
  required: ['facilityId', 'skuId', 'quantity'],
  properties: {
    facilityId: { type: 'string' },
    skuId: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
    rulesetId: { type: 'string' }, // optional: use specific ruleset
    lotNumber: { type: 'string' },
    expirationDate: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
} as const;

export const pickPathBodySchema = {
  type: 'object',
  required: ['facilityId', 'pickTaskIds'],
  properties: {
    facilityId: { type: 'string' },
    pickTaskIds: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    rulesetId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const simulateBodySchema = {
  type: 'object',
  required: ['facilityId', 'rulesetIds'],
  properties: {
    facilityId: { type: 'string' },
    rulesetIds: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 10,
    },
    windowDays: { type: 'integer', enum: [30], default: 30 },
  },
  additionalProperties: false,
} as const;

export const updateRulesetBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    fifoWeight: { type: 'number', minimum: 0, maximum: 10 },
    fefoWeight: { type: 'number', minimum: 0, maximum: 10 },
    abcWeight: { type: 'number', minimum: 0, maximum: 10 },
    heatLevelWeight: { type: 'number', minimum: 0, maximum: 10 },
    pathCostWeight: { type: 'number', minimum: 0, maximum: 10 },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export const listRulesetsQuerySchema = {
  type: 'object',
  properties: {
    includeInactive: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;
