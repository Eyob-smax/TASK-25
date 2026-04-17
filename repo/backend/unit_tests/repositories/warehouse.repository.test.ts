import { describe, it, expect, vi } from 'vitest';
import {
  findFacilityById,
  listFacilities,
  listLocations,
  listSkus,
  softDeleteFacility,
} from '../../src/repositories/warehouse.repository.js';

describe('warehouse.repository query contracts', () => {
  it('findFacilityById includes only non-deleted nested zones and locations', async () => {
    const prisma = {
      facility: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Parameters<typeof findFacilityById>[0];

    await findFacilityById(prisma, 'fac-1');

    expect((prisma as any).facility.findFirst).toHaveBeenCalledWith({
      where: { id: 'fac-1', deletedAt: null },
      include: { zones: { where: { deletedAt: null } }, locations: { where: { deletedAt: null } } },
    });
  });

  it('listFacilities enforces active filter unless includeInactive=true', async () => {
    const prisma = {
      facility: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listFacilities>[0];

    await listFacilities(prisma);
    expect((prisma as any).facility.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    await listFacilities(prisma, { includeInactive: true });
    expect((prisma as any).facility.findMany).toHaveBeenLastCalledWith({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  });

  it('softDeleteFacility marks deletedAt timestamp', async () => {
    const prisma = {
      facility: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof softDeleteFacility>[0];

    await softDeleteFacility(prisma, 'fac-delete-1');

    expect((prisma as any).facility.update).toHaveBeenCalledTimes(1);
    const arg = (prisma as any).facility.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'fac-delete-1' });
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
  });

  it('listLocations applies facility/zone/active filters correctly', async () => {
    const prisma = {
      location: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listLocations>[0];

    await listLocations(prisma, { facilityId: 'fac-1', zoneId: 'zone-1' });
    expect((prisma as any).location.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        facilityId: 'fac-1',
        zoneId: 'zone-1',
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });

    await listLocations(prisma, { includeInactive: true });
    expect((prisma as any).location.findMany).toHaveBeenLastCalledWith({
      where: {
        deletedAt: null,
      },
      orderBy: { code: 'asc' },
    });
  });

  it('listSkus applies includeInactive flag as intended', async () => {
    const prisma = {
      sku: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listSkus>[0];

    await listSkus(prisma);
    expect((prisma as any).sku.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
    });

    await listSkus(prisma, { includeInactive: true });
    expect((prisma as any).sku.findMany).toHaveBeenLastCalledWith({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  });
});
