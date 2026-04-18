import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('CMS depth — reviewer gating and lifecycle transitions', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  async function createDraftArticle(
    token: string,
    payload: {
      title?: string;
      slug?: string;
      body?: string;
      categoryIds?: string[];
      tagIds?: string[];
    } = {},
  ) {
    const slug = `depth-article-${randomUUID().slice(0, 10)}`;
    const create = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: authHeader(token),
      payload: {
        title: payload.title ?? `Depth Article ${randomUUID().slice(0, 6)}`,
        slug: payload.slug ?? slug,
        body: payload.body ?? 'Depth article body',
        categoryIds: payload.categoryIds,
        tagIds: payload.tagIds,
      },
    });
    expect(create.statusCode).toBe(201);
    return JSON.parse(create.payload).data.id as string;
  }

  async function createCategory(token: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/cms/categories',
      headers: authHeader(token),
      payload: {
        name: `Depth Category ${randomUUID().slice(0, 6)}`,
        slug: `depth-category-${randomUUID().slice(0, 6)}`,
      },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.payload).data.id as string;
  }

  async function createTag(token: string, namePrefix = 'Depth Tag') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/cms/tags',
      headers: authHeader(token),
      payload: {
        name: `${namePrefix} ${randomUUID().slice(0, 6)}`,
      },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.payload).data.id as string;
  }

  it('enforces reviewer role for approval and supports DRAFT->IN_REVIEW->APPROVED->PUBLISHED', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const articleId = await createDraftArticle(author.token);

    const submit = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleId}/submit-review`,
      headers: authHeader(author.token),
    });
    expect(submit.statusCode).toBe(200);
    expect(JSON.parse(submit.payload).data.state).toBe('IN_REVIEW');

    const approveAsNonReviewer = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleId}/approve`,
      headers: authHeader(author.token),
    });
    expect(approveAsNonReviewer.statusCode).toBe(403);
    expect(JSON.parse(approveAsNonReviewer.payload).error.code).toBe('FORBIDDEN');

    const approve = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleId}/approve`,
      headers: authHeader(reviewer.token),
    });
    expect(approve.statusCode).toBe(200);
    expect(JSON.parse(approve.payload).data.state).toBe('APPROVED');

    const publish = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleId}/publish`,
      headers: authHeader(reviewer.token),
    });
    expect(publish.statusCode).toBe(200);
    expect(JSON.parse(publish.payload).data.state).toBe('PUBLISHED');
  });

  it('enforces object-level authorization on PATCH /articles/:articleId', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const stranger = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const articleId = await createDraftArticle(author.token);

    // A non-author, non-reviewer authenticated user must not be able to edit.
    const strangerUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(stranger.token),
      payload: { title: 'hijacked title' },
    });
    expect(strangerUpdate.statusCode).toBe(403);
    expect(JSON.parse(strangerUpdate.payload).error.code).toBe('FORBIDDEN');

    // Original author can update their own draft article.
    const authorUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(author.token),
      payload: { title: 'author edited title' },
    });
    expect(authorUpdate.statusCode).toBe(200);
    expect(JSON.parse(authorUpdate.payload).data.title).toBe('author edited title');

    // Reviewer can modify any article regardless of authorship.
    const reviewerUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(reviewer.token),
      payload: { body: 'reviewer revised body' },
    });
    expect(reviewerUpdate.statusCode).toBe(200);
    expect(JSON.parse(reviewerUpdate.payload).data.body).toBe('reviewer revised body');
  });

  it('supports scheduling approved articles for future publish time', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const articleId = await createDraftArticle(author.token);

    const submit = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleId}/submit-review`,
      headers: authHeader(author.token),
    });
    expect(submit.statusCode).toBe(200);

    const approve = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleId}/approve`,
      headers: authHeader(reviewer.token),
    });
    expect(approve.statusCode).toBe(200);

    const scheduledPublishAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const schedule = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleId}/schedule`,
      headers: authHeader(reviewer.token),
      payload: { scheduledPublishAt },
    });

    expect(schedule.statusCode).toBe(200);
    const body = JSON.parse(schedule.payload);
    expect(body.data.state).toBe('SCHEDULED');
    expect(typeof body.data.scheduledPublishAt).toBe('string');
  });

  it('supports detail reads and category/tag updates for covered CMS resources', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const categoryId = await createCategory(reviewer.token);
    const tagId = await createTag(reviewer.token);
    const articleId = await createDraftArticle(author.token, {
      categoryIds: [categoryId],
      tagIds: [tagId],
    });

    const getArticle = await app.inject({
      method: 'GET',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(author.token),
    });
    expect(getArticle.statusCode).toBe(200);
    const getArticleBody = JSON.parse(getArticle.payload);
    expect(getArticleBody.data.id).toBe(articleId);
    expect(Array.isArray(getArticleBody.data.tags)).toBe(true);
    expect(Array.isArray(getArticleBody.data.categories)).toBe(true);

    const getCategory = await app.inject({
      method: 'GET',
      url: `/api/cms/categories/${categoryId}`,
      headers: authHeader(author.token),
    });
    expect(getCategory.statusCode).toBe(200);
    expect(JSON.parse(getCategory.payload).data.id).toBe(categoryId);

    const patchCategory = await app.inject({
      method: 'PATCH',
      url: `/api/cms/categories/${categoryId}`,
      headers: authHeader(reviewer.token),
      payload: { name: 'Depth Category Updated', isActive: false },
    });
    expect(patchCategory.statusCode).toBe(200);
    const patchCategoryBody = JSON.parse(patchCategory.payload);
    expect(patchCategoryBody.data.name).toBe('Depth Category Updated');
    expect(patchCategoryBody.data.isActive).toBe(false);

    const getTag = await app.inject({
      method: 'GET',
      url: `/api/cms/tags/${tagId}`,
      headers: authHeader(author.token),
    });
    expect(getTag.statusCode).toBe(200);
    expect(JSON.parse(getTag.payload).data.id).toBe(tagId);

    const patchArticle = await app.inject({
      method: 'PATCH',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(author.token),
      payload: { title: 'Depth Article Patched' },
    });
    expect(patchArticle.statusCode).toBe(200);
    expect(JSON.parse(patchArticle.payload).data.title).toBe('Depth Article Patched');
  });

  it('covers reject and withdraw lifecycle transitions end-to-end', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const rejectArticleId = await createDraftArticle(author.token);

    const submitForReject = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${rejectArticleId}/submit-review`,
      headers: authHeader(author.token),
    });
    expect(submitForReject.statusCode).toBe(200);
    expect(JSON.parse(submitForReject.payload).data.state).toBe('IN_REVIEW');

    const reject = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${rejectArticleId}/reject`,
      headers: authHeader(reviewer.token),
    });
    expect(reject.statusCode).toBe(200);
    expect(JSON.parse(reject.payload).data.state).toBe('DRAFT');

    const publishFlowArticleId = await createDraftArticle(author.token);

    const submitForPublish = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${publishFlowArticleId}/submit-review`,
      headers: authHeader(author.token),
    });
    expect(submitForPublish.statusCode).toBe(200);

    const approve = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${publishFlowArticleId}/approve`,
      headers: authHeader(reviewer.token),
    });
    expect(approve.statusCode).toBe(200);
    expect(JSON.parse(approve.payload).data.state).toBe('APPROVED');

    const publish = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${publishFlowArticleId}/publish`,
      headers: authHeader(reviewer.token),
    });
    expect(publish.statusCode).toBe(200);
    expect(JSON.parse(publish.payload).data.state).toBe('PUBLISHED');

    const withdraw = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${publishFlowArticleId}/withdraw`,
      headers: authHeader(reviewer.token),
    });
    expect(withdraw.statusCode).toBe(200);
    expect(JSON.parse(withdraw.payload).data.state).toBe('WITHDRAWN');
  });

  it('returns populated trending and tag cloud responses from published interactions', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const tagA = await createTag(reviewer.token, 'Depth Trending A');
    const tagB = await createTag(reviewer.token, 'Depth Trending B');

    const articleA = await createDraftArticle(author.token, { tagIds: [tagA] });
    const articleB = await createDraftArticle(author.token, { tagIds: [tagB] });

    for (const articleId of [articleA, articleB]) {
      const submit = await app.inject({
        method: 'POST',
        url: `/api/cms/articles/${articleId}/submit-review`,
        headers: authHeader(author.token),
      });
      expect(submit.statusCode).toBe(200);

      const approve = await app.inject({
        method: 'POST',
        url: `/api/cms/articles/${articleId}/approve`,
        headers: authHeader(reviewer.token),
      });
      expect(approve.statusCode).toBe(200);

      const publish = await app.inject({
        method: 'POST',
        url: `/api/cms/articles/${articleId}/publish`,
        headers: authHeader(reviewer.token),
      });
      expect(publish.statusCode).toBe(200);
    }

    // Make tag A trend above tag B.
    for (let i = 0; i < 3; i++) {
      const interaction = await app.inject({
        method: 'POST',
        url: `/api/cms/articles/${articleA}/interactions`,
        headers: authHeader(author.token),
        payload: { type: 'VIEW' },
      });
      expect(interaction.statusCode).toBe(201);
    }

    const interactionB = await app.inject({
      method: 'POST',
      url: `/api/cms/articles/${articleB}/interactions`,
      headers: authHeader(author.token),
      payload: { type: 'COMMENT' },
    });
    expect(interactionB.statusCode).toBe(201);

    const trending = await app.inject({
      method: 'GET',
      url: '/api/cms/tags/trending?windowDays=7&limit=10',
      headers: authHeader(author.token),
    });
    expect(trending.statusCode).toBe(200);
    const trendingBody = JSON.parse(trending.payload);
    expect(Array.isArray(trendingBody.data)).toBe(true);
    expect(trendingBody.data.length).toBeGreaterThan(0);
    const trendA = trendingBody.data.find((t: { tagId: string; count: number }) => t.tagId === tagA);
    const trendB = trendingBody.data.find((t: { tagId: string; count: number }) => t.tagId === tagB);
    expect(trendA).toBeDefined();
    expect(trendB).toBeDefined();
    expect((trendA as { count: number }).count).toBeGreaterThan((trendB as { count: number }).count);

    const cloud = await app.inject({
      method: 'GET',
      url: '/api/cms/tags/cloud',
      headers: authHeader(author.token),
    });
    expect(cloud.statusCode).toBe(200);
    const cloudBody = JSON.parse(cloud.payload);
    expect(Array.isArray(cloudBody.data)).toBe(true);
    expect(cloudBody.data.some((t: { tagId: string }) => t.tagId === tagA)).toBe(true);
    expect(cloudBody.data.some((t: { tagId: string }) => t.tagId === tagB)).toBe(true);
  });

  it('supports aliases and bulk tag migration with article detail verification', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const fromTagId = await createTag(reviewer.token, 'Depth Migrate From');
    const toTagId = await createTag(reviewer.token, 'Depth Migrate To');
    const articleId = await createDraftArticle(author.token, { tagIds: [fromTagId] });

    const addAlias = await app.inject({
      method: 'POST',
      url: `/api/cms/tags/${fromTagId}/aliases`,
      headers: authHeader(reviewer.token),
      payload: { alias: `Depth Alias ${randomUUID().slice(0, 6)}` },
    });
    expect(addAlias.statusCode).toBe(201);
    expect(JSON.parse(addAlias.payload).data.tagId).toBe(fromTagId);

    const migrate = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/bulk-migrate',
      headers: authHeader(reviewer.token),
      payload: { fromTagId, toTagId, articleIds: [articleId] },
    });
    expect(migrate.statusCode).toBe(200);
    const migrateBody = JSON.parse(migrate.payload);
    expect(migrateBody.data.fromTagId).toBe(fromTagId);
    expect(migrateBody.data.toTagId).toBe(toTagId);

    const getArticle = await app.inject({
      method: 'GET',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(author.token),
    });
    expect(getArticle.statusCode).toBe(200);
    const tagIds = (JSON.parse(getArticle.payload).data.tags as Array<{ tag: { id: string } }>).map((t) => t.tag.id);
    expect(tagIds).toContain(toTagId);
    expect(tagIds).not.toContain(fromTagId);
  });

  it('canonicalizes tombstoned tag ids when assigning article tags after merge', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const sourceTagId = await createTag(reviewer.token, 'Depth Merge Source');
    const targetTagId = await createTag(reviewer.token, 'Depth Merge Target');
    const articleId = await createDraftArticle(author.token);

    const merge = await app.inject({
      method: 'POST',
      url: '/api/cms/tags/merge',
      headers: authHeader(reviewer.token),
      payload: { sourceTagId, targetTagId },
    });
    expect(merge.statusCode).toBe(200);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(author.token),
      payload: { tagIds: [sourceTagId] },
    });
    expect(patch.statusCode).toBe(200);

    const article = await app.inject({
      method: 'GET',
      url: `/api/cms/articles/${articleId}`,
      headers: authHeader(author.token),
    });
    expect(article.statusCode).toBe(200);

    const assignedTagIds = (JSON.parse(article.payload).data.tags as Array<{ tag: { id: string } }>).map((t) => t.tag.id);
    expect(assignedTagIds).toContain(targetTagId);
    expect(assignedTagIds).not.toContain(sourceTagId);
  });

  it('returns 400 for invalid article payload when authenticated', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: authHeader(author.token),
      payload: { slug: `missing-title-${randomUUID().slice(0, 6)}`, body: 'Body only' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error.code).toBe('VALIDATION_FAILED');
  });

  it('returns populated list payloads for articles, categories, and tags', async () => {
    const author = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const reviewer = await seedUserWithSession(app, ['CMS_REVIEWER']);

    const categoryId = await createCategory(reviewer.token);
    const tagId = await createTag(reviewer.token, 'Depth List Tag');
    const articleId = await createDraftArticle(author.token, {
      categoryIds: [categoryId],
      tagIds: [tagId],
    });

    const listArticles = await app.inject({
      method: 'GET',
      url: '/api/cms/articles',
      headers: authHeader(author.token),
    });
    expect(listArticles.statusCode).toBe(200);
    const listArticlesBody = JSON.parse(listArticles.payload);
    expect(Array.isArray(listArticlesBody.data)).toBe(true);
    expect(listArticlesBody.data.some((a: { id: string }) => a.id === articleId)).toBe(true);

    const listCategories = await app.inject({
      method: 'GET',
      url: '/api/cms/categories',
      headers: authHeader(author.token),
    });
    expect(listCategories.statusCode).toBe(200);
    const listCategoriesBody = JSON.parse(listCategories.payload);
    expect(Array.isArray(listCategoriesBody.data)).toBe(true);
    expect(listCategoriesBody.data.some((c: { id: string }) => c.id === categoryId)).toBe(true);

    const listTags = await app.inject({
      method: 'GET',
      url: '/api/cms/tags',
      headers: authHeader(author.token),
    });
    expect(listTags.statusCode).toBe(200);
    const listTagsBody = JSON.parse(listTags.payload);
    expect(Array.isArray(listTagsBody.data)).toBe(true);
    expect(listTagsBody.data.some((t: { id: string }) => t.id === tagId)).toBe(true);
  });
});
