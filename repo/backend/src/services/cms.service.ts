import type { PrismaClient } from '@prisma/client';
import { ArticleState } from '../shared/enums.js';
import { ErrorCode } from '../shared/envelope.js';
import { TRENDING_DEFAULTS } from '../shared/types.js';
import {
  isValidArticleTransition,
  normalizeTagName,
} from '../shared/invariants.js';
import { auditCreate, auditUpdate, auditTransition } from '../audit/audit.js';
import {
  createArticle as repoCreateArticle,
  findArticleById,
  findArticleBySlug,
  listArticles as repoListArticles,
  updateArticle as repoUpdateArticle,
  updateArticleState,
  replaceArticleTags,
  replaceArticleCategories,
  findScheduledArticlesDue,
  createInteraction as repoCreateInteraction,
  countInteractionsByTagInWindow,
  countArticlesByTag,
  createCategory as repoCreateCategory,
  findCategoryById,
  findCategoryBySlug,
  listCategories as repoListCategories,
  updateCategory as repoUpdateCategory,
  createTag as repoCreateTag,
  findTagById,
  findTagByNormalizedName,
  listTags as repoListTags,
  updateTag as repoUpdateTag,
  createTagAlias as repoCreateTagAlias,
  reassignArticleTagsFromTo,
  reassignTagAliasesFromTo,
  reassignArticleTagForOneArticle,
} from '../repositories/cms.repository.js';

export class CmsServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CmsServiceError';
  }
}

async function resolveCanonicalTagId(prisma: PrismaClient, tagId: string): Promise<string> {
  let currentId = tagId;
  const visited = new Set<string>();

  while (true) {
    if (visited.has(currentId)) {
      throw new CmsServiceError(ErrorCode.CONFLICT, 'Tag canonical chain contains a cycle');
    }
    visited.add(currentId);

    const tag = await findTagById(prisma, currentId);
    if (!tag) {
      throw new CmsServiceError(ErrorCode.NOT_FOUND, `Tag not found: ${currentId}`);
    }
    if (!tag.isTombstone) {
      return tag.id;
    }
    if (!tag.canonicalTagId) {
      throw new CmsServiceError(
        ErrorCode.CONFLICT,
        `Tombstone tag ${tag.id} has no canonical target; use an active tag id`,
      );
    }
    currentId = tag.canonicalTagId;
  }
}

async function resolveCanonicalTagIds(prisma: PrismaClient, tagIds: string[]): Promise<string[]> {
  const resolved = await Promise.all(tagIds.map((tagId) => resolveCanonicalTagId(prisma, tagId)));
  return Array.from(new Set(resolved));
}

// ---- Article ----

export async function createArticle(
  prisma: PrismaClient,
  data: { title: string; slug: string; body: string; categoryIds?: string[]; tagIds?: string[] },
  actorId: string,
) {
  const existing = await findArticleBySlug(prisma, data.slug);
  if (existing) throw new CmsServiceError(ErrorCode.CONFLICT, 'Article slug already exists');

  const article = await repoCreateArticle(prisma, {
    title: data.title,
    slug: data.slug,
    body: data.body,
    authorId: actorId,
  });

  if (data.categoryIds && data.categoryIds.length > 0) {
    await replaceArticleCategories(prisma, article.id, data.categoryIds);
  }
  if (data.tagIds && data.tagIds.length > 0) {
    const canonicalTagIds = await resolveCanonicalTagIds(prisma, data.tagIds);
    await replaceArticleTags(prisma, article.id, canonicalTagIds);
  }

  await auditCreate(prisma, actorId, 'Article', article.id, { title: article.title, slug: article.slug, state: article.state });
  return findArticleById(prisma, article.id);
}

export async function getArticle(prisma: PrismaClient, articleId: string) {
  const article = await findArticleById(prisma, articleId);
  if (!article) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Article not found');
  return article;
}

export async function listArticles(
  prisma: PrismaClient,
  opts: { state?: string; authorId?: string } = {},
) {
  return repoListArticles(prisma, opts);
}

