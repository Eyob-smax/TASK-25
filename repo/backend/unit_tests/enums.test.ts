import { describe, it, expect } from 'vitest';
import {
  Role,
  AppointmentState,
  AppointmentType,
  OutboundType,
  OutboundOrderStatus,
  OrderLineType,
  ShortageReason,
  WaveStatus,
  PickTaskStatus,
  PackVerificationStatus,
  PackageType,
  EnrollmentStatus,
  PaymentStatus,
  ArticleState,
  InteractionType,
  AuditAction,
  KeyStatus,
  AbcClass,
  LocationType,
  HazardClass,
  TemperatureBand,
  BackupStatus,
  isValidEnumValue,
} from '../src/shared/enums.js';

describe('Role enum', () => {
  it('includes all 7 required roles', () => {
    expect(Object.keys(Role)).toHaveLength(7);
    expect(Role.SYSTEM_ADMIN).toBe('SYSTEM_ADMIN');
    expect(Role.WAREHOUSE_MANAGER).toBe('WAREHOUSE_MANAGER');
    expect(Role.WAREHOUSE_OPERATOR).toBe('WAREHOUSE_OPERATOR');
    expect(Role.STRATEGY_MANAGER).toBe('STRATEGY_MANAGER');
    expect(Role.MEMBERSHIP_MANAGER).toBe('MEMBERSHIP_MANAGER');
    expect(Role.CMS_REVIEWER).toBe('CMS_REVIEWER');
    expect(Role.BILLING_MANAGER).toBe('BILLING_MANAGER');
  });
});

describe('AppointmentState enum', () => {
  it('includes all required strict lifecycle states', () => {
    expect(Object.keys(AppointmentState)).toHaveLength(5);
    expect(AppointmentState.PENDING).toBe('PENDING');
    expect(AppointmentState.CONFIRMED).toBe('CONFIRMED');
    expect(AppointmentState.RESCHEDULED).toBe('RESCHEDULED');
    expect(AppointmentState.CANCELLED).toBe('CANCELLED');
    expect(AppointmentState.EXPIRED).toBe('EXPIRED');
  });
});

describe('AppointmentType enum', () => {
  it('includes INBOUND and OUTBOUND', () => {
    expect(Object.keys(AppointmentType)).toHaveLength(2);
    expect(AppointmentType.INBOUND).toBe('INBOUND');
    expect(AppointmentType.OUTBOUND).toBe('OUTBOUND');
  });
});

describe('OutboundType enum', () => {
  it('includes SALES, RETURN, TRANSFER', () => {
    expect(Object.keys(OutboundType)).toHaveLength(3);
    expect(OutboundType.SALES).toBe('SALES');
    expect(OutboundType.RETURN).toBe('RETURN');
    expect(OutboundType.TRANSFER).toBe('TRANSFER');
  });
});

describe('OutboundOrderStatus enum', () => {
  it('includes all order statuses', () => {
    expect(Object.keys(OutboundOrderStatus)).toHaveLength(7);
    expect(OutboundOrderStatus.DRAFT).toBe('DRAFT');
    expect(OutboundOrderStatus.PARTIAL_SHIPPED).toBe('PARTIAL_SHIPPED');
  });
});

describe('OrderLineType enum', () => {
  it('includes STANDARD and BACKORDER', () => {
    expect(Object.keys(OrderLineType)).toHaveLength(2);
    expect(OrderLineType.STANDARD).toBe('STANDARD');
    expect(OrderLineType.BACKORDER).toBe('BACKORDER');
  });
});

describe('ShortageReason enum', () => {
  it('includes STOCKOUT, DAMAGE, OVERSELL', () => {
    expect(Object.keys(ShortageReason)).toHaveLength(3);
    expect(ShortageReason.STOCKOUT).toBe('STOCKOUT');
    expect(ShortageReason.DAMAGE).toBe('DAMAGE');
    expect(ShortageReason.OVERSELL).toBe('OVERSELL');
  });
});

describe('WaveStatus enum', () => {
  it('includes all wave statuses', () => {
    expect(Object.keys(WaveStatus)).toHaveLength(4);
  });
});

describe('PickTaskStatus enum', () => {
  it('includes PENDING, IN_PROGRESS, COMPLETED, SHORT, CANCELLED', () => {
    expect(Object.keys(PickTaskStatus)).toHaveLength(5);
    expect(PickTaskStatus.SHORT).toBe('SHORT');
  });
});

