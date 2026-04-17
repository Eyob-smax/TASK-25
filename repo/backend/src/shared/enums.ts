// ============================================================
// GreenCycle Domain Enums
// SQLite has no native enums — these are enforced at the
// application layer and stored as String in the Prisma schema.
// ============================================================

// --- Authentication & Roles ---

export const Role = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  WAREHOUSE_OPERATOR: 'WAREHOUSE_OPERATOR',
  STRATEGY_MANAGER: 'STRATEGY_MANAGER',
  MEMBERSHIP_MANAGER: 'MEMBERSHIP_MANAGER',
  CMS_REVIEWER: 'CMS_REVIEWER',
  BILLING_MANAGER: 'BILLING_MANAGER',
} as const;
export type RoleType = (typeof Role)[keyof typeof Role];

// --- Appointment ---

export const AppointmentType = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type AppointmentTypeValue = (typeof AppointmentType)[keyof typeof AppointmentType];

export const AppointmentState = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  RESCHEDULED: 'RESCHEDULED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type AppointmentStateValue = (typeof AppointmentState)[keyof typeof AppointmentState];

// --- Outbound ---

export const OutboundType = {
  SALES: 'SALES',
  RETURN: 'RETURN',
  TRANSFER: 'TRANSFER',
} as const;
export type OutboundTypeValue = (typeof OutboundType)[keyof typeof OutboundType];

export const OutboundOrderStatus = {
  DRAFT: 'DRAFT',
  PICKING: 'PICKING',
  PACKING: 'PACKING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  PARTIAL_SHIPPED: 'PARTIAL_SHIPPED',
  CANCELLED: 'CANCELLED',
} as const;
export type OutboundOrderStatusValue = (typeof OutboundOrderStatus)[keyof typeof OutboundOrderStatus];

export const OrderLineType = {
  STANDARD: 'STANDARD',
  BACKORDER: 'BACKORDER',
} as const;
export type OrderLineTypeValue = (typeof OrderLineType)[keyof typeof OrderLineType];

export const ShortageReason = {
  STOCKOUT: 'STOCKOUT',
  DAMAGE: 'DAMAGE',
  OVERSELL: 'OVERSELL',
} as const;
export type ShortageReasonValue = (typeof ShortageReason)[keyof typeof ShortageReason];

export const WaveStatus = {
  CREATED: 'CREATED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type WaveStatusValue = (typeof WaveStatus)[keyof typeof WaveStatus];

export const PickTaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SHORT: 'SHORT',
  CANCELLED: 'CANCELLED',
} as const;
export type PickTaskStatusValue = (typeof PickTaskStatus)[keyof typeof PickTaskStatus];

export const PackVerificationStatus = {
  PASSED: 'PASSED',
  FAILED_WEIGHT: 'FAILED_WEIGHT',
  FAILED_VOLUME: 'FAILED_VOLUME',
  FAILED_BOTH: 'FAILED_BOTH',
} as const;
export type PackVerificationStatusValue = (typeof PackVerificationStatus)[keyof typeof PackVerificationStatus];

// --- Membership & Billing ---

export const PackageType = {
  PUNCH: 'PUNCH',
  TERM: 'TERM',
  STORED_VALUE: 'STORED_VALUE',
  BUNDLE: 'BUNDLE',
} as const;
export type PackageTypeValue = (typeof PackageType)[keyof typeof PackageType];

export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type EnrollmentStatusValue = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const PaymentStatus = {
  RECORDED: 'RECORDED',
  SETTLED: 'SETTLED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatusValue = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// --- CMS ---

export const ArticleState = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  SCHEDULED: 'SCHEDULED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type ArticleStateValue = (typeof ArticleState)[keyof typeof ArticleState];

export const InteractionType = {
  VIEW: 'VIEW',
  SHARE: 'SHARE',
  BOOKMARK: 'BOOKMARK',
  COMMENT: 'COMMENT',
} as const;
export type InteractionTypeValue = (typeof InteractionType)[keyof typeof InteractionType];

// --- Audit ---

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  TRANSITION: 'TRANSITION',
} as const;
export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

// --- Encryption Key ---

export const KeyStatus = {
  ACTIVE: 'ACTIVE',
  ROTATED: 'ROTATED',
  REVOKED: 'REVOKED',
} as const;
export type KeyStatusValue = (typeof KeyStatus)[keyof typeof KeyStatus];

// --- ABC Classification ---

export const AbcClass = {
  A: 'A',
  B: 'B',
  C: 'C',
} as const;
export type AbcClassValue = (typeof AbcClass)[keyof typeof AbcClass];

// --- Location Type ---

export const LocationType = {
  RACK: 'RACK',
  FLOOR: 'FLOOR',
  BULK: 'BULK',
  PICK_FACE: 'PICK_FACE',
  STAGING: 'STAGING',
  RECEIVING: 'RECEIVING',
  SHIPPING: 'SHIPPING',
} as const;
export type LocationTypeValue = (typeof LocationType)[keyof typeof LocationType];

// --- Hazard Class ---

export const HazardClass = {
  NONE: 'NONE',
  FLAMMABLE: 'FLAMMABLE',
  CORROSIVE: 'CORROSIVE',
  TOXIC: 'TOXIC',
  OXIDIZER: 'OXIDIZER',
  COMPRESSED_GAS: 'COMPRESSED_GAS',
} as const;
export type HazardClassValue = (typeof HazardClass)[keyof typeof HazardClass];

// --- Temperature Band ---

export const TemperatureBand = {
  AMBIENT: 'AMBIENT',
  COOL: 'COOL',
  COLD: 'COLD',
  FROZEN: 'FROZEN',
} as const;
export type TemperatureBandValue = (typeof TemperatureBand)[keyof typeof TemperatureBand];

// --- Backup Status ---

export const BackupStatus = {
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RESTORING: 'RESTORING',
  RESTORED: 'RESTORED',
} as const;
export type BackupStatusValue = (typeof BackupStatus)[keyof typeof BackupStatus];

// --- Enum value sets for validation ---

export function isValidEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: string,
): value is T[keyof T] {
  return Object.values(enumObj).includes(value);
}