export async function updateArticle(
  prisma: PrismaClient,
  articleId: string,
  data: { title?: string; slug?: string; body?: string; categoryIds?: string[]; tagIds?: string[] },
  actorId: string,
  actorRoles: string[] = [],
) {
  const existing = await findArticleById(prisma, articleId);
  if (!existing) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Article not found');

  // Object-level authorization: only the article's author, a CMS_REVIEWER, or a
  // SYSTEM_ADMIN may mutate the article. Route-level authentication alone is
  // not enough — any authenticated principal would otherwise pass through.
  const isReviewer = actorRoles.includes('CMS_REVIEWER') || actorRoles.includes('SYSTEM_ADMIN');
  const isAuthor = existing.authorId === actorId;
  if (!isAuthor && !isReviewer) {
    throw new CmsServiceError(
      ErrorCode.FORBIDDEN,
      'Only the article author, CMS_REVIEWER, or SYSTEM_ADMIN can modify this article',
    );
  }

  // Once an article has left the draft/review cycle, non-reviewers should not
  // be able to silently edit it — this keeps already-published content under
  // reviewer oversight.
  if (
    !isReviewer &&
    (existing.state === ArticleState.PUBLISHED || existing.state === ArticleState.WITHDRAWN)
  ) {
    throw new CmsServiceError(
      ErrorCode.FORBIDDEN,
      'Published or withdrawn articles can only be modified by CMS_REVIEWER or SYSTEM_ADMIN',
    );
  }

  if (data.slug && data.slug !== existing.slug) {
    const slugConflict = await findArticleBySlug(prisma, data.slug);
    if (slugConflict) throw new CmsServiceError(ErrorCode.CONFLICT, 'Article slug already exists');
  }

  const before = { title: existing.title, slug: existing.slug, body: existing.body };

  if (data.title !== undefined || data.slug !== undefined || data.body !== undefined) {
    await repoUpdateArticle(prisma, articleId, {
      title: data.title,
      slug: data.slug,
      body: data.body,
    });
  }

  if (data.categoryIds !== undefined) {
    await replaceArticleCategories(prisma, articleId, data.categoryIds);
  }
  if (data.tagIds !== undefined) {
    const canonicalTagIds = await resolveCanonicalTagIds(prisma, data.tagIds);
    await replaceArticleTags(prisma, articleId, canonicalTagIds);
  }

  const updated = await findArticleById(prisma, articleId);
  await auditUpdate(prisma, actorId, 'Article', articleId, before, { title: updated?.title, slug: updated?.slug });
  return updated;
}

export async function transitionArticle(
  prisma: PrismaClient,
  articleId: string,
  newState: string,
  actorId: string,
  extra?: { scheduledPublishAt?: Date },
) {
  const article = await findArticleById(prisma, articleId);
  if (!article) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Article not found');

  if (!isValidArticleTransition(article.state, newState)) {
    throw new CmsServiceError(
      ErrorCode.INVALID_TRANSITION,
      `Cannot transition article from ${article.state} to ${newState}`,
    );
  }

  if (newState === ArticleState.SCHEDULED && !extra?.scheduledPublishAt) {
    throw new CmsServiceError(ErrorCode.VALIDATION_FAILED, 'scheduledPublishAt is required when scheduling an article');
  }

  const now = new Date();
  const timestamps: {
    publishedAt?: Date;
    scheduledPublishAt?: Date | null;
    withdrawnAt?: Date;
    reviewerId?: string | null;
  } = {};

  if (newState === ArticleState.PUBLISHED) {
    timestamps.publishedAt = now;
    timestamps.scheduledPublishAt = null;
  } else if (newState === ArticleState.SCHEDULED) {
    timestamps.scheduledPublishAt = extra!.scheduledPublishAt;
  } else if (newState === ArticleState.WITHDRAWN) {
    timestamps.withdrawnAt = now;
  } else if (newState === ArticleState.IN_REVIEW) {
    timestamps.reviewerId = null;
  }

  await updateArticleState(prisma, articleId, newState, timestamps);
  await auditTransition(prisma, actorId, 'Article', articleId, article.state, newState);
  return findArticleById(prisma, articleId);
}

export async function recordInteraction(
  prisma: PrismaClient,
  articleId: string,
  data: { type: string; userId?: string; sessionId?: string },
  actorId?: string,
) {
  const article = await findArticleById(prisma, articleId);
  if (!article) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Article not found');

  const interaction = await repoCreateInteraction(prisma, {
    articleId,
    userId: data.userId ?? actorId,
    sessionId: data.sessionId,
    type: data.type,
  });

  // Audit the interaction creation; anonymous interactions are attributed to 'ANONYMOUS'.
  await auditCreate(
    prisma,
    actorId ?? data.userId ?? 'ANONYMOUS',
    'ArticleInteraction',
    interaction.id,
    { type: data.type, articleId },
  );

  return interaction;
}

export async function getTrendingTags(
  prisma: PrismaClient,
  limit: number,
) {
  const since = new Date(Date.now() - TRENDING_DEFAULTS.windowDays * 24 * 60 * 60 * 1000);
  return countInteractionsByTagInWindow(prisma, since, limit);
}

export async function getTagCloud(prisma: PrismaClient) {
  return countArticlesByTag(prisma);
}

// ---- Category ----

export async function createCategory(
  prisma: PrismaClient,
  data: { name: string; slug: string; parentId?: string },
  actorId: string,
) {
  const existing = await findCategoryBySlug(prisma, data.slug);
  if (existing) throw new CmsServiceError(ErrorCode.CONFLICT, 'Category slug already exists');

  let depth = 0;
  if (data.parentId) {
    const parent = await findCategoryById(prisma, data.parentId);
    if (!parent) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Parent category not found');
    depth = parent.depth + 1;
  }

  const category = await repoCreateCategory(prisma, {
    name: data.name,
    slug: data.slug,
    parentId: data.parentId,
    depth,
  });

  await auditCreate(prisma, actorId, 'Category', category.id, { name: category.name, slug: category.slug, depth });
  return category;
}