describe('PackVerificationStatus enum', () => {
  it('includes all verification statuses', () => {
    expect(Object.keys(PackVerificationStatus)).toHaveLength(4);
    expect(PackVerificationStatus.PASSED).toBe('PASSED');
    expect(PackVerificationStatus.FAILED_WEIGHT).toBe('FAILED_WEIGHT');
    expect(PackVerificationStatus.FAILED_VOLUME).toBe('FAILED_VOLUME');
    expect(PackVerificationStatus.FAILED_BOTH).toBe('FAILED_BOTH');
  });
});

describe('PackageType enum', () => {
  it('includes PUNCH, TERM, STORED_VALUE, BUNDLE', () => {
    expect(Object.keys(PackageType)).toHaveLength(4);
    expect(PackageType.PUNCH).toBe('PUNCH');
    expect(PackageType.TERM).toBe('TERM');
    expect(PackageType.STORED_VALUE).toBe('STORED_VALUE');
    expect(PackageType.BUNDLE).toBe('BUNDLE');
  });
});

describe('EnrollmentStatus enum', () => {
  it('includes all enrollment statuses', () => {
    expect(Object.keys(EnrollmentStatus)).toHaveLength(4);
  });
});

describe('PaymentStatus enum', () => {
  it('includes RECORDED, SETTLED, VOIDED, REFUNDED', () => {
    expect(Object.keys(PaymentStatus)).toHaveLength(4);
    expect(PaymentStatus.RECORDED).toBe('RECORDED');
    expect(PaymentStatus.SETTLED).toBe('SETTLED');
    expect(PaymentStatus.VOIDED).toBe('VOIDED');
    expect(PaymentStatus.REFUNDED).toBe('REFUNDED');
  });
});

describe('ArticleState enum', () => {
  it('includes all 6 CMS article states', () => {
    expect(Object.keys(ArticleState)).toHaveLength(6);
    expect(ArticleState.DRAFT).toBe('DRAFT');
    expect(ArticleState.IN_REVIEW).toBe('IN_REVIEW');
    expect(ArticleState.APPROVED).toBe('APPROVED');
    expect(ArticleState.PUBLISHED).toBe('PUBLISHED');
    expect(ArticleState.SCHEDULED).toBe('SCHEDULED');
    expect(ArticleState.WITHDRAWN).toBe('WITHDRAWN');
  });
});

describe('InteractionType enum', () => {
  it('includes VIEW, SHARE, BOOKMARK, COMMENT', () => {
    expect(Object.keys(InteractionType)).toHaveLength(4);
  });
});

describe('AuditAction enum', () => {
  it('includes CREATE, UPDATE, DELETE, TRANSITION', () => {
    expect(Object.keys(AuditAction)).toHaveLength(4);
    expect(AuditAction.TRANSITION).toBe('TRANSITION');
  });
});

describe('KeyStatus enum', () => {
  it('includes ACTIVE, ROTATED, REVOKED', () => {
    expect(Object.keys(KeyStatus)).toHaveLength(3);
  });
});

describe('AbcClass enum', () => {
  it('includes A, B, C', () => {
    expect(Object.keys(AbcClass)).toHaveLength(3);
  });
});

describe('LocationType enum', () => {
  it('includes all location types', () => {
    expect(Object.keys(LocationType)).toHaveLength(7);
  });
});

describe('HazardClass enum', () => {
  it('includes NONE and hazard classifications', () => {
    expect(Object.keys(HazardClass)).toHaveLength(6);
    expect(HazardClass.NONE).toBe('NONE');
  });
});

describe('TemperatureBand enum', () => {
  it('includes AMBIENT, COOL, COLD, FROZEN', () => {
    expect(Object.keys(TemperatureBand)).toHaveLength(4);
  });
});

describe('BackupStatus enum', () => {
  it('includes all backup statuses', () => {
    expect(Object.keys(BackupStatus)).toHaveLength(4);
  });
});

describe('isValidEnumValue', () => {
  it('returns true for valid enum values', () => {
    expect(isValidEnumValue(Role, 'SYSTEM_ADMIN')).toBe(true);
    expect(isValidEnumValue(ArticleState, 'DRAFT')).toBe(true);
    expect(isValidEnumValue(PackageType, 'PUNCH')).toBe(true);
  });

  it('returns false for invalid enum values', () => {
    expect(isValidEnumValue(Role, 'INVALID_ROLE')).toBe(false);
    expect(isValidEnumValue(ArticleState, 'DELETED')).toBe(false);
    expect(isValidEnumValue(PackageType, 'MONTHLY')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidEnumValue(Role, '')).toBe(false);
  });
});
