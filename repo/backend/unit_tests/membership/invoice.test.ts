import { describe, it, expect } from 'vitest';
import { generateInvoiceNumber } from '../../src/shared/invariants.js';

describe('generateInvoiceNumber', () => {
  it('generates correct format for sequence 1', () => {
    expect(generateInvoiceNumber(new Date('2026-01-15'), 1)).toBe('GC-20260115-00001');
  });

  it('generates correct format for large sequence', () => {
    expect(generateInvoiceNumber(new Date('2026-12-31'), 99999)).toBe('GC-20261231-99999');
  });

  it('zero-pads day and month', () => {
    expect(generateInvoiceNumber(new Date('2026-01-05'), 42)).toBe('GC-20260105-00042');
  });

  it('zero-pads sequence number', () => {
    expect(generateInvoiceNumber(new Date('2026-01-15'), 0)).toBe('GC-20260115-00000');
  });
});
