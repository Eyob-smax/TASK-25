import { describe, it, expect } from 'vitest';
import { computeShortageQuantity } from '../../src/shared/invariants.js';
import { ShortageReason, OrderLineType, PickTaskStatus } from '../../src/shared/enums.js';

// ---- computeShortageQuantity ----

describe('computeShortageQuantity', () => {
  it('returns shortage when quantityPicked < taskQuantity', () => {
    expect(computeShortageQuantity(10, 7)).toBe(3);
  });

  it('returns 0 shortage when all units picked', () => {
    expect(computeShortageQuantity(10, 10)).toBe(0);
  });

  it('returns full quantity as shortage when nothing picked', () => {
    expect(computeShortageQuantity(10, 0)).toBe(10);
  });

  it('returns null for invalid taskQuantity (0)', () => {
    expect(computeShortageQuantity(0, 0)).toBeNull();
  });

  it('returns null for negative taskQuantity', () => {
    expect(computeShortageQuantity(-1, 0)).toBeNull();
  });

  it('returns null for negative quantityPicked', () => {
    expect(computeShortageQuantity(10, -1)).toBeNull();
  });

  it('returns null when quantityPicked > taskQuantity (overpick)', () => {
    expect(computeShortageQuantity(10, 15)).toBeNull();
  });

  it('handles single-unit task with no pick', () => {
    expect(computeShortageQuantity(1, 0)).toBe(1);
  });

  it('handles single-unit task with full pick', () => {
    expect(computeShortageQuantity(1, 1)).toBe(0);
  });
});

// ---- ShortageReason enum coverage ----

describe('ShortageReason enum — business meaning', () => {
  it('STOCKOUT is a valid shortage reason', () => {
    expect(ShortageReason.STOCKOUT).toBe('STOCKOUT');
  });

  it('DAMAGE is a valid shortage reason', () => {
    expect(ShortageReason.DAMAGE).toBe('DAMAGE');
  });

  it('OVERSELL is a valid shortage reason', () => {
    expect(ShortageReason.OVERSELL).toBe('OVERSELL');
  });

  it('has exactly 3 shortage reasons', () => {
    expect(Object.values(ShortageReason)).toHaveLength(3);
  });
});

// ---- Backorder line type ----

describe('OrderLineType — backorder semantics', () => {
  it('BACKORDER line type distinguishes backorder lines from standard', () => {
    expect(OrderLineType.BACKORDER).toBe('BACKORDER');
    expect(OrderLineType.STANDARD).toBe('STANDARD');
  });

  it('has exactly 2 line types', () => {
    expect(Object.values(OrderLineType)).toHaveLength(2);
  });
});

// ---- PickTask terminal states for wave completion ----

describe('PickTaskStatus — terminal states for wave auto-completion', () => {
  const TERMINAL_PICK_STATES = new Set([
    PickTaskStatus.COMPLETED,
    PickTaskStatus.SHORT,
    PickTaskStatus.CANCELLED,
  ]);

  it('COMPLETED is a terminal state', () => {
    expect(TERMINAL_PICK_STATES.has(PickTaskStatus.COMPLETED)).toBe(true);
  });

  it('SHORT is a terminal state (triggers backorder)', () => {
    expect(TERMINAL_PICK_STATES.has(PickTaskStatus.SHORT)).toBe(true);
  });

  it('CANCELLED is a terminal state', () => {
    expect(TERMINAL_PICK_STATES.has(PickTaskStatus.CANCELLED)).toBe(true);
  });

  it('PENDING is NOT a terminal state (wave stays open)', () => {
    expect(TERMINAL_PICK_STATES.has(PickTaskStatus.PENDING)).toBe(false);
  });

  it('IN_PROGRESS is NOT a terminal state (wave stays open)', () => {
    expect(TERMINAL_PICK_STATES.has(PickTaskStatus.IN_PROGRESS)).toBe(false);
  });

  it('wave completes when ALL tasks reach terminal state', () => {
    const tasks = [
      PickTaskStatus.COMPLETED,
      PickTaskStatus.SHORT,
      PickTaskStatus.CANCELLED,
    ];
    const allTerminal = tasks.every((s) => TERMINAL_PICK_STATES.has(s));
    expect(allTerminal).toBe(true);
  });

  it('wave stays open when ANY task is non-terminal', () => {
    const tasks = [PickTaskStatus.COMPLETED, PickTaskStatus.IN_PROGRESS];
    const allTerminal = tasks.every((s) => TERMINAL_PICK_STATES.has(s));
    expect(allTerminal).toBe(false);
  });
});
