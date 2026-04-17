import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Warehouse depth — role checks and appointment transitions', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('operator gets 403 for facility create while manager succeeds with 201', async () => {
    const operator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);

    const operatorAttempt = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: authHeader(operator.token),
      payload: {
        name: `Depth Facility ${randomUUID().slice(0, 8)}`,
        code: `FAC-OP-${randomUUID().slice(0, 6)}`,
      },
    });
    expect(operatorAttempt.statusCode).toBe(403);
    expect(JSON.parse(operatorAttempt.payload).error.code).toBe('FORBIDDEN');

    const managerAttempt = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: authHeader(manager.token),
      payload: {
        name: `Depth Facility ${randomUUID().slice(0, 8)}`,
        code: `FAC-MGR-${randomUUID().slice(0, 6)}`,
      },
    });
    expect(managerAttempt.statusCode).toBe(201);
    const body = JSON.parse(managerAttempt.payload);
    expect(body.success).toBe(true);
    expect(typeof body.data.id).toBe('string');
  });

  it('illegal appointment transition returns 409 INVALID_TRANSITION', async () => {
    const manager = await seedUserWithSession(app, ['WAREHOUSE_MANAGER']);

    const facilityCode = `FAC-APT-${randomUUID().slice(0, 6)}`;
    const createFacility = await app.inject({
      method: 'POST',
      url: '/api/warehouse/facilities',
      headers: authHeader(manager.token),
      payload: {
        name: `Appointment Facility ${randomUUID().slice(0, 8)}`,
        code: facilityCode,
      },
    });
    expect(createFacility.statusCode).toBe(201);
    const facilityId = JSON.parse(createFacility.payload).data.id as string;

    const createAppointment = await app.inject({
      method: 'POST',
      url: '/api/warehouse/appointments',
      headers: authHeader(manager.token),
      payload: {
        facilityId,
        type: 'INBOUND',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(createAppointment.statusCode).toBe(201);
    const appointmentId = JSON.parse(createAppointment.payload).data.id as string;

    // PENDING -> RESCHEDULED is illegal; appointment must be CONFIRMED first.
    const illegalTransition = await app.inject({
      method: 'POST',
      url: `/api/warehouse/appointments/${appointmentId}/reschedule`,
      headers: authHeader(manager.token),
      payload: {
        reason: 'Skipping required states',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    });

    expect(illegalTransition.statusCode).toBe(409);
    const illegalBody = JSON.parse(illegalTransition.payload);
    expect(illegalBody.error.code).toBe('INVALID_TRANSITION');
  });
});
