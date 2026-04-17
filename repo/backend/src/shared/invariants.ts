// ============================================================
// GreenCycle Domain Invariant Helpers
// Pure functions for validating business rules.
// No Prisma dependency — testable in isolation.
// ============================================================

import { resolve, basename, sep } from 'node:path';
import { AppointmentState, type AppointmentStateValue, ArticleState, PackVerificationStatus } from './enums.js';
import {
  APPOINTMENT_DEFAULTS,
  IDEMPOTENCY_DEFAULTS,
  PACK_VERIFICATION_DEFAULTS,
  RETENTION_YEARS,
} from './types.js';

// ---- Appointment State Machine ----

/**
 * Allowed appointment state transitions.
 * Key = current state, Value = set of valid target states.
 *
 * PENDING → CONFIRMED | CANCELLED | EXPIRED
 * CONFIRMED → RESCHEDULED | CANCELLED | EXPIRED
 * RESCHEDULED → CONFIRMED | CANCELLED | EXPIRED
 * CANCELLED → (terminal)
 * EXPIRED → (terminal)
 */
const APPOINTMENT_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  [AppointmentState.PENDING]: new Set([
    AppointmentState.CONFIRMED,
    AppointmentState.CANCELLED,
    AppointmentState.EXPIRED,
  ]),
  [AppointmentState.CONFIRMED]: new Set([
    AppointmentState.RESCHEDULED,
    AppointmentState.CANCELLED,
    AppointmentState.EXPIRED,
  ]),
  [AppointmentState.RESCHEDULED]: new Set([
    AppointmentState.CONFIRMED,
    AppointmentState.CANCELLED,
    AppointmentState.EXPIRED,
  ]),
  [AppointmentState.CANCELLED]: new Set(),
  [AppointmentState.EXPIRED]: new Set(),
};

/**
 * Check whether an appointment transition is valid.
 */
export function isValidAppointmentTransition(
  from: AppointmentStateValue | string,
  to: AppointmentStateValue | string,
): boolean {
  const allowed = APPOINTMENT_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
}

/**
 * Get all allowed transitions from a given state.
 */
export function getAllowedAppointmentTransitions(
  from: AppointmentStateValue | string,
): string[] {
  const allowed = APPOINTMENT_TRANSITIONS[from];
  if (!allowed) return [];
  return Array.from(allowed);
}

/**
 * Auto-expire threshold in milliseconds (2 hours).
 */
export function getAppointmentAutoExpireThresholdMs(): number {
  return APPOINTMENT_DEFAULTS.autoExpireHours * 60 * 60 * 1000;
}

/**
 * Check whether an appointment is eligible for auto-expiration.
 * Eligible if: state is PENDING AND createdAt + 2 hours <= now.
 */
export function isAppointmentExpireEligible(
  state: string,
  createdAt: Date,
  now: Date = new Date(),
): boolean {
  if (state !== AppointmentState.PENDING) return false;
  const threshold = new Date(createdAt.getTime() + getAppointmentAutoExpireThresholdMs());
  return now >= threshold;
}

// ---- Pack Verification Variance ----

/**
 * Calculate the percentage variance between actual and expected values.
 * Returns the signed percentage: positive = over, negative = under.
 * Returns 0 if expected is 0 and actual is 0.
 * Returns Infinity if expected is 0 and actual is non-zero.
 */
export function calculateVariancePercent(actual: number, expected: number): number {
  if (expected === 0) {
    return actual === 0 ? 0 : Infinity;
  }
  return ((actual - expected) / expected) * 100;
}

/**
 * Check whether a variance is within the acceptable tolerance.
 * Default tolerance: ±5%.
 */
export function isVarianceAcceptable(
  actual: number,
  expected: number,
  tolerancePct: number = PACK_VERIFICATION_DEFAULTS.varianceTolerancePct,
): boolean {
  const variance = calculateVariancePercent(actual, expected);
  if (!isFinite(variance)) return false;
  return Math.abs(variance) <= tolerancePct;
}

// ---- Retention ----

/**
 * Calculate the date when a record's retention period expires.
 */
export function getRetentionExpiryDate(createdAt: Date, retentionYears: number): Date {
  const expiry = new Date(createdAt);
  expiry.setFullYear(expiry.getFullYear() + retentionYears);
  return expiry;
}

/**
 * Check whether a record's retention period has expired.
 */
export function isRetentionExpired(
  createdAt: Date,
  retentionYears: number,
  now: Date = new Date(),
): boolean {
  const expiry = getRetentionExpiryDate(createdAt, retentionYears);
  return now >= expiry;
}

/** Billing retention: 7 years. */
export function getBillingRetentionYears(): number {
  return RETENTION_YEARS.billing;
}

/** Operational log retention: 2 years. */
export function getOperationalRetentionYears(): number {
  return RETENTION_YEARS.operational;
}

// ---- Idempotency ----

/**
 * Check whether an idempotency key has expired.
 * Default window: 24 hours.
 */
export function isIdempotencyKeyExpired(
  createdAt: Date,
  windowHours: number = IDEMPOTENCY_DEFAULTS.windowHours,
  now: Date = new Date(),
): boolean {
  const expiresAt = new Date(createdAt.getTime() + windowHours * 60 * 60 * 1000);
  return now >= expiresAt;
}

// ---- Invoice Number ----

/**
 * Generate a deterministic invoice number.
 * Format: GC-YYYYMMDD-NNNNN (zero-padded sequence).
 */
export function generateInvoiceNumber(date: Date, sequence: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(5, '0');
  return `GC-${y}${m}${d}-${seq}`;
}

// ---- Tag Normalization ----

