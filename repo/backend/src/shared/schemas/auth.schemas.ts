// Fastify JSON Schema definitions for Authentication & Session endpoints

export const loginBodySchema = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 3, maxLength: 64 },
    password: { type: 'string', minLength: 8, maxLength: 128 },
  },
  additionalProperties: false,
} as const;

export const rotatePasswordBodySchema = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: { type: 'string', minLength: 8, maxLength: 128 },
    newPassword: { type: 'string', minLength: 8, maxLength: 128 },
  },
  additionalProperties: false,
} as const;

export const createUserBodySchema = {
  type: 'object',
  required: ['username', 'password', 'roles'],
  properties: {
    username: { type: 'string', minLength: 3, maxLength: 64 },
    password: { type: 'string', minLength: 8, maxLength: 128 },
    roles: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'SYSTEM_ADMIN',
          'WAREHOUSE_MANAGER',
          'WAREHOUSE_OPERATOR',
          'STRATEGY_MANAGER',
          'MEMBERSHIP_MANAGER',
          'CMS_REVIEWER',
          'BILLING_MANAGER',
        ],
      },
      minItems: 1,
    },
  },
  additionalProperties: false,
} as const;

export const updateUserRolesBodySchema = {
  type: 'object',
  required: ['roles'],
  properties: {
    roles: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'SYSTEM_ADMIN',
          'WAREHOUSE_MANAGER',
          'WAREHOUSE_OPERATOR',
          'STRATEGY_MANAGER',
          'MEMBERSHIP_MANAGER',
          'CMS_REVIEWER',
          'BILLING_MANAGER',
        ],
      },
      minItems: 1,
    },
  },
  additionalProperties: false,
} as const;
