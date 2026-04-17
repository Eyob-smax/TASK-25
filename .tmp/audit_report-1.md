# GreenCycle Warehouse & Content Operations API
## Delivery Acceptance and Project Architecture Audit — Report 4

**Date:** 2026-04-17  
**Auditor:** Static analysis only — no Docker, no test execution, no code changes  
**Scope:** `repo/` and `docs/` folders only  

---

## Verdict

**PARTIAL PASS**

No Blocker-severity gaps. No High-severity functional omissions. One High-severity test defect (failing assertion due to shared-DB state pollution), two Medium-severity issues, and four Low-severity observations. The core business logic, security model, RBAC enforcement, persistence layer, and encryption infrastructure are sound. The identified issues are actionable and bounded.

---

## Scope and Static Verification Boundary

All findings are derived from static file reads only:
- Prisma schema, migration SQL structure, TypeScript source files
- Route handlers, service layer, repositories, security primitives, schedulers
- Test files (unit and API), test helpers, vitest configs
- `package.json`, `Dockerfile`, `docker-compose.yml`, `run_tests.sh`
- `docs/traceability.md`, `docs/api-spec.md`, `docs/design.md`, `repo/README.md`

No code was executed. No containers were built. No tests were run. Claims about runtime behavior are inferred from source.

---

## Repository and Requirement Mapping Summary

| Prompt Requirement | Implementation Location | Test Coverage |
|---|---|---|
| Appointment FSM + immutable history | `warehouse.service.ts`, `invariants.ts` | `appointment.test.ts`, `warehouse.depth.test.ts` |
| Appointment auto-expire (2-hour scheduler) | `appointment.scheduler.ts` | `warehouse.depth.test.ts` |
| Wave 24-hour idempotency dedup | `outbound.service.ts` | `outbound.depth.test.ts` |
| Pack ±5% tolerance enforcement | `outbound.service.ts`, `invariants.ts` | `outbound.depth.test.ts` |
| Shortage → BACKORDER conversion | `outbound.service.ts` | `outbound.depth.test.ts` |
| Manager approval gate (partial ship) | `outbound.service.ts`, `outbound.routes.ts` | `outbound.depth.test.ts` |
| Strategy scoring (FIFO/FEFO/ABC/heat/path) | `strategy.service.ts` | `strategy.test.ts` |
| 30-day simulation | `strategy.service.ts` | `strategy.depth.test.ts` |
| Member encrypted PII fields | `membership.service.ts`, `encryption.ts` | `membership.depth.test.ts` |
| Invoice number uniqueness loop | `membership.service.ts`, `invariants.ts` | `invoice.test.ts` |
| Payment status transitions | `membership.service.ts`, `invariants.ts` | `payment.test.ts` |
| CMS Article 6-state FSM | `cms.service.ts`, `invariants.ts` | `cms.depth.test.ts` |
| CMS reviewer role gate | `cms.routes.ts`, `cms.service.ts` | `cms.depth.test.ts` |
| CMS scheduled publish (local setInterval) | `cms.scheduler.ts` | `cms.depth.test.ts` |
| Tag merge with tombstone | `cms.service.ts` | `cms.depth.test.ts` |
| AES-256-GCM backup + SHA-256 checksum | `admin.service.ts`, `encryption.ts` | `admin.depth.test.ts` |
| Path-traversal prevention on restore | `invariants.ts:validateSnapshotPath` | `admin.depth.test.ts` |
| 7-year billing retention purge | `admin.service.ts` | `admin.depth.test.ts` |
| 2-year operational log purge | `admin.service.ts` | `admin.depth.test.ts` |
| Encryption key rotation (180-day) | `admin.service.ts`, `encryption.ts` | `admin.depth.test.ts` |
| RBAC (7 roles) | `rbac.ts`, all route handlers | All depth tests |
| scrypt password hashing + AES envelope | `password.ts` | `password.test.ts` |
| Opaque session tokens (SHA-256 stored) | `session.ts` | `session.test.ts` |
| Rate limiting 120 req/min + burst 30 | `security.plugin.ts` | `auth.depth.test.ts` |
| IP allowlist CIDR enforcement | `ipallowlist.ts`, `security.plugin.ts` | `admin.depth.test.ts` |
| Audit trail (before/after SHA-256) | `audit.ts` | `audit.test.ts` |
| Pino log redaction (password, last4, etc.) | `app.ts` (redact config) | `logging.test.ts` |
| Parameter dictionary CRUD | `admin.routes.ts`, `admin.service.ts` | `admin.depth.test.ts` |
| Diagnostics endpoint | `admin.routes.ts`, `admin.service.ts` | `admin.depth.test.ts` |

