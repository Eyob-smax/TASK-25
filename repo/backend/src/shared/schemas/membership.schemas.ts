// Fastify JSON Schema definitions for Membership & Billing Ledger endpoints

export const createMemberBodySchema = {
  type: 'object',
  required: ['memberNumber', 'firstName', 'lastName'],
  properties: {
    memberNumber: { type: 'string', minLength: 1, maxLength: 50 },
    firstName: { type: 'string', minLength: 1, maxLength: 100 },
    lastName: { type: 'string', minLength: 1, maxLength: 100 },
    email: { type: 'string', format: 'email', maxLength: 200 },
    phone: { type: 'string', maxLength: 20 },
  },
  additionalProperties: false,
} as const;

export const updateMemberBodySchema = {
  type: 'object',
  properties: {
    firstName: { type: 'string', minLength: 1, maxLength: 100 },
    lastName: { type: 'string', minLength: 1, maxLength: 100 },
    email: { type: 'string', format: 'email', maxLength: 200 },
    phone: { type: 'string', maxLength: 20 },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export const createPackageBodySchema = {
  type: 'object',
  required: ['name', 'type', 'price'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    type: { type: 'string', enum: ['PUNCH', 'TERM', 'STORED_VALUE', 'BUNDLE'] },
    description: { type: 'string', maxLength: 1000 },
    price: { type: 'number', exclusiveMinimum: 0 },
    durationDays: { type: 'integer', minimum: 1 },
    punchCount: { type: 'integer', minimum: 1 },
    storedValue: { type: 'number', exclusiveMinimum: 0 },
  },
  additionalProperties: false,
} as const;

export const createEnrollmentBodySchema = {
  type: 'object',
  required: ['packageId', 'startDate'],
  properties: {
    packageId: { type: 'string' },
    startDate: { type: 'string', format: 'date-time' },
    endDate: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
} as const;

export const recordPaymentBodySchema = {
  type: 'object',
  required: ['memberId', 'amount'],
  properties: {
    memberId: { type: 'string' },
    enrollmentId: { type: 'string' },
    amount: { type: 'number', exclusiveMinimum: 0 },
    currency: { type: 'string', maxLength: 3, default: 'USD' },
    paymentMethod: { type: 'string', maxLength: 50 },
    last4: { type: 'string', minLength: 4, maxLength: 4, pattern: '^[0-9]{4}$' },
    paidAt: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
} as const;

export const listMembersQuerySchema = {
  type: 'object',
  properties: {
    includeInactive: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

export const listPaymentsQuerySchema = {
  type: 'object',
  properties: {
    memberId: { type: 'string' },
    status: { type: 'string', enum: ['RECORDED', 'SETTLED', 'VOIDED', 'REFUNDED'] },
  },
  additionalProperties: false,
} as const;

export const updatePaymentStatusBodySchema = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['SETTLED', 'VOIDED', 'REFUNDED'] },
  },
  additionalProperties: false,
} as const;

export const updatePackageBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    price: { type: 'number', exclusiveMinimum: 0 },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;
