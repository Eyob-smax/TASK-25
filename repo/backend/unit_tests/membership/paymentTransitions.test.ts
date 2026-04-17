import { describe, it, expect } from 'vitest';
import {
  isValidPaymentTransition,
  getAllowedPaymentTransitions,
} from '../../src/shared/invariants.js';
import { PaymentStatus } from '../../src/shared/enums.js';

// ---- isValidPaymentTransition ----

describe('isValidPaymentTransition — valid paths', () => {
  it('RECORDED → SETTLED is valid', () => {
    expect(isValidPaymentTransition(PaymentStatus.RECORDED, PaymentStatus.SETTLED)).toBe(true);
  });

  it('RECORDED → VOIDED is valid', () => {
    expect(isValidPaymentTransition(PaymentStatus.RECORDED, PaymentStatus.VOIDED)).toBe(true);
  });

  it('SETTLED → REFUNDED is valid', () => {
    expect(isValidPaymentTransition(PaymentStatus.SETTLED, PaymentStatus.REFUNDED)).toBe(true);
  });
});

describe('isValidPaymentTransition — invalid paths', () => {
  it('RECORDED → REFUNDED is invalid (must settle first)', () => {
    expect(isValidPaymentTransition(PaymentStatus.RECORDED, PaymentStatus.REFUNDED)).toBe(false);
  });

  it('VOIDED → SETTLED is invalid (terminal)', () => {
    expect(isValidPaymentTransition(PaymentStatus.VOIDED, PaymentStatus.SETTLED)).toBe(false);
  });

  it('VOIDED → REFUNDED is invalid (terminal)', () => {
    expect(isValidPaymentTransition(PaymentStatus.VOIDED, PaymentStatus.REFUNDED)).toBe(false);
  });

  it('REFUNDED → SETTLED is invalid (terminal)', () => {
    expect(isValidPaymentTransition(PaymentStatus.REFUNDED, PaymentStatus.SETTLED)).toBe(false);
  });

  it('REFUNDED → RECORDED is invalid (terminal)', () => {
    expect(isValidPaymentTransition(PaymentStatus.REFUNDED, PaymentStatus.RECORDED)).toBe(false);
  });

  it('SETTLED → VOIDED is invalid (can only void from RECORDED)', () => {
    expect(isValidPaymentTransition(PaymentStatus.SETTLED, PaymentStatus.VOIDED)).toBe(false);
  });

  it('unknown → SETTLED is invalid', () => {
    expect(isValidPaymentTransition('UNKNOWN', PaymentStatus.SETTLED)).toBe(false);
  });

  it('RECORDED → unknown is invalid', () => {
    expect(isValidPaymentTransition(PaymentStatus.RECORDED, 'UNKNOWN')).toBe(false);
  });

  it('same state → same state is invalid (no self-transitions)', () => {
    expect(isValidPaymentTransition(PaymentStatus.RECORDED, PaymentStatus.RECORDED)).toBe(false);
    expect(isValidPaymentTransition(PaymentStatus.SETTLED, PaymentStatus.SETTLED)).toBe(false);
  });
});

// ---- getAllowedPaymentTransitions ----

describe('getAllowedPaymentTransitions', () => {
  it('RECORDED allows SETTLED and VOIDED', () => {
    const allowed = getAllowedPaymentTransitions(PaymentStatus.RECORDED);
    expect(allowed).toHaveLength(2);
    expect(allowed).toContain(PaymentStatus.SETTLED);
    expect(allowed).toContain(PaymentStatus.VOIDED);
  });

  it('SETTLED allows only REFUNDED', () => {
    const allowed = getAllowedPaymentTransitions(PaymentStatus.SETTLED);
    expect(allowed).toHaveLength(1);
    expect(allowed).toContain(PaymentStatus.REFUNDED);
  });

  it('VOIDED allows nothing (terminal)', () => {
    expect(getAllowedPaymentTransitions(PaymentStatus.VOIDED)).toHaveLength(0);
  });

  it('REFUNDED allows nothing (terminal)', () => {
    expect(getAllowedPaymentTransitions(PaymentStatus.REFUNDED)).toHaveLength(0);
  });

  it('unknown state returns empty array', () => {
    expect(getAllowedPaymentTransitions('UNKNOWN')).toHaveLength(0);
  });
});
