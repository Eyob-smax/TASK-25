import { describe, it, expect } from 'vitest';
import {
  isValidAppointmentTransition,
  getAllowedAppointmentTransitions,
  isAppointmentExpireEligible,
} from '../../src/shared/invariants.js';
import { AppointmentState } from '../../src/shared/enums.js';

describe('Appointment state machine — valid transitions', () => {
  it('PENDING → CONFIRMED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.PENDING, AppointmentState.CONFIRMED)).toBe(true);
  });

  it('PENDING → CANCELLED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.PENDING, AppointmentState.CANCELLED)).toBe(true);
  });

  it('PENDING → EXPIRED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.PENDING, AppointmentState.EXPIRED)).toBe(true);
  });

  it('CONFIRMED → RESCHEDULED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.CONFIRMED, AppointmentState.RESCHEDULED)).toBe(true);
  });

  it('CONFIRMED → CANCELLED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.CONFIRMED, AppointmentState.CANCELLED)).toBe(true);
  });

  it('CONFIRMED → EXPIRED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.CONFIRMED, AppointmentState.EXPIRED)).toBe(true);
  });

  it('RESCHEDULED → CONFIRMED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.RESCHEDULED, AppointmentState.CONFIRMED)).toBe(true);
  });

  it('RESCHEDULED → CANCELLED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.RESCHEDULED, AppointmentState.CANCELLED)).toBe(true);
  });

  it('RESCHEDULED → EXPIRED is valid', () => {
    expect(isValidAppointmentTransition(AppointmentState.RESCHEDULED, AppointmentState.EXPIRED)).toBe(true);
  });
});

describe('Appointment state machine — invalid transitions', () => {
  it('PENDING → RESCHEDULED is invalid (must confirm first)', () => {
    expect(isValidAppointmentTransition(AppointmentState.PENDING, AppointmentState.RESCHEDULED)).toBe(false);
  });

  it('CANCELLED → PENDING is invalid (terminal state)', () => {
    expect(isValidAppointmentTransition(AppointmentState.CANCELLED, AppointmentState.PENDING)).toBe(false);
  });

  it('CANCELLED → CONFIRMED is invalid', () => {
    expect(isValidAppointmentTransition(AppointmentState.CANCELLED, AppointmentState.CONFIRMED)).toBe(false);
  });

  it('EXPIRED → PENDING is invalid (terminal state)', () => {
    expect(isValidAppointmentTransition(AppointmentState.EXPIRED, AppointmentState.PENDING)).toBe(false);
  });

  it('EXPIRED → CONFIRMED is invalid', () => {
    expect(isValidAppointmentTransition(AppointmentState.EXPIRED, AppointmentState.CONFIRMED)).toBe(false);
  });

  it('RESCHEDULED → PENDING is invalid', () => {
    expect(isValidAppointmentTransition(AppointmentState.RESCHEDULED, AppointmentState.PENDING)).toBe(false);
  });

  it('CONFIRMED → PENDING is invalid', () => {
    expect(isValidAppointmentTransition(AppointmentState.CONFIRMED, AppointmentState.PENDING)).toBe(false);
  });

  it('RESCHEDULED → RESCHEDULED is invalid', () => {
    expect(isValidAppointmentTransition(AppointmentState.RESCHEDULED, AppointmentState.RESCHEDULED)).toBe(false);
  });

  it('unknown state → any is invalid', () => {
    expect(isValidAppointmentTransition('UNKNOWN', AppointmentState.CONFIRMED)).toBe(false);
  });

  it('any → unknown target is invalid', () => {
    expect(isValidAppointmentTransition(AppointmentState.PENDING, 'UNKNOWN')).toBe(false);
  });
});

describe('getAllowedAppointmentTransitions', () => {
  it('PENDING allows CONFIRMED, CANCELLED, EXPIRED', () => {
    const allowed = getAllowedAppointmentTransitions(AppointmentState.PENDING);
    expect(allowed).toHaveLength(3);
    expect(allowed).toContain(AppointmentState.CONFIRMED);
    expect(allowed).toContain(AppointmentState.CANCELLED);
    expect(allowed).toContain(AppointmentState.EXPIRED);
  });

  it('CONFIRMED allows RESCHEDULED, CANCELLED, EXPIRED', () => {
    const allowed = getAllowedAppointmentTransitions(AppointmentState.CONFIRMED);
    expect(allowed).toHaveLength(3);
    expect(allowed).toContain(AppointmentState.RESCHEDULED);
    expect(allowed).toContain(AppointmentState.CANCELLED);
    expect(allowed).toContain(AppointmentState.EXPIRED);
  });

  it('RESCHEDULED allows CONFIRMED, CANCELLED, EXPIRED', () => {
    const allowed = getAllowedAppointmentTransitions(AppointmentState.RESCHEDULED);
    expect(allowed).toHaveLength(3);
    expect(allowed).toContain(AppointmentState.CONFIRMED);
    expect(allowed).toContain(AppointmentState.CANCELLED);
    expect(allowed).toContain(AppointmentState.EXPIRED);
  });

  it('CANCELLED allows nothing (terminal)', () => {
    expect(getAllowedAppointmentTransitions(AppointmentState.CANCELLED)).toHaveLength(0);
  });

  it('EXPIRED allows nothing (terminal)', () => {
    expect(getAllowedAppointmentTransitions(AppointmentState.EXPIRED)).toHaveLength(0);
  });

  it('unknown state returns empty array', () => {
    expect(getAllowedAppointmentTransitions('UNKNOWN')).toHaveLength(0);
  });
});

describe('isAppointmentExpireEligible', () => {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
  const exactlyTwoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  it('PENDING appointment 3 hours old is eligible', () => {
    expect(isAppointmentExpireEligible(AppointmentState.PENDING, threeHoursAgo)).toBe(true);
  });

  it('PENDING appointment 1 hour old is not eligible', () => {
    expect(isAppointmentExpireEligible(AppointmentState.PENDING, oneHourAgo)).toBe(false);
  });

  it('PENDING appointment exactly 2 hours old is eligible (boundary)', () => {
    expect(isAppointmentExpireEligible(AppointmentState.PENDING, exactlyTwoHoursAgo)).toBe(true);
  });

  it('CONFIRMED appointment 3 hours old is not eligible (wrong state)', () => {
    expect(isAppointmentExpireEligible(AppointmentState.CONFIRMED, threeHoursAgo)).toBe(false);
  });

  it('CANCELLED appointment 3 hours old is not eligible (wrong state)', () => {
    expect(isAppointmentExpireEligible(AppointmentState.CANCELLED, threeHoursAgo)).toBe(false);
  });

  it('RESCHEDULED appointment 3 hours old is not eligible (wrong state)', () => {
    expect(isAppointmentExpireEligible(AppointmentState.RESCHEDULED, threeHoursAgo)).toBe(false);
  });

  it('EXPIRED appointment 3 hours old is not eligible (wrong state)', () => {
    expect(isAppointmentExpireEligible(AppointmentState.EXPIRED, threeHoursAgo)).toBe(false);
  });
});
