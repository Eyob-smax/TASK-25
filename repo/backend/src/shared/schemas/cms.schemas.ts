// Fastify JSON Schema definitions for CMS endpoints

export const createArticleBodySchema = {
  type: 'object',
  required: ['title', 'slug', 'body'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 300 },
    slug: { type: 'string', minLength: 1, maxLength: 300, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
    body: { type: 'string', minLength: 1 },
    categoryIds: {
      type: 'array',
      items: { type: 'string' },
    },
    tagIds: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
} as const;

export const updateArticleBodySchema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 300 },
    slug: { type: 'string', minLength: 1, maxLength: 300, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
    body: { type: 'string', minLength: 1 },
    categoryIds: {
      type: 'array',
      items: { type: 'string' },
    },
    tagIds: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
} as const;

export const schedulePublishBodySchema = {
  type: 'object',
  required: ['scheduledPublishAt'],
  properties: {
    scheduledPublishAt: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
} as const;

export const createCategoryBodySchema = {
  type: 'object',
  required: ['name', 'slug'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    slug: { type: 'string', minLength: 1, maxLength: 200, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
    parentId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const updateCategoryBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    isActive: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export const createTagBodySchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
  },
  additionalProperties: false,
} as const;

export const addTagAliasBodySchema = {
  type: 'object',
  required: ['alias'],
  properties: {
    alias: { type: 'string', minLength: 1, maxLength: 100 },
  },
  additionalProperties: false,
} as const;

export const mergeTagsBodySchema = {
  type: 'object',
  required: ['sourceTagId', 'targetTagId'],
  properties: {
    sourceTagId: { type: 'string' },
    targetTagId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const bulkMigrateTagsBodySchema = {
  type: 'object',
  required: ['fromTagId', 'toTagId'],
  properties: {
    fromTagId: { type: 'string' },
    toTagId: { type: 'string' },
    articleIds: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
} as const;

export const recordInteractionBodySchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { type: 'string', enum: ['VIEW', 'SHARE', 'BOOKMARK', 'COMMENT'] },
    sessionId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const listArticlesQuerySchema = {
  type: 'object',
  properties: {
    state: {
      type: 'string',
      enum: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED', 'WITHDRAWN'],
    },
    authorId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const listTagsQuerySchema = {
  type: 'object',
  properties: {
    includeTombstones: { type: 'boolean', default: false },
  },
  additionalProperties: false,
} as const;

export const trendingTagsQuerySchema = {
  type: 'object',
  properties: {
    windowDays: { type: 'integer', enum: [7], default: 7 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  additionalProperties: false,
} as const;
