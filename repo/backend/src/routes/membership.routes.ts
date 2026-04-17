import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../shared/enums.js';
import { tagRequestLogDomain } from '../logging/logger.js';
import { successResponse, errorResponse, ErrorCode, ErrorHttpStatus } from '../shared/envelope.js';
import { parseMasterKey } from '../security/encryption.js';
import { getActiveKeyVersion } from '../repositories/keyversion.repository.js';
import {
  createMemberBodySchema,
  updateMemberBodySchema,
  createPackageBodySchema,
  updatePackageBodySchema,
  createEnrollmentBodySchema,
  recordPaymentBodySchema,
  listMembersQuerySchema,
  listPaymentsQuerySchema,
  updatePaymentStatusBodySchema,
} from '../shared/schemas/membership.schemas.js';
import {
  createMember,
  getMember,
  listMembers,
  updateMember,
  softDeleteMember,
  createPackage,
  getPackage,
  listPackages,
  updatePackage,
  createEnrollment,
  listEnrollments,
  recordPayment,
  getPayment,
  listPayments,
  updatePaymentStatus,
  MembershipServiceError,
} from '../services/membership.service.js';

async function resolveActiveKeyVersion(prisma: Parameters<typeof getActiveKeyVersion>[0]): Promise<number> {
  const active = await getActiveKeyVersion(prisma);
  return active?.version ?? 1;
}

interface MemberIdParams { memberId: string }
interface PackageIdParams { packageId: string }
interface PaymentIdParams { paymentId: string }

interface CreateMemberBody {
  memberNumber: string; firstName: string; lastName: string;
  email?: string; phone?: string;
}
interface UpdateMemberBody {
  firstName?: string; lastName?: string; email?: string; phone?: string; isActive?: boolean;
}
interface CreatePackageBody {
  name: string; type: string; description?: string; price: number;
  durationDays?: number; punchCount?: number; storedValue?: number;
}
interface UpdatePackageBody {
  name?: string; description?: string; price?: number; isActive?: boolean;
}
interface CreateEnrollmentBody {
  packageId: string; startDate: string; endDate?: string;
}
interface RecordPaymentBody {
  memberId: string; enrollmentId?: string; amount: number; currency?: string;
  paymentMethod?: string; last4?: string; paidAt?: string;
}
interface ListMembersQuery { includeInactive?: boolean }
interface ListPaymentsQuery { memberId?: string; status?: string }
interface UpdatePaymentStatusBody { status: string }

function handleServiceError(
  err: unknown,
  request: { id: string },
  reply: { status: (n: number) => { send: (v: unknown) => unknown } },
) {
  if (err instanceof MembershipServiceError) {
    const status = ErrorHttpStatus[err.code] ?? 500;
    return reply.status(status).send(errorResponse(err.code, err.message, request.id));
  }
  throw err;
}

