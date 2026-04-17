// ============================================================
// GreenCycle Shared Types
// Cross-cutting TypeScript types used across modules
// ============================================================

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SortParams {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface AuditMeta {
  actorId: string;
  reason?: string;
}

export interface SoftDeleteFields {
  deletedAt: Date | null;
  deletedBy: string | null;
}

export interface RetentionPolicy {
  retentionYears: number;
  domain: 'billing' | 'operational';
}

/** Standard retention durations by domain */
export const RETENTION_YEARS = {
  billing: 7,
  operational: 2,
} as const;

/** Rate limiting defaults */
export const RATE_LIMIT_DEFAULTS = {
  requestsPerMinute: 120,
  burstLimit: 30,
} as const;

/** Idempotency key defaults */
export const IDEMPOTENCY_DEFAULTS = {
  windowHours: 24,
} as const;

/** Appointment auto-expire threshold */
export const APPOINTMENT_DEFAULTS = {
  autoExpireHours: 2,
} as const;

/** Pack verification tolerance */
export const PACK_VERIFICATION_DEFAULTS = {
  varianceTolerancePct: 5,
} as const;

/** Encryption key rotation */
export const ENCRYPTION_DEFAULTS = {
  rotationDays: 180,
} as const;

/** Trending calculation window */
export const TRENDING_DEFAULTS = {
  windowDays: 7,
} as const;

/** Simulation evaluation window */
export const SIMULATION_DEFAULTS = {
  windowDays: 30,
} as const;
