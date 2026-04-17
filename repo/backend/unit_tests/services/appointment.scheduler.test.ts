import { describe, it, expect, vi } from 'vitest';
import { runAppointmentExpiryPass } from '../../src/services/appointment.scheduler.js';

/**
 * The scheduler's `setInterval` body is extracted into `runAppointmentExpiryPass`
 * so we can exercise the auto-expire branch in isolation without fake timers
 * and without any real SQLite connection. A minimal in-memory Prisma double is
 * adequate because the pass only touches `appointment.findMany`,
 * `appointment.update`, `appointmentOperationHistory.create`, and
 * `auditEvent.create`.
 */
function buildFakePrisma(expired: Array<{ id: string }>) {
  return {
    appointment: {
      findMany: vi.fn().mockResolvedValue(expired),
      update: vi.fn().mockResolvedValue({}),
    },
    appointmentOperationHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function buildSilentLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  };
}

describe('runAppointmentExpiryPass', () => {
  it('transitions each expired PENDING appointment to EXPIRED, writes history, and audits the transition', async () => {
    const expired = [{ id: 'appt-1' }];
    const prisma = buildFakePrisma(expired);
    const logger = buildSilentLogger();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await runAppointmentExpiryPass(prisma as any, logger as any, new Date());

    expect(count).toBe(1);
    expect(prisma.appointment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.appointment.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.appointment.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'appt-1' });
    expect(updateArg.data.state).toBe('EXPIRED');

    expect(prisma.appointmentOperationHistory.create).toHaveBeenCalledTimes(1);
    const historyArg = prisma.appointmentOperationHistory.create.mock.calls[0][0];
    expect(historyArg.data.appointmentId).toBe('appt-1');
    expect(historyArg.data.actor).toBe('SYSTEM');
    expect(historyArg.data.priorState).toBe('PENDING');
    expect(historyArg.data.newState).toBe('EXPIRED');

    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditEvent.create.mock.calls[0][0];
    expect(auditArg.data.resourceType).toBe('Appointment');
    expect(auditArg.data.resourceId).toBe('appt-1');
    expect(auditArg.data.actor).toBe('SYSTEM');

    expect(logger.info).toHaveBeenCalled();
  });

  it('is a no-op when no appointments have expired', async () => {
    const prisma = buildFakePrisma([]);
    const logger = buildSilentLogger();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await runAppointmentExpiryPass(prisma as any, logger as any, new Date());

    expect(count).toBe(0);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(prisma.appointmentOperationHistory.create).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('processes multiple expired appointments individually', async () => {
    const expired = [{ id: 'appt-1' }, { id: 'appt-2' }, { id: 'appt-3' }];
    const prisma = buildFakePrisma(expired);
    const logger = buildSilentLogger();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await runAppointmentExpiryPass(prisma as any, logger as any, new Date());

    expect(count).toBe(3);
    expect(prisma.appointment.update).toHaveBeenCalledTimes(3);
    expect(prisma.appointmentOperationHistory.create).toHaveBeenCalledTimes(3);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(3);
  });
});