export const membershipRoutes: FastifyPluginAsync = async (fastify) => {
  tagRequestLogDomain(fastify, 'membership');

  const membershipRoles = [Role.MEMBERSHIP_MANAGER, Role.SYSTEM_ADMIN];
  const billingRoles = [Role.BILLING_MANAGER, Role.MEMBERSHIP_MANAGER, Role.SYSTEM_ADMIN];
  const readMemberRoles = [Role.MEMBERSHIP_MANAGER, Role.BILLING_MANAGER, Role.SYSTEM_ADMIN];

  // ===== MEMBERS =====

  fastify.get<{ Querystring: ListMembersQuery }>(
    '/members',
    { preHandler: [fastify.authenticate, fastify.requireRole(readMemberRoles)], schema: { querystring: listMembersQuerySchema } },
    async (request, reply) => {
      const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
      const members = await listMembers(
        fastify.prisma,
        { includeInactive: request.query.includeInactive ?? false },
        request.principal!.roles,
        masterKey,
      );
      return reply.status(200).send(successResponse(members, request.id));
    },
  );

  fastify.post<{ Body: CreateMemberBody }>(
    '/members',
    { preHandler: [fastify.authenticate, fastify.requireRole(membershipRoles)], schema: { body: createMemberBodySchema } },
    async (request, reply) => {
      try {
        const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
        const keyVersion = await resolveActiveKeyVersion(fastify.prisma);
        const member = await createMember(
          fastify.prisma,
          request.body,
          request.principal!.userId,
          masterKey,
          keyVersion,
        );
        return reply.status(201).send(successResponse(member, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: MemberIdParams }>(
    '/members/:memberId',
    { preHandler: [fastify.authenticate, fastify.requireRole(readMemberRoles)] },
    async (request, reply) => {
      try {
        const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
        const member = await getMember(
          fastify.prisma,
          request.params.memberId,
          request.principal!.roles,
          masterKey,
        );
        return reply.status(200).send(successResponse(member, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.patch<{ Params: MemberIdParams; Body: UpdateMemberBody }>(
    '/members/:memberId',
    { preHandler: [fastify.authenticate, fastify.requireRole(membershipRoles)], schema: { body: updateMemberBodySchema } },
    async (request, reply) => {
      try {
        const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
        const keyVersion = await resolveActiveKeyVersion(fastify.prisma);
        const member = await updateMember(
          fastify.prisma,
          request.params.memberId,
          request.body,
          request.principal!.userId,
          masterKey,
          keyVersion,
        );
        return reply.status(200).send(successResponse(member, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.delete<{ Params: MemberIdParams }>(
    '/members/:memberId',
    { preHandler: [fastify.authenticate, fastify.requireRole([Role.SYSTEM_ADMIN])] },
    async (request, reply) => {
      try {
        await softDeleteMember(fastify.prisma, request.params.memberId, request.principal!.userId);
        return reply.status(204).send();
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: MemberIdParams }>(
    '/members/:memberId/enrollments',
    { preHandler: [fastify.authenticate, fastify.requireRole(readMemberRoles)] },
    async (request, reply) => {
      try {
        const enrollments = await listEnrollments(fastify.prisma, request.params.memberId);
        return reply.status(200).send(successResponse(enrollments, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.post<{ Params: MemberIdParams; Body: CreateEnrollmentBody }>(
    '/members/:memberId/enrollments',
    { preHandler: [fastify.authenticate, fastify.requireRole(membershipRoles)], schema: { body: createEnrollmentBodySchema } },
    async (request, reply) => {
      try {
        const enrollment = await createEnrollment(
          fastify.prisma,
          request.params.memberId,
          {
            packageId: request.body.packageId,
            startDate: new Date(request.body.startDate),
            endDate: request.body.endDate ? new Date(request.body.endDate) : undefined,
          },
          request.principal!.userId,
        );
        return reply.status(201).send(successResponse(enrollment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== PACKAGES =====

  fastify.get(
    '/packages',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const packages = await listPackages(fastify.prisma);
      return reply.status(200).send(successResponse(packages, request.id));
    },
  );

  fastify.post<{ Body: CreatePackageBody }>(
    '/packages',
    { preHandler: [fastify.authenticate, fastify.requireRole(membershipRoles)], schema: { body: createPackageBodySchema } },
    async (request, reply) => {
      try {
        const pkg = await createPackage(fastify.prisma, request.body, request.principal!.userId);
        return reply.status(201).send(successResponse(pkg, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: PackageIdParams }>(
    '/packages/:packageId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const pkg = await getPackage(fastify.prisma, request.params.packageId);
        return reply.status(200).send(successResponse(pkg, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.patch<{ Params: PackageIdParams; Body: UpdatePackageBody }>(
    '/packages/:packageId',
    { preHandler: [fastify.authenticate, fastify.requireRole(membershipRoles)], schema: { body: updatePackageBodySchema } },
    async (request, reply) => {
      try {
        const pkg = await updatePackage(
          fastify.prisma,
          request.params.packageId,
          request.body,
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(pkg, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  // ===== PAYMENTS =====

  fastify.get<{ Querystring: ListPaymentsQuery }>(
    '/payments',
    { preHandler: [fastify.authenticate, fastify.requireRole(billingRoles)], schema: { querystring: listPaymentsQuerySchema } },
    async (request, reply) => {
      const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
      const payments = await listPayments(
        fastify.prisma,
        { memberId: request.query.memberId, status: request.query.status },
        request.principal!.roles,
        masterKey,
      );
      return reply.status(200).send(successResponse(payments, request.id));
    },
  );

  fastify.post<{ Body: RecordPaymentBody }>(
    '/payments',
    { preHandler: [fastify.authenticate, fastify.requireRole(billingRoles)], schema: { body: recordPaymentBodySchema } },
    async (request, reply) => {
      try {
        const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
        const keyVersion = await resolveActiveKeyVersion(fastify.prisma);
        const payment = await recordPayment(
          fastify.prisma,
          {
            ...request.body,
            paidAt: request.body.paidAt ? new Date(request.body.paidAt) : undefined,
          },
          request.principal!.userId,
          masterKey,
          keyVersion,
        );
        return reply.status(201).send(successResponse(payment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.get<{ Params: PaymentIdParams }>(
    '/payments/:paymentId',
    { preHandler: [fastify.authenticate, fastify.requireRole(billingRoles)] },
    async (request, reply) => {
      try {
        const masterKey = parseMasterKey(request.server.config.encryptionMasterKey);
        const payment = await getPayment(
          fastify.prisma,
          request.params.paymentId,
          request.principal!.roles,
          masterKey,
        );
        return reply.status(200).send(successResponse(payment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );

  fastify.patch<{ Params: PaymentIdParams; Body: UpdatePaymentStatusBody }>(
    '/payments/:paymentId/status',
    { preHandler: [fastify.authenticate, fastify.requireRole(billingRoles)], schema: { body: updatePaymentStatusBodySchema } },
    async (request, reply) => {
      try {
        const payment = await updatePaymentStatus(
          fastify.prisma,
          request.params.paymentId,
          request.body.status,
          request.principal!.userId,
        );
        return reply.status(200).send(successResponse(payment, request.id));
      } catch (err) {
        return handleServiceError(err, request, reply);
      }
    },
  );
};