Coverage is comprehensive. No prompt requirement was found to be entirely unimplemented.

---

## Section-by-Section Review

### 1. Hard Gates

#### 1.1 Technology Stack Compliance
**PASS.** All mandated technologies are present and correctly versioned:
- `fastify ^5.3.0` (Fastify 5.x ✓)
- `@prisma/client ^6.5.0` (Prisma 6.x ✓)
- `pino ^9.6.0` (Pino 9.x ✓)
- `vitest` in devDependencies (Vitest 3.x per README ✓)
- `typescript` in devDependencies (TypeScript 5.7+ per tsconfig ✓)
- `sqlite` via Prisma datasource ✓
- No Express, Knex, Sequelize, Jest, or Mocha present ✓

One packaging gap (pino-pretty) is noted under issues — it does not affect stack compliance for production, only local dev startup.

#### 1.2 Security Non-Negotiables
**PASS with one observation.**

- All protected routes require authentication: every route handler examined uses `fastify.authenticate` in its `preHandler` array, with one nuanced exception (outbound/strategy routes use `requireRole` as a single function — auth IS enforced functionally, but before-schema short-circuit is absent; classified as Medium, not a Hard Gate failure).
- RBAC role checks present on every sensitive route: ✓
- Encrypted at rest: member PII (memberNumber/email/phone), password hash envelope — all via AES-256-GCM with HKDF key derivation ✓
- Role-aware masking: `maskUser`, `maskPaymentLast4`, `maskMemberNumber` — correct visibility rules ✓
- Audit events: append-only, SHA-256 before/after digests, no update path ✓
- Log redaction: `['Authorization', 'password', 'currentPassword', 'newPassword', 'last4']` in Pino config ✓
- Rate limiting: 120 req/min per principal, burst 30 sub-window ✓
- IP allowlists: enforced on privileged (`admin`) route group ✓
- Backup path-traversal prevention: `validateSnapshotPath` uses `path.basename()` + resolved-path prefix check ✓
- Backup restore: SYSTEM_ADMIN only ✓

#### 1.3 Repository Structure Compliance
**PASS.** Forbidden paths are absent:
- No `repo/frontend/` ✓
- No root-level `unit_tests/` or `API_tests/` ✓
- No root-level `questions.md` (it lives at `docs/questions.md`) ✓
- `sessions/` directory: not read or modified ✓
- `unit_tests/` and `api_tests/` under `repo/backend/` only ✓

#### 1.4 Business Logic Non-Simplification
**PASS.** All CLAUDE.md §7 items verified as real persistence-backed logic:
- Appointment FSM: transitions validated via `isValidAppointmentTransition`; history written via `AppointmentOperationHistory` CREATE on every transition ✓
- Auto-expire: `runAppointmentExpiryPass` scheduler at 60-second interval; transitions PENDING→EXPIRED at createdAt+2h boundary ✓
- Immutable history: `AppointmentOperationHistory` has no `updatedAt`/`deletedAt`; no UPDATE path in service ✓
- Wave idempotency: `IdempotencyRecord` with 24-hour TTL; `IDEMPOTENCY_CONFLICT` returned on replay within window ✓
- Pack variance: ±5% computed and thrown as `VARIANCE_EXCEEDED` when exceeded; `PackVerification` record persisted ✓
- Shortage→BACKORDER: automatic `OutboundOrderLine` creation with `sourceLineId` FK ✓
- Manager approval gate: `approvedForPartialShip` flag checked before partial handoff; `APPROVAL_REQUIRED` error if false ✓
- Strategy scoring: 5-weight engine (`fifoWeight`, `fefoWeight`, `abcWeight`, `heatLevelWeight`, `pathCostWeight`) with configurable `StrategyRuleset` ✓
- 30-day simulation: historical COMPLETED tasks re-sequenced; comparative metrics output ✓
- CMS scheduled publish: `runCmsPublishPass` fires `setInterval`; transitions SCHEDULED→PUBLISHED when `scheduledPublishAt ≤ now` ✓
- Tag merges: `isTombstone=true` + `canonicalTagId` set on source; self-merge rejected with CONFLICT ✓

