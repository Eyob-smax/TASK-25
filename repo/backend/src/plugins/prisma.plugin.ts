import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

interface PrismaPluginOptions {
  databaseUrl: string;
}

const prismaPlugin: FastifyPluginAsync<PrismaPluginOptions> = async (fastify, opts) => {
  const prisma = new PrismaClient({
    datasources: { db: { url: opts.databaseUrl } },
    log: [],
  });

  // Enable WAL mode for concurrent reads alongside one writer,
  // and set a busy timeout to avoid immediate lock errors under write load.
  await prisma.$executeRaw`PRAGMA journal_mode=WAL`;
  await prisma.$executeRaw`PRAGMA busy_timeout=5000`;

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin, { name: 'prisma' });
