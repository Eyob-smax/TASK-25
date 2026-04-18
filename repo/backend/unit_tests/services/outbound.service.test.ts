import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/repositories/outbound.repository.js', () => ({
  createOutboundOrder: vi.fn(),
  findOutboundOrderById: vi.fn(),
  findOutboundOrderByIdScoped: vi.fn(),
  listOutboundOrders: vi.fn(),
  updateOutboundOrderStatus: vi.fn(),
  findOutboundOrderLineById: vi.fn(),
  updateOrderLine: vi.fn(),
  createBackorderLine: vi.fn(),
  findIdempotencyRecord: vi.fn(),
  createIdempotencyRecord: vi.fn(),
  updateIdempotencyResponseBody: vi.fn(),
  replaceExpiredIdempotencyRecord: vi.fn(),
  createWave: vi.fn(),
  findWaveById: vi.fn(),
  findWaveByIdScoped: vi.fn(),
  listWaves: vi.fn(),
  updateWaveStatus: vi.fn(),
  findPickTaskById: vi.fn(),
  updatePickTask: vi.fn(),
  listPickTasksByWave: vi.fn(),
  createPackVerification: vi.fn(),
  createHandoffRecord: vi.fn(),
}));

vi.mock('../../src/repositories/warehouse.repository.js', () => ({
  findFacilityById: vi.fn(),
  findSkuById: vi.fn(),
  findInventoryLotById: vi.fn(),
}));

vi.mock('../../src/repositories/strategy.repository.js', () => ({
  findInventoryLotsForSku: vi.fn(),
}));

vi.mock('../../src/audit/audit.js', () => ({
  auditCreate: vi.fn(),
  auditUpdate: vi.fn(),
}));

import {
  createOutboundOrder,
  OutboundServiceError,
  updatePickTask as updatePickTaskService,
} from '../../src/services/outbound.service.js';
import { findFacilityById } from '../../src/repositories/warehouse.repository.js';
import {
  findPickTaskById,
  updatePickTask as repoUpdatePickTask,
  updateOrderLine,
  createBackorderLine,
  listPickTasksByWave,
  updateWaveStatus,
} from '../../src/repositories/outbound.repository.js';
import { auditCreate, auditUpdate } from '../../src/audit/audit.js';

const mockedFindFacilityById = vi.mocked(findFacilityById);
const mockedFindPickTaskById = vi.mocked(findPickTaskById);
const mockedRepoUpdatePickTask = vi.mocked(repoUpdatePickTask);
const mockedUpdateOrderLine = vi.mocked(updateOrderLine);
const mockedCreateBackorderLine = vi.mocked(createBackorderLine);
const mockedListPickTasksByWave = vi.mocked(listPickTasksByWave);
const mockedUpdateWaveStatus = vi.mocked(updateWaveStatus);
const mockedAuditCreate = vi.mocked(auditCreate);
const mockedAuditUpdate = vi.mocked(auditUpdate);

