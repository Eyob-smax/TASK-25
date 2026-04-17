import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { AppointmentState } from '../shared/enums.js';
import { auditTransition } from '../audit/audit.js';
import {
  findExpiredAppointments,
  updateAppointmentState,
  createAppointmentHistoryEntry,
} from '../repositories/warehouse.repository.js';

const INTERVAL_MS = 60_000; // evaluate every minute

/**
 * Execute a single auto-expiry pass over pending appointments.
 * Extracted from the interval loop so it can be exercised directly by unit
 * tests without faking timers: any expired PENDING appointment is moved to
 * EXPIRED with a history entry and an audit transition event.
 */
export async function runAppointmentExpiryPass(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<number> {
  const expired = await findExpiredAppointments(prisma, now);

  for (const appt of expired) {
    await updateAppointmentState(prisma, appt.id, AppointmentState.EXPIRED, { expiredAt: now });
    await createAppointmentHistoryEntry(prisma, {
      appointmentId: appt.id,
      actor: 'SYSTEM',
      priorState: AppointmentState.PENDING,
      newState: AppointmentState.EXPIRED,
      reason: 'Auto-expired: not confirmed within 2 hours',
    });
    await auditTransition(
      prisma,
      'SYSTEM',
      'Appointment',
      appt.id,
      AppointmentState.PENDING,
      AppointmentState.EXPIRED,
      { reason: 'auto-expire' },
    );
  }

  if (expired.length > 0) {
    logger.info({ count: expired.length }, 'Auto-expired appointments');
  }

  return expired.length;
}

export function startAppointmentExpireScheduler(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await runAppointmentExpiryPass(prisma, logger);
    } catch (err) {
      logger.error({ err }, 'Appointment expiry scheduler error');
    }
  }, INTERVAL_MS);
}
