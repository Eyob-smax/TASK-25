import { describe, it, expect, vi } from 'vitest';
import {
  listOutboundOrders,
  listWaves,
  updateOutboundOrderStatus,
  updateWaveStatus,
} from '../../src/repositories/outbound.repository.js';

describe('outbound.repository query contracts', () => {
  it('listOutboundOrders applies deleted/facility/status filters', async () => {
    const prisma = {
      outboundOrder: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listOutboundOrders>[0];

    await listOutboundOrders(prisma, { facilityId: 'fac-1', status: 'PICKING' });

    expect((prisma as any).outboundOrder.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        facilityId: 'fac-1',
        status: 'PICKING',
      },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('listWaves applies optional filters', async () => {
    const prisma = {
      wave: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listWaves>[0];

    await listWaves(prisma, { facilityId: 'fac-2', status: 'CREATED' });

    expect((prisma as any).wave.findMany).toHaveBeenCalledWith({
      where: {
        facilityId: 'fac-2',
        status: 'CREATED',
      },
      include: { _count: { select: { pickTasks: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('updateOutboundOrderStatus writes approval metadata when provided', async () => {
    const prisma = {
      outboundOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof updateOutboundOrderStatus>[0];

    const approvedAt = new Date('2026-01-01T00:00:00.000Z');
    await updateOutboundOrderStatus(prisma, 'order-1', 'PICKING', {
      approvedForPartialShip: true,
      approvedBy: 'manager-1',
      approvedAt,
    });

    expect((prisma as any).outboundOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        status: 'PICKING',
        approvedForPartialShip: true,
        approvedBy: 'manager-1',
        approvedAt,
      },
    });
  });

  it('updateWaveStatus updates wave state only', async () => {
    const prisma = {
      wave: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof updateWaveStatus>[0];

    await updateWaveStatus(prisma, 'wave-1', 'CANCELLED');

    expect((prisma as any).wave.update).toHaveBeenCalledWith({
      where: { id: 'wave-1' },
      data: { status: 'CANCELLED' },
    });
  });
});
