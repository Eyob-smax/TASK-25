// ============================================================
// GreenCycle Response Envelope Helpers
// Consistent response shapes for all API endpoints.
// ============================================================

import type { PaginationMeta } from './types.js';

export interface SuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    auditEventId?: string;
    [key: string]: unknown;
  };
}

export interface ErrorDetail {
  field?: string;
  message: string;
  value?: unknown;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
  meta: {
    requestId: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface PaginatedEnvelope<T = unknown> {
  success: true;
  data: T[];
  meta: {
    requestId: string;
    timestamp: string;
    pagination: PaginationMeta;
    [key: string]: unknown;
  };
}

/**
 * Build a success response envelope.
 */
export function successResponse<T>(
  data: T,
  requestId: string,
  extra?: Record<string, unknown>,
): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...extra,
    },
  };
}

/**
 * Build an error response envelope.
 */
export function errorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
  extra?: Record<string, unknown>,
): ErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...extra,
    },
  };
}

/**
 * Build a paginated response envelope.
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  requestId: string,
  extra?: Record<string, unknown>,
): PaginatedEnvelope<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      pagination,
      ...extra,
    },
  };
}

// ---- Standard Error Codes ----

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  IP_BLOCKED: 'IP_BLOCKED',
  VARIANCE_EXCEEDED: 'VARIANCE_EXCEEDED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Map error codes to HTTP status codes. */
export const ErrorHttpStatus: Record<string, number> = {
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.IDEMPOTENCY_CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.IP_BLOCKED]: 403,
  [ErrorCode.VARIANCE_EXCEEDED]: 422,
  [ErrorCode.APPROVAL_REQUIRED]: 422,
  [ErrorCode.INVALID_TRANSITION]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
};
