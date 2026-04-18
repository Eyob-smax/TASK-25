# Fix Check Report for audit_report-2.md (Static-Only)

## Scope
- Reviewed only the previously reported issues from .tmp/audit_report-2.md.
- Static verification only (no runtime execution).

## Overall Result
- **4 / 4 issues are fixed based on static evidence.**

## Issue-by-Issue Status

### 1) High: Non-atomic pick-task mutation could persist invalid state before error
- Previous finding: `repo/backend/src/services/outbound.service.ts:363`, `repo/backend/src/services/outbound.service.ts:382`, `repo/backend/src/services/outbound.service.ts:387`
- Current status: **Fixed**
- Current evidence:
- Pre-flight SHORT validation now occurs before any DB mutation: `repo/backend/src/services/outbound.service.ts:369`
- Multi-step mutation is wrapped in a transaction: `repo/backend/src/services/outbound.service.ts:376`
- Update/write path inside tx client: `repo/backend/src/services/outbound.service.ts:394`
- Regression test explicitly verifies rollback/no mutation on invalid SHORT: `repo/backend/api_tests/outbound.depth.test.ts:441`
- Conclusion: The reported atomicity defect is addressed.

### 2) High: Billing retention lifecycle incomplete (expiry path not wired)
- Previous finding: `repo/backend/prisma/schema.prisma:566`, `repo/backend/src/services/membership.service.ts:364`, `repo/backend/src/repositories/admin.repository.ts:179`, `repo/backend/src/routes/membership.routes.ts:281`
- Current status: **Fixed**
- Current evidence:
- Payment soft-delete service now computes and sets retention expiry: `repo/backend/src/services/membership.service.ts:450`, `repo/backend/src/services/membership.service.ts:451`, `repo/backend/src/services/membership.service.ts:453`
- Payment soft-delete repository method exists: `repo/backend/src/repositories/membership.repository.ts:275`
- Payment soft-delete route is present: `repo/backend/src/routes/membership.routes.ts:360`
- Billing purge now uses `retentionExpiresAt < now` (and requires soft-delete state): `repo/backend/src/repositories/admin.repository.ts:176`, `repo/backend/src/repositories/admin.repository.ts:182`, `repo/backend/src/repositories/admin.repository.ts:191`
- Coverage test added for retention anchoring and purge eligibility: `repo/backend/api_tests/membership.depth.test.ts:299`
- Conclusion: End-to-end retention anchoring + purge gating is now wired.

### 3) Medium: Session create audit used empty/weak after-state digest
- Previous finding: `repo/backend/src/routes/auth.routes.ts:127`, `repo/backend/src/audit/audit.ts:10`, `repo/backend/prisma/schema.prisma:127`
- Current status: **Fixed**
- Current evidence:
- Session audit now writes non-empty sanitized after-state (`userId`, hash prefix, expiry, passwordVersion): `repo/backend/src/routes/auth.routes.ts:129`, `repo/backend/src/routes/auth.routes.ts:133`
- Digest behavior unchanged and deterministic (SHA-256 over object): `repo/backend/src/audit/audit.ts:9`, `repo/backend/src/audit/audit.ts:41`
- Unit test added for non-empty deterministic session after-state digest shape: `repo/backend/unit_tests/audit/audit.test.ts:56`
- Conclusion: The previously identified digest completeness gap is resolved.

### 4) Medium: Admin destructive confirm flags existed in schema but were not enforced in logic
- Previous finding: `repo/backend/src/shared/schemas/admin.schemas.ts:11`, `repo/backend/src/shared/schemas/admin.schemas.ts:76`, `repo/backend/src/routes/admin.routes.ts:157`, `repo/backend/src/services/admin.service.ts:161`, `repo/backend/src/services/admin.service.ts:279`
- Current status: **Fixed**
- Current evidence:
- Service-level explicit confirmation guard exists: `repo/backend/src/services/admin.service.ts:66`
- Restore path enforces confirm argument: `repo/backend/src/services/admin.service.ts:173`
- Retention purge paths enforce confirm argument: `repo/backend/src/services/admin.service.ts:291`, `repo/backend/src/services/admin.service.ts:309`
- Routes now pass `request.body.confirm` into service calls:
- Restore: `repo/backend/src/routes/admin.routes.ts:157`
- Billing purge: `repo/backend/src/routes/admin.routes.ts:205`
- Operational purge: `repo/backend/src/routes/admin.routes.ts:231`
- API tests for missing/false confirm now exist: `repo/backend/api_tests/admin.test.ts:201`, `repo/backend/api_tests/admin.test.ts:211`
- Conclusion: Confirmation is now enforced beyond schema-level validation.

## Final Judgment
- All previously reported issues in .tmp/audit_report-2.md are **fixed** by current static implementation evidence.
- Manual runtime confirmation is still required for operational behavior under real deployment conditions.