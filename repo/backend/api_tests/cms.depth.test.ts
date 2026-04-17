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

  async function createDraftArticle(token: string) {
    const slug = `depth-article-${randomUUID().slice(0, 10)}`;
    const create = await app.inject({
      method: 'POST',
      url: '/api/cms/articles',
      headers: authHeader(token),
      payload: {
        title: `Depth Article ${randomUUID().slice(0, 6)}`,
        slug,
        body: 'Depth article body',
      },
    });
    expect(create.statusCode).toBe(201);
    return JSON.parse(create.payload).data.id as string;
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
});
