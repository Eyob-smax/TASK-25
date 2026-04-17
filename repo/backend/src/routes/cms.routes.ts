import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../shared/enums.js';
import { successResponse, errorResponse, ErrorCode, ErrorHttpStatus } from '../shared/envelope.js';
import { tagRequestLogDomain } from '../logging/logger.js';
import {
  createArticleBodySchema,
  updateArticleBodySchema,
  schedulePublishBodySchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
  createTagBodySchema,
  addTagAliasBodySchema,
  mergeTagsBodySchema,
  bulkMigrateTagsBodySchema,
  recordInteractionBodySchema,
  listArticlesQuerySchema,
  listTagsQuerySchema,
  trendingTagsQuerySchema,
} from '../shared/schemas/cms.schemas.js';
import {
  createArticle,
  getArticle,
  listArticles,
  updateArticle,
  transitionArticle,
  recordInteraction,
  getTrendingTags,
  getTagCloud,
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
  createTag,
  getTag,
  listTags,
  addTagAlias,
  mergeTags,
  bulkMigrateTags,
  CmsServiceError,
} from '../services/cms.service.js';

// ---- Type Interfaces ----

interface ArticleIdParams { articleId: string }
interface CategoryIdParams { categoryId: string }
interface TagIdParams { tagId: string }

interface CreateArticleBody {
  title: string; slug: string; body: string;
  categoryIds?: string[]; tagIds?: string[];
}
interface UpdateArticleBody {
  title?: string; slug?: string; body?: string;
  categoryIds?: string[]; tagIds?: string[];
}
interface SchedulePublishBody { scheduledPublishAt: string }
interface CreateCategoryBody { name: string; slug: string; parentId?: string }
interface UpdateCategoryBody { name?: string; isActive?: boolean }
interface CreateTagBody { name: string }
interface AddTagAliasBody { alias: string }
interface MergeTagsBody { sourceTagId: string; targetTagId: string }
interface BulkMigrateTagsBody { fromTagId: string; toTagId: string; articleIds?: string[] }
interface RecordInteractionBody { type: string; sessionId?: string }
interface ListArticlesQuery { state?: string; authorId?: string }
interface ListTagsQuery { includeTombstones?: boolean }
interface TrendingTagsQuery { windowDays?: number; limit?: number }

// ---- Error Handler ----

function handleServiceError(
  err: unknown,
  request: { id: string },
  reply: { status: (n: number) => { send: (v: unknown) => unknown } },
) {
  if (err instanceof CmsServiceError) {
    const status = ErrorHttpStatus[err.code] ?? 500;
    return reply.status(status).send(errorResponse(err.code, err.message, request.id));
  }
  throw err;
}

// ---- Plugin ----