/**
 * Normalize a tag name for uniqueness comparison:
 * - trim whitespace
 * - collapse internal whitespace to single space
 * - convert to lowercase
 */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// ---- Pack Verification Status ----

/**
 * Determine the pack verification status from computed variance percentages.
 * A variance is failed if its absolute value exceeds the tolerance or is non-finite.
 */
export function computePackVerificationStatus(
  weightVariancePct: number,
  volumeVariancePct: number,
  tolerancePct: number = PACK_VERIFICATION_DEFAULTS.varianceTolerancePct,
): string {
  const weightFailed = !isFinite(weightVariancePct) || Math.abs(weightVariancePct) > tolerancePct;
  const volumeFailed = !isFinite(volumeVariancePct) || Math.abs(volumeVariancePct) > tolerancePct;
  if (weightFailed && volumeFailed) return PackVerificationStatus.FAILED_BOTH;
  if (weightFailed) return PackVerificationStatus.FAILED_WEIGHT;
  if (volumeFailed) return PackVerificationStatus.FAILED_VOLUME;
  return PackVerificationStatus.PASSED;
}

// ---- CMS Article State Machine ----

const ARTICLE_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  [ArticleState.DRAFT]:     new Set([ArticleState.IN_REVIEW]),
  [ArticleState.IN_REVIEW]: new Set([ArticleState.APPROVED, ArticleState.DRAFT]),
  [ArticleState.APPROVED]:  new Set([ArticleState.PUBLISHED, ArticleState.SCHEDULED]),
  [ArticleState.SCHEDULED]: new Set([ArticleState.PUBLISHED, ArticleState.WITHDRAWN]),
  [ArticleState.PUBLISHED]: new Set([ArticleState.WITHDRAWN]),
  [ArticleState.WITHDRAWN]: new Set([ArticleState.DRAFT]),
};

export function isValidArticleTransition(from: string, to: string): boolean {
  return ARTICLE_TRANSITIONS[from]?.has(to) ?? false;
}

export function getAllowedArticleTransitions(from: string): string[] {
  return Array.from(ARTICLE_TRANSITIONS[from] ?? []);
}

/**
 * Returns true if the article is SCHEDULED and its scheduledPublishAt timestamp has passed.
 */
export function isArticleScheduledPublishEligible(
  state: string,
  scheduledPublishAt: Date | null,
  now: Date = new Date(),
): boolean {
  return state === ArticleState.SCHEDULED && scheduledPublishAt !== null && now >= scheduledPublishAt;
}

// ---- Backup Path Safety ----

/**
 * Safely resolve a snapshot filename within a backup directory.
 * Strips any directory separators from the filename before resolving,
 * then verifies the result remains strictly within backupDir.
 * Throws if the filename is empty, a dotpath, or would escape the directory.
 */
export function validateSnapshotPath(backupDir: string, filename: string): string {
  const safeName = basename(filename);
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new Error('Invalid snapshot filename');
  }
  const resolvedBase = resolve(backupDir);
  const resolvedFull = resolve(backupDir, safeName);
  if (!resolvedFull.startsWith(resolvedBase + sep)) {
    throw new Error('Path traversal detected');
  }
  return resolvedFull;
}

// ---- Retention Purge Eligibility ----

/**
 * Check whether a soft-deleted record is eligible for hard purge.
 * A record is purgeable when it has been soft-deleted AND its retention
 * expiry date has passed.
 */
export function isRetentionPurgeable(
  deletedAt: Date | null,
  retentionExpiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!deletedAt || !retentionExpiresAt) return false;
  return now >= retentionExpiresAt;
}

// ---- Payment Status Transitions ----

const PAYMENT_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  RECORDED: new Set(['SETTLED', 'VOIDED']),
  SETTLED: new Set(['REFUNDED']),
  VOIDED: new Set(),
  REFUNDED: new Set(),
};

export function isValidPaymentTransition(from: string, to: string): boolean {
  return PAYMENT_TRANSITIONS[from]?.has(to) ?? false;
}

export function getAllowedPaymentTransitions(from: string): string[] {
  return Array.from(PAYMENT_TRANSITIONS[from] ?? []);
}

// ---- Package Type Constraint Validation ----

/**
 * Validates that package-type-specific required fields are present.
 * Returns an error message string on failure, or null on success.
 */
export function validatePackageTypeRequiredFields(
  packageType: string,
  fields: { punchCount?: number; durationDays?: number; storedValue?: number },
): string | null {
  if (packageType === 'PUNCH') {
    if (fields.punchCount == null || fields.punchCount <= 0) {
      return 'PUNCH packages require a positive punchCount';
    }
  }
  if (packageType === 'TERM') {
    if (fields.durationDays == null || fields.durationDays <= 0) {
      return 'TERM packages require a positive durationDays';
    }
  }
  if (packageType === 'STORED_VALUE') {
    if (fields.storedValue == null || fields.storedValue <= 0) {
      return 'STORED_VALUE packages require a positive storedValue';
    }
  }
  return null;
}

// ---- Shortage Calculation ----

/**
 * Compute the quantity short for a pick task.
 * shortageQuantity must be ≥ 0 and ≤ task.quantity.
 * Returns null if inputs are invalid (task.quantity ≤ 0 or quantityPicked < 0).
 */
export function computeShortageQuantity(
  taskQuantity: number,
  quantityPicked: number,
): number | null {
  if (taskQuantity <= 0 || quantityPicked < 0) return null;
  const shortage = taskQuantity - quantityPicked;
  return shortage >= 0 ? shortage : null;
}

// ---- Parameter Key Format ----

const PARAMETER_KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;

/** Returns true if the parameter key matches the allowed format. */
export function isValidParameterKey(key: string): boolean {
  return key.length > 0 && PARAMETER_KEY_PATTERN.test(key);
}
