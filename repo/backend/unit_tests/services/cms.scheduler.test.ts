import { describe, it, expect, vi } from 'vitest';
import { runCmsPublishPass } from '../../src/services/cms.scheduler.js';

/**
 * `runCmsPublishPass` is the pure pass extracted from the scheduler's
 * `setInterval`. It only touches `article.findMany` (via
 * `findScheduledArticlesDue`), `article.update` (via `updateArticleState`),
 * and `auditEvent.create`, so a small in-memory Prisma double is enough to
 * cover the SCHEDULED → PUBLISHED transition in isolation.
 */
function buildFakePrisma(due: Array<{ id: string; state?: string }>) {
  return {
    article: {
      findMany: vi.fn().mockResolvedValue(due),
      update: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function buildSilentLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  };
}

describe('runCmsPublishPass', () => {
  it('publishes due scheduled articles and records a SYSTEM transition event', async () => {
    const due = [{ id: 'article-1', state: 'SCHEDULED' }];
    const prisma = buildFakePrisma(due);
    const logger = buildSilentLogger();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await runCmsPublishPass(prisma as any, logger as any, new Date());

    expect(count).toBe(1);
    expect(prisma.article.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.article.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.article.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'article-1' });
    expect(updateArg.data.state).toBe('PUBLISHED');
    expect(updateArg.data.scheduledPublishAt).toBeNull();

    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditEvent.create.mock.calls[0][0];
    expect(auditArg.data.resourceType).toBe('Article');
    expect(auditArg.data.resourceId).toBe('article-1');
    expect(auditArg.data.actor).toBe('SYSTEM');
    expect(auditArg.data.action).toBe('TRANSITION');

    expect(logger.info).toHaveBeenCalled();
  });

  it('is a no-op when nothing is due for publishing', async () => {
    const prisma = buildFakePrisma([]);
    const logger = buildSilentLogger();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await runCmsPublishPass(prisma as any, logger as any, new Date());

    expect(count).toBe(0);
    expect(prisma.article.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('processes multiple due articles in one pass', async () => {
    const due = [
      { id: 'article-1', state: 'SCHEDULED' },
      { id: 'article-2', state: 'SCHEDULED' },
    ];
    const prisma = buildFakePrisma(due);
    const logger = buildSilentLogger();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await runCmsPublishPass(prisma as any, logger as any, new Date());

    expect(count).toBe(2);
    expect(prisma.article.update).toHaveBeenCalledTimes(2);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(2);
  });
});
