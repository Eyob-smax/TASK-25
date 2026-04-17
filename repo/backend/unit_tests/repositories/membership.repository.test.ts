import { describe, it, expect, vi } from 'vitest';
import {
  findMemberByNumberHash,
  listMembers,
  listPackages,
  listPayments,
  softDeleteMember,
  updatePaymentStatus,
} from '../../src/repositories/membership.repository.js';

describe('membership.repository query contracts', () => {
  it('findMemberByNumberHash performs unique lookup by deterministic hash', async () => {
    const prisma = {
      member: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Parameters<typeof findMemberByNumberHash>[0];

    await findMemberByNumberHash(prisma, 'hash-123');

    expect((prisma as any).member.findUnique).toHaveBeenCalledWith({
      where: { memberNumberHash: 'hash-123' },
    });
  });

  it('listMembers enforces deleted/active filtering based on includeInactive', async () => {
    const prisma = {
      member: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listMembers>[0];

    await listMembers(prisma);
    expect((prisma as any).member.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    await listMembers(prisma, { includeInactive: true });
    expect((prisma as any).member.findMany).toHaveBeenLastCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('softDeleteMember sets deletedAt and disables active flag', async () => {
    const prisma = {
      member: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof softDeleteMember>[0];

    await softDeleteMember(prisma, 'member-1');

    expect((prisma as any).member.update).toHaveBeenCalledTimes(1);
    const arg = (prisma as any).member.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'member-1' });
    expect(arg.data.isActive).toBe(false);
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
  });

  it('listPackages and listPayments apply optional filters correctly', async () => {
    const prisma = {
      membershipPackage: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      paymentRecord: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof listPackages>[0];

    await listPackages(prisma);
    expect((prisma as any).membershipPackage.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    await listPackages(prisma, { includeInactive: true });
    expect((prisma as any).membershipPackage.findMany).toHaveBeenLastCalledWith({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });

    await listPayments(prisma, { memberId: 'mem-1', status: 'SETTLED' });
    expect((prisma as any).paymentRecord.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        memberId: 'mem-1',
        status: 'SETTLED',
      },
      include: { member: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('updatePaymentStatus writes status mutation only', async () => {
    const prisma = {
      paymentRecord: {
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof updatePaymentStatus>[0];

    await updatePaymentStatus(prisma, 'pay-1', 'REFUNDED');

    expect((prisma as any).paymentRecord.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'REFUNDED' },
    });
  });
});