---

### 2. Delivery Completeness

**PASS.** All seven prompt domains delivered:

| Domain | Status |
|---|---|
| Auth & Infrastructure | Delivered — login, user CRUD, session lifecycle, bootstrap admin |
| Warehouse Operations | Delivered — facilities, zones, locations, SKUs, lots, appointments, history |
| Outbound Execution | Delivered — orders, waves, pick tasks, pack verification, handoff, backorder |
| Strategy Center | Delivered — ruleset CRUD, putaway ranking, pick-path planning, simulation |
| Membership & Billing | Delivered — member lifecycle, packages, enrollment, invoicing, payments, retention |
| CMS Publishing | Delivered — articles, categories, tags, aliases, merges, trending/cloud, scheduler |
| Operational Compliance | Delivered — backup/restore, retention purge, parameters, diagnostics, key rotation |

---

### 3. Engineering Quality

#### 3.1 Layer Separation
**PASS.** Strict 8-layer separation maintained (CLAUDE.md §12):
- Routes: request parsing, schema validation, `preHandler` guards, response serialization
- Services: business logic, FSM transitions, invariant enforcement
- Repositories: Prisma data access (distinct files per domain)
- Schedulers: isolated `appointment.scheduler.ts`, `cms.scheduler.ts`
- Security primitives: `encryption.ts`, `password.ts`, `session.ts`, `masking.ts`, `ipallowlist.ts`, `ratelimit.ts`
- Audit: `audit.ts` standalone writer
- Config: `config.ts` typed, centralized
- Plugins: `prisma.plugin.ts`, `auth.plugin.ts`, `security.plugin.ts`

No god-service pattern detected.

#### 3.2 Error Envelope Consistency
**PASS.** Global error handler in `app.ts` normalizes Fastify validation errors and uncaught errors into the standard `{ success, error: { code, message } }` envelope. Domain services throw with standard codes (`VALIDATION_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VARIANCE_EXCEEDED`, etc.).

#### 3.3 Schema Validation
**PASS.** All endpoints use Fastify JSON Schema (no Zod/Joi). Schemas defined in `src/shared/schemas/` and referenced at route registration. Admin, warehouse, outbound, strategy, membership, CMS, and auth schemas all present.

#### 3.4 Prisma Schema Integrity
**PASS.** All required constraints present:
- Unique indexes: `username`, `Sku.code`, `Location.locationCode`, `Tag.normalizedName`, `MemberPackageEnrollment` composite
- Composite indexes for performance: facility+location, SKU+lot+expiry, article publish time
- Soft delete fields (`deletedAt DateTime?`) on billing/operational records
- Immutable models (`AppointmentOperationHistory`, `AuditEvent`): no `updatedAt`/`deletedAt`
- All enums as String (correct for SQLite)

---

### 4. Engineering Details

#### 4.1 Auth Plugin Sequencing
The `preValidation` short-circuit mechanism (`auth.plugin.ts:106`) fires only when `authenticateImpl` appears in the route's `preHandler` list. This correctly prevents schema validation from running for unauthenticated callers on warehouse, admin, membership, and CMS routes, which all use the `[fastify.authenticate, ...]` array pattern. The outbound and strategy routes use `fastify.requireRole(...)` as a single handler (not an array), so this protection is absent there. Details in Issues section.

#### 4.2 Session Security
`generateSessionToken` returns 32 random bytes as 64-char hex. The plaintext is returned once to the caller; only the SHA-256 hash is stored in DB. `isSessionValid` checks `revokedAt`, `expiresAt`, and `passwordVersion` (forcing logout on password change). Correct.

#### 4.3 Encryption Architecture
AES-256-GCM with random per-field nonces. HKDF-SHA256 key derivation from master key + version number. Key rotation marks current ACTIVE key as ROTATED and creates new version. Field-level encrypted values stored as `version:nonce:tag:ciphertext` strings. Backup uses binary format `[keyVersion(4 BE)][nonce(12)][tag(16)][ciphertext]`. Both formats correctly encode the version for future decryption after rotation.

#### 4.4 Scheduler Safety
Both schedulers (`appointment.scheduler.ts`, `cms.scheduler.ts`) export the pass function as a pure function, making them unit-testable without timers. The `setInterval` handle is stored and cleared in `onClose`, preventing test leaks. The `buildApp()` registers schedulers in `onReady`, not at construction time, which is correct for Fastify lifecycle ordering.

