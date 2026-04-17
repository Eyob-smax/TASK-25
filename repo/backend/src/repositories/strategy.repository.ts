import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ---- StrategyRuleset ----

export async function createRuleset(
  prisma: PrismaClient,
  data: {
    name: string;
    description?: string;
    fifoWeight: number;
    fefoWeight: number;
    abcWeight: number;
    heatLevelWeight: number;
    pathCostWeight: number;
    createdBy: string;
  },
) {
  return prisma.strategyRuleset.create({
    data: {
      id: randomUUID(),
      name: data.name,
      description: data.description ?? null,
      fifoWeight: data.fifoWeight,
      fefoWeight: data.fefoWeight,
      abcWeight: data.abcWeight,
      heatLevelWeight: data.heatLevelWeight,
      pathCostWeight: data.pathCostWeight,
      createdBy: data.createdBy,
    },
  });
}

export async function findRulesetById(prisma: PrismaClient, id: string) {
  return prisma.strategyRuleset.findFirst({ where: { id } });
}

export async function listRulesets(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return prisma.strategyRuleset.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateRuleset(
  prisma: PrismaClient,
  id: string,
  data: {
    name?: string;
    description?: string;
    fifoWeight?: number;
    fefoWeight?: number;
    abcWeight?: number;
    heatLevelWeight?: number;
    pathCostWeight?: number;
    isActive?: boolean;
  },
) {
  return prisma.strategyRuleset.update({ where: { id }, data });
}

export async function findActiveRuleset(prisma: PrismaClient) {
  return prisma.strategyRuleset.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
}

// ---- Locations for putaway ranking ----

export async function findLocationsForFacility(prisma: PrismaClient, facilityId: string) {
  return prisma.location.findMany({
    where: { facilityId, isActive: true, deletedAt: null },
    include: { zone: true },
    orderBy: { code: 'asc' },
  });
}

export async function findRecentPickTasksAtLocation(
  prisma: PrismaClient,
  locationId: string,
  since: Date,
) {
  return prisma.pickTask.count({
    where: {
      locationId,
      status: 'COMPLETED',
      completedAt: { gte: since },
    },
  });
}

// ---- Inventory lots for pick scoring ----

export async function findInventoryLotsForSku(
  prisma: PrismaClient,
  skuId: string,
  locationId?: string,
) {
  return prisma.inventoryLot.findMany({
    where: {
      skuId,
      deletedAt: null,
      onHand: { gt: 0 },
      ...(locationId ? { locationId } : {}),
    },
    orderBy: { createdAt: 'asc' }, // FIFO default
  });
}

// ---- Pick tasks for simulation ----

export async function findPickTasksForSimulation(
  prisma: PrismaClient,
  facilityId: string,
  since: Date,
) {
  return prisma.pickTask.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: since },
      wave: { facilityId },
    },
    include: {
      sku: true,
      location: true,
    },
    orderBy: { sequence: 'asc' },
  });
}
