import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ---- Category ----

export async function createCategory(
  prisma: PrismaClient,
  data: { name: string; slug: string; parentId?: string; depth: number },
) {
  return prisma.category.create({
    data: {
      id: randomUUID(),
      name: data.name,
      slug: data.slug,
      parentId: data.parentId ?? null,
      depth: data.depth,
    },
    include: { parent: true },
  });
}

export async function findCategoryById(prisma: PrismaClient, id: string) {
  return prisma.category.findFirst({
    where: { id, deletedAt: null },
    include: { parent: true, children: { where: { deletedAt: null } } },
  });
}

export async function findCategoryBySlug(prisma: PrismaClient, slug: string) {
  return prisma.category.findFirst({ where: { slug, deletedAt: null } });
}

export async function listCategories(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return prisma.category.findMany({
    where: {
      deletedAt: null,
      ...(opts.includeInactive ? {} : { isActive: true }),
    },
    include: { parent: true },
    orderBy: [{ depth: 'asc' }, { name: 'asc' }],
  });
}

export async function updateCategory(
  prisma: PrismaClient,
  id: string,
  data: { name?: string; isActive?: boolean },
) {
  return prisma.category.update({ where: { id }, data });
}

// ---- Tag ----

export async function createTag(
  prisma: PrismaClient,
  data: { name: string; normalizedName: string },
) {
  return prisma.tag.create({
    data: { id: randomUUID(), name: data.name, normalizedName: data.normalizedName },
    include: { aliases: true },
  });
}

export async function findTagById(prisma: PrismaClient, id: string) {
  return prisma.tag.findFirst({
    where: { id, deletedAt: null },
    include: { aliases: true, canonicalTag: true, mergedFrom: true },
  });
}

export async function findTagByNormalizedName(prisma: PrismaClient, normalizedName: string) {
  return prisma.tag.findFirst({ where: { normalizedName, deletedAt: null } });
}

export async function listTags(
  prisma: PrismaClient,
  opts: { includeTombstones?: boolean } = {},
) {
  return prisma.tag.findMany({
    where: {
      deletedAt: null,
      ...(opts.includeTombstones ? {} : { isTombstone: false }),
    },
    include: { aliases: true },
    orderBy: { name: 'asc' },
  });
}

export async function updateTag(
  prisma: PrismaClient,
  id: string,
  data: { isTombstone?: boolean; canonicalTagId?: string },
) {
  return prisma.tag.update({ where: { id }, data });
}

export async function createTagAlias(
  prisma: PrismaClient,
  data: { tagId: string; alias: string; normalizedAlias: string },
) {
  return prisma.tagAlias.create({
    data: { id: randomUUID(), tagId: data.tagId, alias: data.alias, normalizedAlias: data.normalizedAlias },
  });
}

export async function findTagAliasesByTagId(prisma: PrismaClient, tagId: string) {
  return prisma.tagAlias.findMany({ where: { tagId } });
}

export async function reassignArticleTagsFromTo(
  prisma: PrismaClient,
  fromTagId: string,
  toTagId: string,
) {
  // Find all article tags for fromTag
  const sourceTags = await prisma.articleTag.findMany({ where: { tagId: fromTagId } });
  for (const at of sourceTags) {
    // Check if target already has this article tagged
    const existing = await prisma.articleTag.findFirst({
      where: { articleId: at.articleId, tagId: toTagId },
    });
    if (!existing) {
      // Move: create new ArticleTag with target
      await prisma.articleTag.create({
        data: { id: randomUUID(), articleId: at.articleId, tagId: toTagId },
      });
    }
    // Delete source article tag
    await prisma.articleTag.delete({ where: { id: at.id } });
  }
}

export async function reassignArticleTagForOneArticle(
  prisma: PrismaClient,
  articleId: string,
  fromTagId: string,
  toTagId: string,
) {
  const existing = await prisma.articleTag.findFirst({ where: { articleId, tagId: toTagId } });
  if (!existing) {
    await prisma.articleTag.create({ data: { id: randomUUID(), articleId, tagId: toTagId } });
  }
  await prisma.articleTag.deleteMany({ where: { articleId, tagId: fromTagId } });
}

export async function reassignTagAliasesFromTo(
  prisma: PrismaClient,
  fromTagId: string,
  toTagId: string,
) {
  await prisma.tagAlias.updateMany({ where: { tagId: fromTagId }, data: { tagId: toTagId } });
}

// ---- Article ----