#### 4.5 Backup/Restore Path Safety
`validateSnapshotPath` applies two checks: `path.basename(filename) === filename` (rejects any path containing `/` or `..`) and a `path.resolve(backupDir, filename)` prefix check (rejects resolved paths outside `backupDir`). This covers the primary traversal vectors.

#### 4.6 Idempotency
`IdempotencyRecord` stores key, status, cached response, and `expiresAt`. Wave generation checks for existing unexpired record before processing; on hit, returns cached response directly. `expiresAt` set to `createdAt + 24h`. Correct.

---

### 5. Prompt Understanding

All prompt requirements are correctly understood and implemented. No requirement was misinterpreted or silently omitted. The CMS article lifecycle (`WITHDRAWN → DRAFT` re-entry) and the wave idempotency replay (returns cached response, not 409) demonstrate accurate interpretation of nuanced requirements.

---

### 6. Aesthetics (N/A — Backend Only)

Not applicable per CLAUDE.md §1.

---

## Issues — Severity-Rated

### HIGH

#### H-1: Admin Depth Test — Shared DB State Pollution Causes Failing Assertion

**File:** `repo/backend/api_tests/admin.depth.test.ts:78-99, 124-130`

**Description:**  
The first `it` block in the `Admin depth` describe suite adds a CIDR entry (`203.0.113.X/32`) to the IP allowlist for `routeGroup='admin'` in the shared `test.db`. The `beforeEach` hook rebuilds the Fastify app but does NOT clear the `IpAllowlistEntry` table. The second `it` block then issues an admin request from `127.0.0.1` and asserts `statusCode === 200`. However, since `isIpAllowed` returns `false` when there is at least one active entry and the caller's IP is not in any of them, `127.0.0.1` is now blocked by the entry inserted in block 1. The assertion fails with 403 IP_BLOCKED.

**Evidence:**
```typescript
// admin.depth.test.ts:78-89 (test 1 — inserts entry)
const blockCidr = `203.0.113.${Math.floor(Math.random() * 200) + 1}/32`;
const addAllowlist = await app.inject({
  method: 'POST',
  url: '/api/admin/ip-allowlist',
  ...
  payload: { cidr: blockCidr, routeGroup: 'admin', ... },
});
expect(addAllowlist.statusCode).toBe(201);  // entry now in DB

// admin.depth.test.ts:124-130 (test 2 — expects 200 but gets 403)
const adminRead = await app.inject({
  method: 'GET',
  url: '/api/admin/parameters',
  headers: authHeader(admin.token),
  remoteAddress: '127.0.0.1',   // not in 203.0.113.X/32
});
expect(adminRead.statusCode).toBe(200);  // FAILS — gets 403 IP_BLOCKED
```

**Root cause:** `isIpAllowed` (`security/ipallowlist.ts:62-64`) switches from open-by-default to restricted the moment any active entry exists. Test 1 creates that entry; test 2 runs in the same DB state.

**Fix:** In `afterEach` (or at the start of test 2), delete all `IpAllowlistEntry` rows:
```typescript
afterEach(async () => {
  await app.prisma.ipAllowlistEntry.deleteMany({});
  await app.close();
  await rm(backupDir, { recursive: true, force: true });
});
```

---

### MEDIUM

#### M-1: Auth-Before-Validation Short-Circuit Missing on Outbound and Strategy Routes

**Files:** `repo/backend/src/routes/outbound.routes.ts:55-57`, `repo/backend/src/routes/strategy.routes.ts:49-51`, `repo/backend/src/plugins/auth.plugin.ts:106`

**Description:**  
The `preValidation` hook in `auth.plugin.ts` checks whether `authenticateImpl` is present in `routeOptions.preHandlers` to decide whether to short-circuit with `401 UNAUTHORIZED` before schema validation runs. Outbound and strategy routes register `requireRole(...)` as a bare single function, not as `[fastify.authenticate, fastify.requireRole(...)]`. As a result, an unauthenticated request with an invalid body to any outbound/strategy endpoint receives `400 VALIDATION_FAILED` (with schema error details) instead of `401 UNAUTHORIZED`. This leaks schema structure to unauthenticated callers.

Authentication itself is not bypassed — `requireRole` checks `request.principal === null` and returns 401 — but the ordering is wrong: schema validation fires first.

