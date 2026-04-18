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

  async function createMember(token: string, prefix = 'MEM') {
    const memberNumber = `${prefix}-${randomUUID().slice(0, 8)}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      headers: authHeader(token),
      payload: {
        memberNumber,
        firstName: 'Depth',
        lastName: 'Member',
        email: `depth-${randomUUID().slice(0, 8)}@example.com`,
        phone: '5551234567',
      },
    });
    expect(response.statusCode).toBe(201);
    return {
      memberNumber,
      memberId: JSON.parse(response.payload).data.id as string,
    };
  }

  async function createPackage(token: string, suffix = randomUUID().slice(0, 6)) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/membership/packages',
      headers: authHeader(token),
      payload: {
        name: `Depth Package ${suffix}`,
        type: 'TERM',
        price: 129.99,
        durationDays: 30,
      },
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.payload).data.id as string;
  }

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

  it('forbids billing manager from member list/get endpoints', async () => {
    const membershipManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);
    const billingManager = await seedUserWithSession(app, ['BILLING_MANAGER']);

    const { memberId } = await createMember(membershipManager.token, 'ROLEBOUNDARY');

    const listAsBilling = await app.inject({
      method: 'GET',
      url: '/api/membership/members',
      headers: authHeader(billingManager.token),
    });
    expect(listAsBilling.statusCode).toBe(403);
    expect(JSON.parse(listAsBilling.payload).error.code).toBe('FORBIDDEN');

    const getAsBilling = await app.inject({
      method: 'GET',
      url: `/api/membership/members/${memberId}`,
      headers: authHeader(billingManager.token),
    });
    expect(getAsBilling.statusCode).toBe(403);
    expect(JSON.parse(getAsBilling.payload).error.code).toBe('FORBIDDEN');
  });

  it('enforces object-level member scope for non-admin membership managers', async () => {
    const ownerManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);
    const otherManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);

    const { memberId } = await createMember(ownerManager.token, 'OWNERSCOPE');

    const ownerGet = await app.inject({
      method: 'GET',
      url: `/api/membership/members/${memberId}`,
      headers: authHeader(ownerManager.token),
    });
    expect(ownerGet.statusCode).toBe(200);

    const otherGet = await app.inject({
      method: 'GET',
      url: `/api/membership/members/${memberId}`,
      headers: authHeader(otherManager.token),
    });
    expect(otherGet.statusCode).toBe(404);
    expect(JSON.parse(otherGet.payload).error.code).toBe('NOT_FOUND');

    const otherList = await app.inject({
      method: 'GET',
      url: '/api/membership/members',
      headers: authHeader(otherManager.token),
    });
    expect(otherList.statusCode).toBe(200);
    const otherListBody = JSON.parse(otherList.payload);
    expect(otherListBody.data.some((m: { id: string }) => m.id === memberId)).toBe(false);
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

  it('covers member get/update/delete lifecycle and enrollment listing', async () => {
    const membershipManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);
    const systemAdmin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);

    const { memberNumber, memberId } = await createMember(membershipManager.token, 'LIFECYCLE');

    const getMember = await app.inject({
      method: 'GET',
      url: `/api/membership/members/${memberId}`,
      headers: authHeader(membershipManager.token),
    });
    expect(getMember.statusCode).toBe(200);
    const getMemberBody = JSON.parse(getMember.payload);
    expect(getMemberBody.data.id).toBe(memberId);
    expect(getMemberBody.data.memberNumber).toBe(memberNumber);

    const patchMember = await app.inject({
      method: 'PATCH',
      url: `/api/membership/members/${memberId}`,
      headers: authHeader(membershipManager.token),
      payload: {
        firstName: 'DepthUpdated',
        lastName: 'MemberUpdated',
        isActive: true,
      },
    });
    expect(patchMember.statusCode).toBe(200);
    const patchMemberBody = JSON.parse(patchMember.payload);
    expect(patchMemberBody.data.firstName).toBe('DepthUpdated');
    expect(patchMemberBody.data.lastName).toBe('MemberUpdated');

    const packageId = await createPackage(membershipManager.token);

    const createEnrollment = await app.inject({
      method: 'POST',
      url: `/api/membership/members/${memberId}/enrollments`,
      headers: authHeader(membershipManager.token),
      payload: {
        packageId,
        startDate: new Date().toISOString(),
      },
    });
    expect(createEnrollment.statusCode).toBe(201);

    const listEnrollments = await app.inject({
      method: 'GET',
      url: `/api/membership/members/${memberId}/enrollments`,
      headers: authHeader(membershipManager.token),
    });
    expect(listEnrollments.statusCode).toBe(200);
    const enrollmentBody = JSON.parse(listEnrollments.payload);
    expect(Array.isArray(enrollmentBody.data)).toBe(true);
    expect(enrollmentBody.data.length).toBeGreaterThan(0);
    expect(enrollmentBody.data[0].memberId).toBe(memberId);

    const deleteMember = await app.inject({
      method: 'DELETE',
      url: `/api/membership/members/${memberId}`,
      headers: authHeader(systemAdmin.token),
    });
    expect(deleteMember.statusCode).toBe(204);

    const getDeletedMember = await app.inject({
      method: 'GET',
      url: `/api/membership/members/${memberId}`,
      headers: authHeader(membershipManager.token),
    });
    expect(getDeletedMember.statusCode).toBe(404);
    expect(JSON.parse(getDeletedMember.payload).error.code).toBe('NOT_FOUND');
  });

  it('covers package detail and update endpoints', async () => {
    const membershipManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);

    const packageId = await createPackage(membershipManager.token);

    const getPackage = await app.inject({
      method: 'GET',
      url: `/api/membership/packages/${packageId}`,
      headers: authHeader(membershipManager.token),
    });
    expect(getPackage.statusCode).toBe(200);
    const getPackageBody = JSON.parse(getPackage.payload);
    expect(getPackageBody.data.id).toBe(packageId);
    expect(getPackageBody.data.type).toBe('TERM');

    const patchPackage = await app.inject({
      method: 'PATCH',
      url: `/api/membership/packages/${packageId}`,
      headers: authHeader(membershipManager.token),
      payload: {
        name: 'Depth Package Updated',
        price: 149.99,
        isActive: false,
      },
    });
    expect(patchPackage.statusCode).toBe(200);
    const patchPackageBody = JSON.parse(patchPackage.payload);
    expect(patchPackageBody.data.name).toBe('Depth Package Updated');
    expect(patchPackageBody.data.price).toBe(149.99);
    expect(patchPackageBody.data.isActive).toBe(false);
  });

  it('soft-deletes payment, anchors retentionExpiresAt at deletedAt+7y, and makes it purge-eligible', async () => {
    const billingManager = await seedUserWithSession(app, ['BILLING_MANAGER']);
    const systemAdmin = await seedUserWithSession(app, ['SYSTEM_ADMIN']);
    const membershipManager = await seedUserWithSession(app, ['MEMBERSHIP_MANAGER']);

    const createMemberResponse = await app.inject({
      method: 'POST',
      url: '/api/membership/members',
      headers: authHeader(membershipManager.token),
      payload: {
        memberNumber: `RET-${randomUUID().slice(0, 8)}`,
        firstName: 'Retention',
        lastName: 'Member',
      },
    });
    expect(createMemberResponse.statusCode).toBe(201);
    const memberId = JSON.parse(createMemberResponse.payload).data.id as string;

    const paymentResponse = await app.inject({
      method: 'POST',
      url: '/api/membership/payments',
      headers: authHeader(billingManager.token),
      payload: { memberId, amount: 19.99, currency: 'USD', paymentMethod: 'CARD', last4: '1111' },
    });
    expect(paymentResponse.statusCode).toBe(201);
    const paymentId = JSON.parse(paymentResponse.payload).data.id as string;

    const fresh = await app.prisma.paymentRecord.findFirst({ where: { id: paymentId } });
    expect(fresh?.deletedAt).toBeNull();
    expect(fresh?.retentionExpiresAt).toBeNull();

    const softDelete = await app.inject({
      method: 'DELETE',
      url: `/api/membership/payments/${paymentId}`,
      headers: authHeader(billingManager.token),
    });
    expect(softDelete.statusCode).toBe(200);
    const softDeleteBody = JSON.parse(softDelete.payload);
    expect(softDeleteBody.data.id).toBe(paymentId);
    expect(typeof softDeleteBody.data.deletedAt).toBe('string');
    expect(typeof softDeleteBody.data.retentionExpiresAt).toBe('string');

    const afterDelete = await app.prisma.paymentRecord.findFirst({ where: { id: paymentId } });
    expect(afterDelete?.deletedAt).not.toBeNull();
    expect(afterDelete?.retentionExpiresAt).not.toBeNull();
    // retentionExpiresAt should be ~7 years after deletedAt.
    const expiryYears =
      afterDelete!.retentionExpiresAt!.getFullYear() - afterDelete!.deletedAt!.getFullYear();
    expect(expiryYears).toBe(7);

    // Soft-deleted records disappear from reads.
    const getAfter = await app.inject({
      method: 'GET',
      url: `/api/membership/payments/${paymentId}`,
      headers: authHeader(billingManager.token),
    });
    expect(getAfter.statusCode).toBe(404);

    // Simulate a past retentionExpiresAt and verify purge-billing collects it.
    const pastExpiry = new Date();
    pastExpiry.setDate(pastExpiry.getDate() - 1);
    await app.prisma.paymentRecord.update({
      where: { id: paymentId },
      data: { retentionExpiresAt: pastExpiry },
    });

    const purge = await app.inject({
      method: 'POST',
      url: '/api/admin/retention/purge-billing',
      headers: authHeader(systemAdmin.token),
      payload: { confirm: true },
      remoteAddress: '127.0.0.1',
    });
    expect(purge.statusCode).toBe(200);
    const purgeBody = JSON.parse(purge.payload);
    expect(purgeBody.data.purgedCount).toBeGreaterThanOrEqual(1);

    const purged = await app.prisma.paymentRecord.findFirst({ where: { id: paymentId } });
    expect(purged).toBeNull();
  });
});