export async function createArticle(
  prisma: PrismaClient,
  data: { title: string; slug: string; body: string; authorId: string },
) {
  return prisma.article.create({
    data: {
      id: randomUUID(),
      title: data.title,
      slug: data.slug,
      body: data.body,
      authorId: data.authorId,
      state: 'DRAFT',
    },
    include: { author: true, tags: { include: { tag: true } }, categories: { include: { category: true } } },
  });
}

export async function findArticleById(prisma: PrismaClient, id: string) {
  return prisma.article.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: true,
      reviewer: true,
      tags: { include: { tag: { include: { aliases: true } } } },
      categories: { include: { category: true } },
    },
  });
}

export async function findArticleBySlug(prisma: PrismaClient, slug: string) {
  return prisma.article.findFirst({ where: { slug, deletedAt: null } });
}

export async function listArticles(
  prisma: PrismaClient,
  opts: { state?: string; authorId?: string } = {},
) {
  return prisma.article.findMany({
    where: {
      deletedAt: null,
      ...(opts.state ? { state: opts.state } : {}),
      ...(opts.authorId ? { authorId: opts.authorId } : {}),
    },
    include: { author: true, tags: { include: { tag: true } } },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function updateArticle(
  prisma: PrismaClient,
  id: string,
  data: { title?: string; slug?: string; body?: string },
) {
  return prisma.article.update({ where: { id }, data });
}

export async function updateArticleState(
  prisma: PrismaClient,
  id: string,
  newState: string,
  timestamps: {
    publishedAt?: Date;
    scheduledPublishAt?: Date | null;
    withdrawnAt?: Date;
    reviewerId?: string | null;
  } = {},
) {
  return prisma.article.update({ where: { id }, data: { state: newState, ...timestamps } });
}

export async function replaceArticleTags(
  prisma: PrismaClient,
  articleId: string,
  tagIds: string[],
) {
  await prisma.articleTag.deleteMany({ where: { articleId } });
  if (tagIds.length > 0) {
    await prisma.articleTag.createMany({
      data: tagIds.map((tagId) => ({ id: randomUUID(), articleId, tagId })),
    });
  }
}

export async function replaceArticleCategories(
  prisma: PrismaClient,
  articleId: string,
  categoryIds: string[],
) {
  await prisma.articleCategory.deleteMany({ where: { articleId } });
  if (categoryIds.length > 0) {
    await prisma.articleCategory.createMany({
      data: categoryIds.map((categoryId) => ({ id: randomUUID(), articleId, categoryId })),
    });
  }
}

export async function findScheduledArticlesDue(prisma: PrismaClient, now: Date) {
  return prisma.article.findMany({
    where: {
      state: 'SCHEDULED',
      scheduledPublishAt: { lte: now },
      deletedAt: null,
    },
  });
}

// ---- ArticleInteraction ----

export async function createInteraction(
  prisma: PrismaClient,
  data: { articleId: string; userId?: string; sessionId?: string; type: string },
) {
  return prisma.articleInteraction.create({
    data: {
      id: randomUUID(),
      articleId: data.articleId,
      userId: data.userId ?? null,
      sessionId: data.sessionId ?? null,
      type: data.type,
    },
  });
}

export async function countInteractionsByTagInWindow(
  prisma: PrismaClient,
  since: Date,
  limit: number,
) {
  // Count interactions per tag via article→articleTag→tag join
  const interactions = await prisma.articleInteraction.findMany({
    where: { createdAt: { gte: since } },
    include: {
      article: {
        include: { tags: { include: { tag: true } } },
      },
    },
  });

  // Aggregate counts per tag
  const counts: Record<string, { tagId: string; name: string; count: number }> = {};
  for (const interaction of interactions) {
    for (const articleTag of interaction.article.tags) {
      if (articleTag.tag.isTombstone) continue;
      const tagId = articleTag.tag.id;
      if (!counts[tagId]) {
        counts[tagId] = { tagId, name: articleTag.tag.name, count: 0 };
      }
      counts[tagId].count++;
    }
  }

  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function countArticlesByTag(prisma: PrismaClient) {
  const articleTags = await prisma.articleTag.findMany({
    where: { article: { state: 'PUBLISHED', deletedAt: null } },
    include: { tag: true },
  });

  const counts: Record<string, { tagId: string; name: string; count: number }> = {};
  for (const at of articleTags) {
    if (at.tag.isTombstone) continue;
    const tagId = at.tag.id;
    if (!counts[tagId]) {
      counts[tagId] = { tagId, name: at.tag.name, count: 0 };
    }
    counts[tagId].count++;
  }

  return Object.values(counts).sort((a, b) => b.count - a.count);
}