**Evidence:**
```typescript
// outbound.routes.ts:55-57
fastify.get(
  '/orders',
  { schema: { querystring: listOrdersQuerySchema }, preHandler: fastify.requireRole(operatorRoles) },
  // ↑ Should be: preHandler: [fastify.authenticate, fastify.requireRole(operatorRoles)]
```
```typescript
// auth.plugin.ts:106 — only fires when authenticateImpl is in preHandlers
if (!preHandlers.includes(authenticateImpl)) return;
```

**Fix:** Change all `preHandler: fastify.requireRole(...)` usages to `preHandler: [fastify.authenticate, fastify.requireRole(...)]` in `outbound.routes.ts` and `strategy.routes.ts`.

---

#### M-2: pino-pretty Not Listed in Dependencies

**Files:** `repo/backend/package.json`, `repo/backend/src/app.ts:50-52`

**Description:**  
`app.ts` configures Pino with a `pino-pretty` transport when `nodeEnv === 'development'`:
```typescript
transport: config.nodeEnv === 'development'
  ? { target: 'pino-pretty', options: { colorize: true } }
  : undefined,
```
`pino-pretty` is not present in `package.json` `dependencies` or `devDependencies`. Any developer running `npx tsx src/index.ts` locally (default `NODE_ENV=development`) will receive a module-not-found error at startup. Docker (`NODE_ENV=production`) and tests (`NODE_ENV=test`) are unaffected.

**Fix:** Add `"pino-pretty": "^13.0.0"` (or current stable) to `devDependencies` in `package.json`.

---

### LOW

#### L-1: IP Allowlist Open by Default on Fresh Deployment

**File:** `repo/backend/src/security/ipallowlist.ts:62-64`

**Description:**  
```typescript
const active = entries.filter((e) => e.isActive);
if (active.length === 0) return true;  // permit all when no entries configured
```
A fresh deployment with no configured IP allowlist entries permits all IPs to admin routes. This is fail-open on day zero. The behavior is consistent and documentable, but operators may not realize admin routes are unprotected until they add the first entry.

**Recommendation:** Document this explicitly in the operations section of `README.md`. Consider whether the intent is that admin IP restriction is opt-in or always-on.

---

#### L-2: Stale Internal Audit Reference in README

**File:** `repo/README.md:79`

**Description:**  
The Current State section contains:
> "Audit-driven remediation update: code and test remediations from `.tmp/audit_report-1.md` are applied statically; re-running the static audit is the remaining verification step."

This references an internal workflow artifact. Production READMEs should not expose audit toolchain references.

**Fix:** Remove or replace this line with a plain-language status description.

---

#### L-3: O(n) Member Number Uniqueness Scan

**File:** `repo/backend/src/services/membership.service.ts:75-86`

**Description:**  
Member number uniqueness is enforced by decrypting and comparing all existing member numbers at creation time (no DB-level unique index possible because values are encrypted). At scale this degrades linearly. For the declared offline single-node deployment model this is acceptable, but it should be noted as a scale constraint.

**No fix required** for the current deployment profile. Document the constraint if member volume is expected to grow large.

---

#### L-4: Simplistic Distance Heuristic in 30-Day Simulation

**File:** `repo/backend/src/services/strategy.service.ts:300-307`

**Description:**  
The simulation distance calculation uses a string-prefix proxy:
```typescript
if (prevLoc === currLoc) {
  estimatedTotalDistance += 0;
} else if (prevLoc.substring(0, 3) === currLoc.substring(0, 3)) {
  estimatedTotalDistance += 0.5;
} else {
  estimatedTotalDistance += 1.0;
}
```
This does not reflect physical coordinates. Comparative metrics from the simulation are internally consistent (same heuristic applied to both rulesets) but are not physically meaningful. This is acceptable given the offline/single-node constraint and the absence of physical layout data in the schema.

**No fix required.** Consider a documentation note in `docs/design.md` acknowledging the proxy metric.

---

## Security Review Summary