export async function getCategory(prisma: PrismaClient, categoryId: string) {
  const category = await findCategoryById(prisma, categoryId);
  if (!category) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Category not found');
  return category;
}

export async function listCategories(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return repoListCategories(prisma, opts);
}

export async function updateCategory(
  prisma: PrismaClient,
  categoryId: string,
  data: { name?: string; isActive?: boolean },
  actorId: string,
) {
  const before = await findCategoryById(prisma, categoryId);
  if (!before) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Category not found');
  const after = await repoUpdateCategory(prisma, categoryId, data);
  await auditUpdate(prisma, actorId, 'Category', categoryId, { name: before.name, isActive: before.isActive }, { name: after.name, isActive: after.isActive });
  return after;
}

// ---- Tag ----

export async function createTag(
  prisma: PrismaClient,
  data: { name: string },
  actorId: string,
) {
  const normalizedName = normalizeTagName(data.name);
  const existing = await findTagByNormalizedName(prisma, normalizedName);
  if (existing) throw new CmsServiceError(ErrorCode.CONFLICT, 'Tag name already exists');

  const tag = await repoCreateTag(prisma, { name: data.name, normalizedName });
  await auditCreate(prisma, actorId, 'Tag', tag.id, { name: tag.name, normalizedName });
  return tag;
}

export async function getTag(prisma: PrismaClient, tagId: string) {
  const tag = await findTagById(prisma, tagId);
  if (!tag) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Tag not found');
  return tag;
}

export async function listTags(
  prisma: PrismaClient,
  opts: { includeTombstones?: boolean } = {},
) {
  return repoListTags(prisma, opts);
}

export async function addTagAlias(
  prisma: PrismaClient,
  tagId: string,
  alias: string,
  actorId: string,
) {
  const tag = await findTagById(prisma, tagId);
  if (!tag) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Tag not found');
  if (tag.isTombstone) throw new CmsServiceError(ErrorCode.CONFLICT, 'Cannot add alias to tombstone tag');

  const normalizedAlias = normalizeTagName(alias);
  const conflict = await findTagByNormalizedName(prisma, normalizedAlias);
  if (conflict) throw new CmsServiceError(ErrorCode.CONFLICT, 'Alias name conflicts with existing tag');

  const tagAlias = await repoCreateTagAlias(prisma, { tagId, alias, normalizedAlias });
  await auditUpdate(prisma, actorId, 'Tag', tagId, { aliasCount: tag.aliases.length }, { aliasCount: tag.aliases.length + 1 });
  return tagAlias;
}

export async function mergeTags(
  prisma: PrismaClient,
  sourceTagId: string,
  targetTagId: string,
  actorId: string,
) {
  if (sourceTagId === targetTagId) {
    throw new CmsServiceError(ErrorCode.CONFLICT, 'Cannot merge tag into itself');
  }

  const source = await findTagById(prisma, sourceTagId);
  if (!source) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Source tag not found');

  const target = await findTagById(prisma, targetTagId);
  if (!target) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Target tag not found');

  if (source.isTombstone) throw new CmsServiceError(ErrorCode.CONFLICT, 'Source is already a tombstone');
  if (target.isTombstone) throw new CmsServiceError(ErrorCode.CONFLICT, 'Cannot merge into a tombstone tag');

  await reassignArticleTagsFromTo(prisma, sourceTagId, targetTagId);
  await reassignTagAliasesFromTo(prisma, sourceTagId, targetTagId);
  await repoUpdateTag(prisma, sourceTagId, { isTombstone: true, canonicalTagId: targetTagId });

  await auditTransition(prisma, actorId, 'Tag', sourceTagId, 'ACTIVE', 'TOMBSTONE', { canonicalTagId: targetTagId });
  return findTagById(prisma, sourceTagId);
}

export async function bulkMigrateTags(
  prisma: PrismaClient,
  fromTagId: string,
  toTagId: string,
  articleIds: string[] | undefined,
  actorId: string,
) {
  if (fromTagId === toTagId) {
    throw new CmsServiceError(ErrorCode.CONFLICT, 'Source and target tags must be different');
  }

  const fromTag = await findTagById(prisma, fromTagId);
  if (!fromTag) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Source tag not found');

  const toTag = await findTagById(prisma, toTagId);
  if (!toTag) throw new CmsServiceError(ErrorCode.NOT_FOUND, 'Target tag not found');

  if (articleIds && articleIds.length > 0) {
    for (const articleId of articleIds) {
      await reassignArticleTagForOneArticle(prisma, articleId, fromTagId, toTagId);
    }
  } else {
    await reassignArticleTagsFromTo(prisma, fromTagId, toTagId);
  }

  await auditUpdate(prisma, actorId, 'Tag', fromTagId, { taggedAs: fromTagId }, { taggedAs: toTagId });
  return { fromTagId, toTagId, articleIds: articleIds ?? 'all' };
}
