import { describe, it, expect, vi } from 'vitest';
import {
  findInventoryLotsForSku,
  findLocationsForFacility,
  listRulesets,
} from '../../src/repositories/strategy.repository.js';

describe('strategy.repository query contracts', () => {
  it('listRulesets enforces active-only unless includeInactive=true', async () => {
    const prisma = {
      strategyRuleset: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listRulesets>[0];

    await listRulesets(prisma);
    expect((prisma as any).strategyRuleset.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    await listRulesets(prisma, { includeInactive: true });
    expect((prisma as any).strategyRuleset.findMany).toHaveBeenLastCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findLocationsForFacility scopes to active non-deleted rows', async () => {
    const prisma = {
      location: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof findLocationsForFacility>[0];

    await findLocationsForFacility(prisma, 'fac-1');

    expect((prisma as any).location.findMany).toHaveBeenCalledWith({
      where: { facilityId: 'fac-1', isActive: true, deletedAt: null },
      include: { zone: true },
      orderBy: { code: 'asc' },
    });
  });

  it('findInventoryLotsForSku applies onHand/deleted filters and optional location', async () => {
    const prisma = {
      inventoryLot: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof findInventoryLotsForSku>[0];

    await findInventoryLotsForSku(prisma, 'sku-1');
    expect((prisma as any).inventoryLot.findMany).toHaveBeenCalledWith({
      where: {
        skuId: 'sku-1',
        deletedAt: null,
        onHand: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    });

    await findInventoryLotsForSku(prisma, 'sku-1', 'loc-1');
    expect((prisma as any).inventoryLot.findMany).toHaveBeenLastCalledWith({
      where: {
        skuId: 'sku-1',
        deletedAt: null,
        onHand: { gt: 0 },
        locationId: 'loc-1',
      },
      orderBy: { createdAt: 'asc' },
    });
  });
});
