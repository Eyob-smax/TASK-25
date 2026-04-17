import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { ArticleState } from '../shared/enums.js';
import { auditTransition } from '../audit/audit.js';
import {
  findScheduledArticlesDue,
  updateArticleState,
} from '../repositories/cms.repository.js';

const INTERVAL_MS = 60_000;

/**
 * Execute a single scheduled-publish pass over CMS articles.
 * Extracted from the interval loop so it can be exercised directly by unit
 * tests: any SCHEDULED article whose `scheduledPublishAt` has elapsed is
 * transitioned to PUBLISHED with a SYSTEM audit transition event.
 */
export async function runCmsPublishPass(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<number> {
  const due = await findScheduledArticlesDue(prisma, now);
  for (const article of due) {
    await updateArticleState(prisma, article.id, ArticleState.PUBLISHED, {
      publishedAt: now,
      scheduledPublishAt: null,
    });
    await auditTransition(
      prisma,
      'SYSTEM',
      'Article',
      article.id,
      ArticleState.SCHEDULED,
      ArticleState.PUBLISHED,
      { reason: 'Scheduled publish' },
    );
    logger.info({ articleId: article.id }, 'Scheduled article published');
  }
  return due.length;
}

export function startCmsPublishScheduler(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await runCmsPublishPass(prisma, logger);
    } catch (err) {
      logger.error({ err }, 'CMS publish scheduler error');
    }
  }, INTERVAL_MS);
}