| Control | Status | Notes |
|---|---|---|
| Authentication | PASS | All routes gated; session token SHA-256 hashed at rest |
| Authorization (RBAC) | PASS | 7 roles; route-level + service-level checks |
| Password storage | PASS | scrypt N=32768 + AES-256-GCM envelope |
| Encryption at rest | PASS | AES-256-GCM, HKDF key derivation, version envelope |
| Key rotation | PASS | 180-day expiry, ROTATED state preserved for re-decrypt |
| Rate limiting | PASS | 120 req/min per principal + burst 30 sub-window |
| IP allowlists | PASS | CIDR enforcement, fail-closed on DB error (500 not allow) |
| Audit trail | PASS | Append-only, before/after SHA-256, no update path |
| Log redaction | PASS | password/last4/Authorization redacted in Pino config |
| Backup encryption | PASS | AES-256-GCM file-level, SHA-256 checksum verified on restore |
| Path traversal prevention | PASS | basename + resolved-path prefix double check |
| Auth-before-validation ordering | MEDIUM GAP | Outbound/strategy routes lack preValidation short-circuit |
| IP allowlist default posture | LOW NOTE | Open by default until first entry added |

---

## Tests and Logging Review

### Unit Tests
Coverage is thorough across all security primitives and domain invariants:
- `encryption.test.ts`: key derivation, round-trips, nonce uniqueness, wrong-key failure, master key parsing
- `password.test.ts`: hash/verify round-trip, timing-safe comparison, wrap/unwrap envelope
- `session.test.ts`: token generation, hash storage, expiry/revocation checks
- `appointment.test.ts`: all FSM transitions (valid/invalid), `getAllowedTransitions`, expire eligibility boundary
- `invariants.test.ts`: variance, FSM guards, invoice format, path validation
- `audit.test.ts`: append-only event creation, digest correctness
- `ipallowlist.test.ts`: CIDR matching, empty-list behavior

### API Tests
17 test files covering:
- Baseline contract suites (auth, warehouse, outbound, strategy, membership, CMS, admin)
- Depth suites for complex scenarios (idempotency, pack variance, partial shipment, CMS lifecycle, backup/restore)
- Validation-envelope normalization suite

### Logging
`createDomainLogger` utility creates child loggers with `{ domain }` binding. Domain tagging is applied consistently in service and scheduler files. Pino redaction list covers all sensitive fields required by CLAUDE.md §8.

---

## Test Coverage Assessment

| Requirement Category | Unit Test | API Test | Notes |
|---|---|---|---|
| Appointment FSM | `appointment.test.ts` | `warehouse.depth.test.ts` | Full transition matrix + boundary |
| Auto-expire scheduler | — | `warehouse.depth.test.ts` | Direct pass function invocation |
| Wave idempotency | `idempotency.test.ts` | `outbound.depth.test.ts` | Replay + conflict |
| Pack variance | `invariants.test.ts` | `outbound.depth.test.ts` | ±5% boundary |
| Shortage + backorder | — | `outbound.depth.test.ts` | E2E conversion |
| Partial ship approval | — | `outbound.depth.test.ts` | 422 before + 201 after |
| Strategy scoring | `strategy.test.ts` | `strategy.depth.test.ts` | Pure function coverage |
| CMS Article FSM | `cms.article.test.ts` | `cms.depth.test.ts` | Full 6-state lifecycle |
| CMS reviewer gate | — | `cms.depth.test.ts` | 403 on wrong role |
| Object-level auth (CMS) | — | `cms.depth.test.ts` | Stranger vs author vs reviewer |
| Backup/restore | `encryption.test.ts` | `admin.depth.test.ts` | Tampered backup → 400 |
| IP allowlist enforcement | `ipallowlist.test.ts` | `admin.depth.test.ts` | **H-1 test defect here** |
| Parameter CRUD | — | `admin.depth.test.ts` | Role restriction |
| Auth-before-validation | — | `validation-envelope.test.ts` | Warehouse only; outbound/strategy gap |

**Coverage gap identified:** `validation-envelope.test.ts` tests the 401-before-400 ordering for warehouse routes only. Outbound and strategy routes are not tested for this ordering — consistent with the M-1 implementation gap.

---

## Final Notes

The codebase is architecturally sound. The domain model, security model, and business logic implementation are all faithful to the requirements. No requirement is missing or stubbed. The identified issues are:

1. **One test defect** (H-1) that will cause a suite failure in CI — straightforward to fix with `afterEach` cleanup.
2. **One auth-ordering gap** (M-1) that is a defense-in-depth issue, not an authentication bypass — correct but should be tightened.
3. **One missing dev dependency** (M-2) that prevents local development startup.
4. **Three low-severity observations** that are operational notes, not defects.

No Blocker-level issues were found. The system is suitable for deployment after the H-1 test fix and M-1/M-2 remediations.
