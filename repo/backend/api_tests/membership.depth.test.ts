import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { TEST_CONFIG, seedUserWithSession, authHeader } from './_helpers.js';

describe('Membership depth — role authorization and masking behavior', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: TEST_CONFIG });
  });

  afterEach(async () => {
    await app.close();
  });

  it('membership manager sees unmasked member number; warehouse operator is forbidden', async () => {
    const membershipManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);
    const warehouseOperator = await seedUserWithSession(app, ['WAREHOUSE_OPERATOR']);

    const memberNumber = `MEM-${randomUUID().slice(0, 8)}`;
    const create = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      headers: authHeader(membershipManager.token),
      payload: {
        memberNumber,
        firstName: 'Depth',
        lastName: 'Member',
        email: `depth-${randomUUID().slice(0, 8)}@example.com`,
        phone: '5551234567',
      },
    });
    expect(create.statusCode).toBe(201);

    const listAsManager = await app.inject({
      method: 'GET',
      url: '/api/membership/members',
      headers: authHeader(membershipManager.token),
    });
    expect(listAsManager.statusCode).toBe(200);
    const managerBody = JSON.parse(listAsManager.payload);
    const createdMember = managerBody.data.find((m: { memberNumber: string }) => m.memberNumber === memberNumber);
    expect(createdMember).toBeTruthy();

    const listAsOperator = await app.inject({
      method: 'GET',
      url: '/api/membership/members',
      headers: authHeader(warehouseOperator.token),
    });
    expect(listAsOperator.statusCode).toBe(403);
    expect(JSON.parse(listAsOperator.payload).error.code).toBe('FORBIDDEN');
  });

  it('billing manager sees payment last4 while non-billing role receives masked null', async () => {
    const membershipManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);
    const billingManager = await seedUserWithSession(app, ['BILLING_MANAGER']);

    const createMemberResponse = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      headers: authHeader(membershipManager.token),
      payload: {
        memberNumber: `PMT-${randomUUID().slice(0, 8)}`,
        firstName: 'Pay',
        lastName: 'Member',
      },
    });
    expect(createMemberResponse.statusCode).toBe(201);
    const memberId = JSON.parse(createMemberResponse.payload).data.id as string;

    const paymentResponse = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      headers: authHeader(billingManager.token),
      payload: {
        memberId,
        amount: 49.99,
        currency: 'USD',
        paymentMethod: 'CARD',
        last4: '4242',
      },
    });
    expect(paymentResponse.statusCode).toBe(201);
    const paymentId = JSON.parse(paymentResponse.payload).data.id as string;

    const asBilling = await app.inject({
      method: 'GET',
      url: `/api/membership/payments/${paymentId}`,
      headers: authHeader(billingManager.token),
    });
    expect(asBilling.statusCode).toBe(200);
    expect(JSON.parse(asBilling.payload).data.last4).toBe('4242');

    const asMembershipManager = await app.inject({
      method: 'GET',
      url: `/api/membership/payments/${paymentId}`,
      headers: authHeader(membershipManager.token),
    });
    expect(asMembershipManager.statusCode).toBe(200);
    expect(JSON.parse(asMembershipManager.payload).data.last4).toBeNull();
  });
});