describe('outbound.service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('createOutboundOrder throws NOT_FOUND when facility does not exist', async () => {
    mockedFindFacilityById.mockResolvedValue(null as never);

    await expect(
      createOutboundOrder(
        {} as never,
        {
          facilityId: 'missing-facility',
          type: 'STANDARD',
          lines: [],
        },
        'actor-1',
      ),
    ).rejects.toMatchObject<Partial<OutboundServiceError>>({
      code: 'NOT_FOUND',
      message: 'Facility not found',
    });
  });

  it('updatePickTask(COMPLETED) audits order-line fulfillment side effect', async () => {
    mockedFindPickTaskById
      .mockResolvedValueOnce({
        id: 'task-1',
        waveId: 'wave-1',
        orderId: 'order-1',
        orderLineId: 'line-1',
        skuId: 'sku-1',
        quantity: 5,
        quantityPicked: 0,
        status: 'IN_PROGRESS',
        orderLine: {
          quantityFulfilled: 0,
          quantityShort: 0,
          shortageReason: null,
        },
        wave: { status: 'IN_PROGRESS' },
      } as never)
      .mockResolvedValueOnce({
        id: 'task-1',
        status: 'COMPLETED',
        quantityPicked: 5,
      } as never);

    mockedRepoUpdatePickTask.mockResolvedValue({} as never);
    mockedUpdateOrderLine.mockResolvedValue({ quantityFulfilled: 5 } as never);
    mockedListPickTasksByWave.mockResolvedValue([
      { id: 'task-1', status: 'COMPLETED' },
      { id: 'task-2', status: 'IN_PROGRESS' },
    ] as never);

    await updatePickTaskService(
      {} as never,
      'task-1',
      { status: 'COMPLETED', quantityPicked: 5 },
      'actor-1',
      { userId: 'actor-1', roles: ['SYSTEM_ADMIN'] } as never,
    );

    expect(mockedUpdateOrderLine).toHaveBeenCalledWith(
      {} as never,
      'line-1',
      { quantityFulfilled: 5 },
    );
    expect(mockedAuditUpdate).toHaveBeenCalledWith(
      {} as never,
      'actor-1',
      'OutboundOrderLine',
      'line-1',
      { quantityFulfilled: 0 },
      { quantityFulfilled: 5 },
      expect.objectContaining({
        reason: 'pick-task-completed',
        pickTaskId: 'task-1',
        waveId: 'wave-1',
      }),
    );
    expect(mockedAuditCreate).not.toHaveBeenCalled();
  });

  it('updatePickTask(SHORT) audits shortage update and backorder creation side effects', async () => {
    mockedFindPickTaskById
      .mockResolvedValueOnce({
        id: 'task-1',
        waveId: 'wave-1',
        orderId: 'order-1',
        orderLineId: 'line-1',
        skuId: 'sku-1',
        quantity: 10,
        quantityPicked: 0,
        status: 'IN_PROGRESS',
        orderLine: {
          quantityFulfilled: 0,
          quantityShort: 0,
          shortageReason: null,
        },
        wave: { status: 'IN_PROGRESS' },
      } as never)
      .mockResolvedValueOnce({
        id: 'task-1',
        status: 'SHORT',
        quantityPicked: 6,
      } as never);

    mockedRepoUpdatePickTask.mockResolvedValue({} as never);
    mockedUpdateOrderLine.mockResolvedValue({
      quantityShort: 4,
      shortageReason: 'STOCKOUT',
    } as never);
    mockedCreateBackorderLine.mockResolvedValue({ id: 'backorder-1' } as never);
    mockedListPickTasksByWave.mockResolvedValue([
      { id: 'task-1', status: 'SHORT' },
      { id: 'task-2', status: 'IN_PROGRESS' },
    ] as never);

    await updatePickTaskService(
      {} as never,
      'task-1',
      { status: 'SHORT', quantityPicked: 6 },
      'actor-1',
      { userId: 'actor-1', roles: ['SYSTEM_ADMIN'] } as never,
    );

    expect(mockedUpdateOrderLine).toHaveBeenCalledWith(
      {} as never,
      'line-1',
      { quantityShort: 4, shortageReason: 'STOCKOUT' },
    );
    expect(mockedAuditUpdate).toHaveBeenCalledWith(
      {} as never,
      'actor-1',
      'OutboundOrderLine',
      'line-1',
      { quantityShort: 0, shortageReason: null },
      { quantityShort: 4, shortageReason: 'STOCKOUT' },
      expect.objectContaining({
        reason: 'pick-task-shortage',
        pickTaskId: 'task-1',
        waveId: 'wave-1',
      }),
    );
    expect(mockedAuditCreate).toHaveBeenCalledWith(
      {} as never,
      'actor-1',
      'OutboundOrderLine',
      'backorder-1',
      expect.objectContaining({ id: 'backorder-1' }),
      expect.objectContaining({
        reason: 'pick-task-shortage-backorder',
        sourceLineId: 'line-1',
      }),
    );
  });

  it('updatePickTask audits wave completion transition when all tasks are terminal', async () => {
    mockedFindPickTaskById
      .mockResolvedValueOnce({
        id: 'task-1',
        waveId: 'wave-1',
        orderId: 'order-1',
        orderLineId: 'line-1',
        skuId: 'sku-1',
        quantity: 3,
        quantityPicked: 0,
        status: 'IN_PROGRESS',
        orderLine: {
          quantityFulfilled: 0,
          quantityShort: 0,
          shortageReason: null,
        },
        wave: { status: 'IN_PROGRESS' },
      } as never)
      .mockResolvedValueOnce({
        id: 'task-1',
        status: 'COMPLETED',
        quantityPicked: 3,
      } as never);

    mockedRepoUpdatePickTask.mockResolvedValue({} as never);
    mockedUpdateOrderLine.mockResolvedValue({ quantityFulfilled: 3 } as never);
    mockedListPickTasksByWave.mockResolvedValue([
      { id: 'task-1', status: 'COMPLETED' },
      { id: 'task-2', status: 'SHORT' },
    ] as never);
    mockedUpdateWaveStatus.mockResolvedValue({} as never);

    await updatePickTaskService(
      {} as never,
      'task-1',
      { status: 'COMPLETED', quantityPicked: 3 },
      'actor-1',
      { userId: 'actor-1', roles: ['SYSTEM_ADMIN'] } as never,
    );

    expect(mockedUpdateWaveStatus).toHaveBeenCalledWith({} as never, 'wave-1', 'COMPLETED');
    expect(mockedAuditUpdate).toHaveBeenCalledWith(
      {} as never,
      'actor-1',
      'Wave',
      'wave-1',
      { status: 'IN_PROGRESS' },
      { status: 'COMPLETED' },
      expect.objectContaining({ reason: 'all-pick-tasks-terminal' }),
    );
  });
});
