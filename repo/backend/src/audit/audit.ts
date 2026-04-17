import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AuditAction, type AuditActionValue } from '../shared/enums.js';

/**
 * Compute a deterministic SHA-256 digest of any JSON-serializable value.
 * Returns an empty string for null/undefined (no state to digest).
 */
export function digestObject(value: unknown): string {
  if (value === null || value === undefined) return '';
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface WriteAuditEventParams {
  prisma: PrismaClient;
  actor: string;              // userId or 'SYSTEM'
  action: AuditActionValue;
  resourceType: string;       // e.g. 'User', 'Appointment', 'PaymentRecord'
  resourceId: string;
  before?: unknown;           // state snapshot before the mutation
  after?: unknown;            // state snapshot after the mutation
  metadata?: Record<string, unknown>;
}

/**
 * Append an audit event to the database.
 * Audit events are immutable — no update or delete paths exist.
 * Before/after digests provide tamper-evidence without storing raw sensitive data.
 *
 * Failures are propagated to callers; the caller decides whether to abort.
 */
export async function writeAuditEvent(params: WriteAuditEventParams): Promise<void> {
  const { prisma, actor, action, resourceType, resourceId, before, after, metadata } = params;
  await prisma.auditEvent.create({
    data: {
      actor,
      action,
      resourceType,
      resourceId,
      beforeDigest: before !== undefined ? digestObject(before) : null,
      afterDigest: after !== undefined ? digestObject(after) : null,
      metadata: metadata !== undefined ? JSON.stringify(metadata) : null,
      timestamp: new Date(),
    },
  });
}

/** Convenience: write a CREATE event (no before state). */
export async function auditCreate(
  prisma: PrismaClient,
  actor: string,
  resourceType: string,
  resourceId: string,
  after: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent({ prisma, actor, action: AuditAction.CREATE, resourceType, resourceId, after, metadata });
}

/** Convenience: write an UPDATE event with both before and after state. */
export async function auditUpdate(
  prisma: PrismaClient,
  actor: string,
  resourceType: string,
  resourceId: string,
  before: unknown,
  after: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent({ prisma, actor, action: AuditAction.UPDATE, resourceType, resourceId, before, after, metadata });
}

/** Convenience: write a state-TRANSITION event. */
export async function auditTransition(
  prisma: PrismaClient,
  actor: string,
  resourceType: string,
  resourceId: string,
  fromState: string,
  toState: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent({
    prisma,
    actor,
    action: AuditAction.TRANSITION,
    resourceType,
    resourceId,
    before: { state: fromState },
    after: { state: toState },
    metadata,
  });
}