export const cmsRoutes: FastifyPluginAsync = async (fastify) => {
  tagRequestLogDomain(fastify, 'cms');

  const cmsRoles = [Role.CMS_REVIEWER, Role.SYSTEM_ADMIN];

  // ===== ARTICLES =====

  fastify.get<{ Querystring: ListArticlesQuery }>(
    '/articles',
    { preHandler: [fastify.authenticate], schema: { querystring: listArticlesQuerySchema } },
    async (request, reply) => {
      const articles = await listArticles(fastify.prisma, request.query);
      return reply.status(200).send(successResponse(articles, request.id));
    },
  );

  fastify.post<{ Body: CreateArticleBody }>(
    '/articles',
    { preHandler: [fastify.authenticate], schema: { body: createArticleBodySchema } },
    async (request, reply) => {
      try {
        const article = await createArticle(fastify.prisma, request.body, request.principal!.userId);
        return reply.status(201).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: ArticleIdParams }>(
    '/articles/:articleId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const article = await getArticle(fastify.prisma, request.params.articleId);
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.patch<{ Params: ArticleIdParams; Body: UpdateArticleBody }>(
    '/articles/:articleId',
    { preHandler: [fastify.authenticate], schema: { body: updateArticleBodySchema } },
    async (request, reply) => {
      try {
        const article = await updateArticle(
          fastify.prisma,
          request.params.articleId,
          request.body,
          request.principal!.userId,
          request.principal!.roles,
        );
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: ArticleIdParams }>(
    '/articles/:articleId/submit-review',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const article = await transitionArticle(
          fastify.prisma,
          request.params.articleId,
          'IN_REVIEW',
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: ArticleIdParams }>(
    '/articles/:articleId/approve',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)] },
    async (request, reply) => {
      try {
        const article = await transitionArticle(
          fastify.prisma,
          request.params.articleId,
          'APPROVED',
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: ArticleIdParams }>(
    '/articles/:articleId/reject',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)] },
    async (request, reply) => {
      try {
        const article = await transitionArticle(
          fastify.prisma,
          request.params.articleId,
          'DRAFT',
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: ArticleIdParams }>(
    '/articles/:articleId/publish',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)] },
    async (request, reply) => {
      try {
        const article = await transitionArticle(
          fastify.prisma,
          request.params.articleId,
          'PUBLISHED',
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: ArticleIdParams; Body: SchedulePublishBody }>(
    '/articles/:articleId/schedule',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)], schema: { body: schedulePublishBodySchema } },
    async (request, reply) => {
      try {
        const article = await transitionArticle(
          fastify.prisma,
          request.params.articleId,
          'SCHEDULED',
          request.principal!.userId,
          { scheduledPublishAt: new Date(request.body.scheduledPublishAt) },
        );
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: ArticleIdParams }>(
    '/articles/:articleId/withdraw',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)] },
    async (request, reply) => {
      try {
        const article = await transitionArticle(
          fastify.prisma,
          request.params.articleId,
          'WITHDRAWN',
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(article, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: ArticleIdParams; Body: RecordInteractionBody }>(
    '/articles/:articleId/interactions',
    { preHandler: [fastify.authenticate], schema: { body: recordInteractionBodySchema } },
    async (request, reply) => {
      try {
        const interaction = await recordInteraction(
          fastify.prisma,
          request.params.articleId,
          { type: request.body.type, sessionId: request.body.sessionId },
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(interaction, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== CATEGORIES =====

  fastify.get(
    '/categories',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const categories = await listCategories(fastify.prisma);
      return reply.status(200).send(successResponse(categories, request.id));
    },
  );

  fastify.post<{ Body: CreateCategoryBody }>(
    '/categories',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)], schema: { body: createCategoryBodySchema } },
    async (request, reply) => {
      try {
        const category = await createCategory(fastify.prisma, request.body, request.principal!.userId);
        return reply.status(201).send(successResponse(category, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: CategoryIdParams }>(
    '/categories/:categoryId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const category = await getCategory(fastify.prisma, request.params.categoryId);
        return reply.status(200).send(successResponse(category, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.patch<{ Params: CategoryIdParams; Body: UpdateCategoryBody }>(
    '/categories/:categoryId',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)], schema: { body: updateCategoryBodySchema } },
    async (request, reply) => {
      try {
        const category = await updateCategory(
          fastify.prisma,
          request.params.categoryId,
          request.body,
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(category, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== TAGS =====
  // IMPORTANT: literal-path routes must come before /:tagId to avoid route collision

  fastify.get<{ Querystring: ListTagsQuery }>(
    '/tags',
    { preHandler: [fastify.authenticate], schema: { querystring: listTagsQuerySchema } },
    async (request, reply) => {
      const tags = await listTags(fastify.prisma, { includeTombstones: request.query.includeTombstones ?? false });
      return reply.status(200).send(successResponse(tags, request.id));
    },
  );

  fastify.post<{ Body: CreateTagBody }>(
    '/tags',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)], schema: { body: createTagBodySchema } },
    async (request, reply) => {
      try {
        const tag = await createTag(fastify.prisma, request.body, request.principal!.userId);
        return reply.status(201).send(successResponse(tag, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Querystring: TrendingTagsQuery }>(
    '/tags/trending',
    { preHandler: [fastify.authenticate], schema: { querystring: trendingTagsQuerySchema } },
    async (request, reply) => {
      const trending = await getTrendingTags(
        fastify.prisma,
        request.query.windowDays ?? 7,
        request.query.limit ?? 20,
      );
      return reply.status(200).send(successResponse(trending, request.id));
    },
  );

  fastify.get(
    '/tags/cloud',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const cloud = await getTagCloud(fastify.prisma);
      return reply.status(200).send(successResponse(cloud, request.id));
    },
  );

  fastify.post<{ Body: MergeTagsBody }>(
    '/tags/merge',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)], schema: { body: mergeTagsBodySchema } },
    async (request, reply) => {
      try {
        const result = await mergeTags(
          fastify.prisma,
          request.body.sourceTagId,
          request.body.targetTagId,
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Body: BulkMigrateTagsBody }>(
    '/tags/bulk-migrate',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)], schema: { body: bulkMigrateTagsBodySchema } },
    async (request, reply) => {
      try {
        const result = await bulkMigrateTags(
          fastify.prisma,
          request.body.fromTagId,
          request.body.toTagId,
          request.body.articleIds,
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(result, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: TagIdParams }>(
    '/tags/:tagId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const tag = await getTag(fastify.prisma, request.params.tagId);
        return reply.status(200).send(successResponse(tag, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: TagIdParams; Body: AddTagAliasBody }>(
    '/tags/:tagId/aliases',
    { preHandler: [fastify.authenticate, fastify.requireRole(cmsRoles)], schema: { body: addTagAliasBodySchema } },
    async (request, reply) => {
      try {
        const alias = await addTagAlias(
          fastify.prisma,
          request.params.tagId,
          request.body.alias,
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(alias, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );
};
