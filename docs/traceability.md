# Requirement-to-Test Traceability

Maps each major original-prompt requirement to concrete backend test files and primary assertions.

## Legend

- **Unit** — `repo/backend/unit_tests/`
- **API** — `repo/backend/api_tests/`
- ✓ = covered by existing test
- [DB] = full happy-path test requires migrated DB (run via `run_tests.sh` inside Docker)

---

## 1. Authentication & Roles

| Requirement | Test File | Primary Assertion |
|---|---|---|
| Local username/password login | `api/auth.test.ts`, `api/auth.depth.test.ts` | Schema validation plus DB-backed login success and `/api/auth/me` token usage |
| Session issuance (opaque token, SHA-256 hash stored) | `unit/security/session.test.ts` | generateSessionToken returns 64-char hex; hashSessionToken is idempotent |
| Password rotation | `api/auth.test.ts`, `api/auth.depth.test.ts` | Unauthorized path plus DB-backed rotation invalidates prior sessions |
| Scrypt password hashing | `unit/security/password.test.ts` | hashPassword produces non-plaintext hash; verifyPassword returns true/false |
| Session token hash (SHA-256) | `unit/security/session.test.ts` | hashSessionToken matches expected output |
| RBAC — 7 roles | `unit/enums.test.ts` | Role enum has exactly 7 values |
| RBAC guards on protected routes | `api/warehouse.test.ts`, `api/outbound.test.ts`, `api/warehouse.depth.test.ts` | 401 for missing auth and 403 for role mismatch on manager-only operations |
| Rate limiting (120 req/min, burst 30) | `unit/security/ratelimit.test.ts` | minute-window and burst-window evaluators enforce limits and reset on expiry |
| IP allowlist enforcement | `unit/security/ipallowlist.test.ts` | isIpAllowed returns false when not in CIDR; open when no active entries |
| IP allowlist fail-closed mode (`IP_ALLOWLIST_STRICT_MODE=true`) | `unit/security/ipallowlist.test.ts`, `unit/config.test.ts` | isIpAllowed(…, { failClosed: true }) denies when no active entries; config reads env var |
| IP CIDR matching | `unit/admin/parameterKey.test.ts` | isIpInCidr covers /24, /8, /32, 0.0.0.0/0 |
| Append-only audit events | `unit/audit/audit.test.ts` | auditCreate, auditUpdate, auditTransition produce expected shape |
| Log safety (no password/key in logs) | `unit/logging/logger.test.ts` | domain logger uses structured JSON, while redact policy is configured in `src/app.ts` |
| Response masking by role | `unit/security/masking.test.ts` | maskEmail/maskPhone/maskMemberNumber/maskPaymentLast4 by role |
| Encryption at rest (AES-256-GCM) | `unit/security/encryption.test.ts` | encryptFieldString/decryptFieldString round-trip |
| Key version envelope (version byte prefix) | `unit/admin/backup.test.ts` | encryptBuffer embeds version as first 4 bytes |
| 180-day key rotation | `api/admin.test.ts` | POST /api/admin/key-versions/rotate → 401 without token |

---

## 2. Warehouse Operations

| Requirement | Test File | Primary Assertion |
|---|---|---|
| Facility CRUD | `api/warehouse.test.ts` | POST /api/warehouse/facilities missing name → 400 |
| Zone CRUD | `api/warehouse.test.ts` | GET /api/warehouse/zones → 401 without token |
| Location CRUD — code uniqueness | `api/warehouse.test.ts` | POST /api/warehouse/locations missing capacityCuFt → 400 |
| Location capacity (exclusiveMinimum: 0) | `api/warehouse.test.ts` | POST /api/warehouse/locations capacityCuFt=0 → 400 |
| Location hazard class | `api/warehouse.test.ts` | POST /api/warehouse/locations invalid hazardClass → 400 |
| Location type enum (7 values) | `unit/warehouse/location.test.ts` | LocationType has 7 values |
| HazardClass enum (6 values incl. NONE) | `unit/warehouse/location.test.ts` | HazardClass has 6 values |
| TemperatureBand enum (4 values) | `unit/warehouse/location.test.ts` | TemperatureBand has 4 values |
| SKU — unitWeightLb required | `api/warehouse.test.ts` | POST /api/warehouse/skus missing unitWeightLb → 400 |
| SKU — ABC class enum (A/B/C) | `api/warehouse.test.ts`, `unit/warehouse/location.test.ts` | invalid abcClass → 400 |
| Inventory lot counts ≥ 0 | `unit/warehouse/location.test.ts` | schema onHand minimum=0 |
| Appointment state machine | `unit/invariants.test.ts`, `unit/warehouse/appointment.test.ts` | All valid/invalid transitions covered |
| PENDING → CONFIRMED → RESCHEDULED with legal exits | `unit/warehouse/appointment.test.ts` | CONFIRMED→RESCHEDULED and RESCHEDULED→CONFIRMED/CANCELLED/EXPIRED transitions are enforced |
| Terminal states (CANCELLED/EXPIRED) | `unit/warehouse/appointment.test.ts` | Terminal states return empty allowed-transitions array |
| Auto-expire after 2 hours | `unit/invariants.test.ts`, `unit/warehouse/appointment.test.ts` | isAppointmentExpireEligible at 2h boundary |
| Auto-expire scheduler pass (transition + history + audit) | `unit/services/appointment.scheduler.test.ts` | runAppointmentExpiryPass with fake Prisma: expired PENDING → single state update, history entry, SYSTEM audit transition |
| Immutable operation history | `unit/services/appointment.scheduler.test.ts` | `runAppointmentExpiryPass` asserts `appointmentOperationHistory.create` is called with actor/priorState/newState for each expired appointment |
| CONFIRMED → RESCHEDULED (reschedule) | `unit/warehouse/appointment.test.ts` | isValidAppointmentTransition(CONFIRMED, RESCHEDULED) = true |
| Facility create role gate (manager-only) | `api/warehouse.depth.test.ts` | WAREHOUSE_OPERATOR receives 403, WAREHOUSE_MANAGER receives 201 |
| Illegal appointment transition returns 409 | `api/warehouse.depth.test.ts` | PENDING → RESCHEDULED rejected with INVALID_TRANSITION |

---

## 3. Outbound Execution Engine

| Requirement | Test File | Primary Assertion |
|---|---|---|
| OutboundOrder create (DRAFT state) | `api/outbound.test.ts` | POST /api/outbound/orders missing facilityId → 400 |
| OutboundOrder lines (minItems: 1) | `api/outbound.test.ts` | POST /api/outbound/orders lines=[] → 400 |
| OutboundType enum (SALES/RETURN/TRANSFER) | `api/outbound.test.ts`, `unit/enums.test.ts` | invalid type → 400; enum has 3 values |
| Wave generation with idempotency key (24h) | `api/outbound.test.ts`, `api/outbound.depth.test.ts` | Schema checks plus DB-backed replay (200) and mismatch conflict (409 IDEMPOTENCY_CONFLICT) |
| Idempotency window (24h) | `unit/outbound/idempotency.test.ts` | isIdempotencyKeyExpired at boundary; custom window |
| PickTask status enum | `unit/enums.test.ts`, `api/outbound.test.ts` | PATCH pick-tasks invalid status → 400 |
| PickTask terminal states → wave completion | `unit/outbound/shortageHandling.test.ts` | COMPLETED/SHORT/CANCELLED are terminal; PENDING/IN_PROGRESS are not |
| Pack verification ±5% tolerance | `unit/outbound/packVerification.test.ts`, `api/outbound.depth.test.ts` | invariant coverage plus API 422 VARIANCE_EXCEEDED when tolerance is exceeded |
| Pack verification: reject actualWeightLb=0 | `api/outbound.test.ts` | POST pack-verify actualWeightLb=0 → 400 |
| Pack verification: require both weight+volume | `api/outbound.test.ts` | POST pack-verify missing actualVolumeCuFt → 400 |
| Shortage = task.quantity − quantityPicked | `unit/outbound/shortageHandling.test.ts` | computeShortageQuantity covers all cases |
| ShortageReason enum (STOCKOUT/DAMAGE/OVERSELL) | `unit/outbound/shortageHandling.test.ts`, `unit/enums.test.ts` | 3 values; enum tested |
| Backorder line (BACKORDER lineType, sourceLineId FK) | `unit/outbound/shortageHandling.test.ts`, `unit/enums.test.ts` | OrderLineType.BACKORDER exists |
| Manager approval for partial shipment | `api/outbound.test.ts`, `api/outbound.depth.test.ts` | unauthorized guard plus APPROVAL_REQUIRED before approval and successful handoff after approval |
| Handoff recording | `api/outbound.test.ts` | POST /api/outbound/orders/:id/handoff missing carrier → 400 |

---

## 4. Strategy Center

| Requirement | Test File | Primary Assertion |
|---|---|---|
| StrategyRuleset — 5 configurable weights | `api/strategy.test.ts` | POST /api/strategy/rulesets missing name → 400 |
| Weight range validation (0–10) | `api/strategy.test.ts` | PATCH fifoWeight=11 → 400 |
| ABC pick priority (A=3, B=2, C=1) | `unit/strategy/scoring.test.ts` | abcPickPriority('A')=3, ('B')=2, ('C')=1 |
| Path cost by location type | `unit/strategy/scoring.test.ts` | pathCostScore covers all 7 location types |
| ABC putaway alignment score | `unit/strategy/scoring.test.ts` | A+PICK_FACE > A+BULK; C+BULK > C+PICK_FACE |
| Composite putaway score | `unit/strategy/scoring.test.ts` | computePutawayScore: near location > far with high pathCostWeight |
| Pick score: FIFO (older lot higher) | `unit/strategy/scoring.test.ts` | 30-day-old lot scores higher than 1-day-old |
| Pick score: FEFO (sooner expiry higher) | `unit/strategy/scoring.test.ts` | 5-day expiry scores higher than 100-day expiry |
| Pick score: expired lot gets highest FEFO | `unit/strategy/scoring.test.ts` | expired lot > valid lot with fefoWeight=1 |
| Putaway rank endpoint | `api/strategy.test.ts`, `api/strategy.depth.test.ts` | Schema validation plus DB-backed ranking success for compatible facility/sku |
| Pick-path endpoint | `api/strategy.test.ts` | POST /api/strategy/pick-path missing facilityId/pickTaskIds → 400 |
| 30-day simulation | `api/strategy.test.ts`, `api/strategy.depth.test.ts` | Schema validation plus DB-backed simulation success with deterministic envelope fields |
| Simulation: local data only, deterministic | `unit/strategy/scoring.test.ts` | All scoring functions are pure (no DB) |
| Simulation step-distance: structural zone+type metric (replaces string-prefix heuristic) | `unit/strategy/scoring.test.ts` | `estimatePickStepDistance` tests: same location→0, same zone→0.5, different zone→1.0, type-delta penalty, symmetric |

---

## 5. Membership & Billing Ledger

| Requirement | Test File | Primary Assertion |
|---|---|---|
| Member encrypted fields (memberNumber/email/phone) | `unit/security/encryption.test.ts`, `unit/security/masking.test.ts` | encryptFieldString/decryptFieldString round-trip; maskMemberNumber by role |
| Member number uniqueness via deterministic keyed hash (O(1) lookup, no O(n) decrypt-scan) | `unit/security/encryption.test.ts` | `deriveLookupHash` is deterministic, key-bound, plaintext-separable, whitespace-normalized |
| Member uniqueness (application-level, decrypt-scan) | `—` | No direct uniqueness assertion currently; [DB] add a duplicate-member create test expecting `CONFLICT` |
| PackageType enum (4 values) | `unit/enums.test.ts`, `unit/membership/packageTypes.test.ts` | Exactly 4 values |
| PUNCH requires punchCount | `unit/membership/membershipRules.test.ts` | validatePackageTypeRequiredFields('PUNCH', {}) returns error |
| TERM requires durationDays | `unit/membership/membershipRules.test.ts` | validatePackageTypeRequiredFields('TERM', {}) returns error |
| STORED_VALUE requires storedValue | `unit/membership/membershipRules.test.ts` | validatePackageTypeRequiredFields('STORED_VALUE', {}) returns error |
| BUNDLE has no extra requirements | `unit/membership/membershipRules.test.ts` | validatePackageTypeRequiredFields('BUNDLE', {}) returns null |
| Package price exclusiveMinimum: 0 | `api/membership.test.ts` | POST packages price=0 → 400 |
| Enrollment (ACTIVE, SUSPENDED, EXPIRED, CANCELLED) | `unit/membership/membershipRules.test.ts` | EnrollmentStatus has 4 values |
| Enrollment: requires packageId + startDate | `api/membership.test.ts` | POST enrollments missing packageId → 400; missing startDate → 400 |
| Invoice number format (GC-YYYYMMDD-NNNNN) | `unit/invariants.test.ts`, `unit/membership/invoice.test.ts` | generateInvoiceNumber format verified |
| Invoice uniqueness (collision loop) | `unit/membership/invoice.test.ts` | Different dates produce different invoice numbers |
| Payment status transitions | `unit/membership/paymentTransitions.test.ts` | RECORDED→SETTLED/VOIDED valid; SETTLED→REFUNDED valid; VOIDED→anything invalid |
| Payment masking (last4 visible to BILLING_MANAGER/SYSTEM_ADMIN) | `unit/security/masking.test.ts` | maskPaymentLast4 by role |
| Payment amount exclusiveMinimum: 0 | `api/membership.test.ts` | POST payments amount=0 → 400; amount negative → 400 |
| Payment last4 format (4 digits) | `api/membership.test.ts` | POST payments last4='ABCD' → 400 |
| 7-year billing retention | `unit/admin/retention.test.ts` | getBillingRetentionYears()=7; isRetentionPurgeable |
| Payment retentionExpiresAt | `unit/invariants.test.ts` | getRetentionExpiryDate adds 7 years |
| Member listing role gate + unmasked memberNumber visibility | `api/membership.depth.test.ts` | MEMBERSHIP_MANAGER sees full memberNumber; WAREHOUSE_OPERATOR gets 403 |
| Payment last4 role masking in API responses | `api/membership.depth.test.ts` | BILLING_MANAGER sees last4; non-billing role receives null |

---

## 6. CMS Publishing

| Requirement | Test File | Primary Assertion |
|---|---|---|
| Article 6-state FSM | `unit/cms/articleStates.test.ts`, `unit/invariants.test.ts` | All valid/invalid transitions covered |
| DRAFT → IN_REVIEW → APPROVED → PUBLISHED | `unit/cms/articleStates.test.ts` | Each step is valid; skipping is invalid |
| APPROVED → SCHEDULED → PUBLISHED (auto) | `unit/cms/articleStates.test.ts` | APPROVED→SCHEDULED valid; SCHEDULED→PUBLISHED valid |
| PUBLISHED → WITHDRAWN → DRAFT (reactivate) | `unit/cms/articleStates.test.ts` | Both transitions valid |
| Reviewer gating (CMS_REVIEWER/SYSTEM_ADMIN) | `api/cms.depth.test.ts` | Non-reviewer approve gets 403 FORBIDDEN; CMS_REVIEWER approve/publish transitions succeed |
| Scheduled publish eligibility | `unit/cms/articleStates.test.ts` | isArticleScheduledPublishEligible: past date=true, future=false, null=false |
| Scheduled publish scheduler pass (SCHEDULED → PUBLISHED + audit) | `unit/services/cms.scheduler.test.ts` | runCmsPublishPass with fake Prisma: due article updated to PUBLISHED, SYSTEM transition audit written |
| Article PATCH object-level auth (author or reviewer only) | `api/cms.depth.test.ts` | PATCH /api/cms/articles/:id by non-author WAREHOUSE_OPERATOR → 403 FORBIDDEN; author and CMS_REVIEWER succeed |
| Schedule requires scheduledPublishAt | `api/cms.test.ts` | POST /api/cms/articles/:id/schedule missing scheduledPublishAt → 400 |
| Article slug format (^[a-z0-9]+(?:-[a-z0-9]+)*$) | `api/cms.test.ts` | POST /api/cms/articles invalid slug → 400 |
| Article requires title+slug+body | `api/cms.test.ts` | Missing each required field → 400 |
| Category slug format | `api/cms.test.ts` | POST /api/cms/categories invalid slug → 400 |
| Category requires name+slug | `api/cms.test.ts` | Missing each required field → 400 |
| Tag normalized uniqueness | `unit/cms/tagNormalize.test.ts` | normalizeTagName: trim, collapse, lowercase |
| Tag merge creates tombstone | `unit/cms/articleStates.test.ts` (state machine), `api/cms.test.ts` | POST /api/cms/tags/merge → 401 without token |
| Tag merge: sourceTagId required | `api/cms.test.ts` | POST /api/cms/tags/merge missing sourceTagId → 400 |
| Tag merge: targetTagId required | `api/cms.test.ts` | POST /api/cms/tags/merge missing targetTagId → 400 |
| Tag alias creation | `api/cms.test.ts` | POST /api/cms/tags/:id/aliases missing alias → 400 |
| Bulk tag migration | `api/cms.test.ts` | POST /api/cms/tags/bulk-migrate missing fromTagId/toTagId → 400 |
| Article interactions (VIEW/SHARE/BOOKMARK/COMMENT) | `api/cms.test.ts` | POST interactions missing type → 400; invalid type → 400 |
| Trending tags (7-day window) | `api/cms.test.ts` | GET /api/cms/tags/trending → 401 without token |
| Tag cloud | `api/cms.test.ts` | GET /api/cms/tags/cloud → 401 without token |
| Reviewer-gated approve/publish transitions | `api/cms.depth.test.ts` | non-reviewer approve → 403; reviewer transitions to APPROVED/PUBLISHED |
| Scheduled publish transition eligibility | `api/cms.depth.test.ts` | reviewer schedules APPROVED article to SCHEDULED with future timestamp |

---

## 7. Operational Compliance

| Requirement | Test File | Primary Assertion |
|---|---|---|
| Encrypted local backup (AES-256-GCM) | `unit/admin/backup.test.ts` | encryptBuffer/decryptBuffer round-trip |
| Binary format [version(4)][nonce(12)][tag(16)][ciphertext] | `unit/admin/backup.test.ts` | First 4 bytes = version uint32 BE |
| Tamper detection (GCM auth tag) | `unit/admin/backup.test.ts` | Tampered ciphertext throws |
| Snapshot path traversal prevention | `unit/admin/backup.test.ts` | validateSnapshotPath strips directory components; ../ neutralized |
| Backup create → 401 without token | `api/admin.test.ts` | POST /api/admin/backup → 401 |
| Backup restore → confirm required | `api/admin.test.ts` | POST /api/admin/backup/:id/restore confirm=false → 400 |
| Restore: SYSTEM_ADMIN only | `api/admin.test.ts` | POST /api/admin/backup/:id/restore → 401 without token |
| 7-year billing retention | `unit/admin/retention.test.ts` | getBillingRetentionYears()=7; isRetentionPurgeable past expiry=true |
| 2-year operational log retention | `unit/admin/retention.test.ts` | getOperationalRetentionYears()=2 |
| Retention purgeable: both deletedAt AND expiry required | `unit/admin/retention.test.ts` | null deletedAt=false; null expiry=false |
| Purge billing → confirm required | `api/admin.test.ts` | POST /api/admin/retention/purge-billing missing confirm → 400 |
| Purge operational → confirm required | `api/admin.test.ts` | POST /api/admin/retention/purge-operational missing confirm → 400 |
| Parameter key format (^[a-zA-Z0-9._:-]+$) | `unit/admin/parameterKey.test.ts` | isValidParameterKey covers valid/invalid patterns |
| Parameter CRUD → SYSTEM_ADMIN + allowlist required | `api/admin.test.ts`, `api/admin.depth.test.ts` | GET/POST /api/admin/parameters → 401 without token; WAREHOUSE_MANAGER GET is 403; SYSTEM_ADMIN GET is 200 |
| Parameter: key required | `api/admin.test.ts` | POST /api/admin/parameters missing key → 400 |
| Parameter: key invalid chars | `api/admin.test.ts` | POST /api/admin/parameters key with spaces → 400 |
| IP allowlist CRUD → auth required | `api/admin.test.ts` | GET/POST /api/admin/ip-allowlist → 401 without token |
| IP allowlist: cidr + routeGroup required | `api/admin.test.ts` | POST missing cidr/routeGroup → 400 |
| IP allowlist: routeGroup enum | `api/admin.test.ts` | POST invalid routeGroup → 400 |
| Key rotation → auth required | `api/admin.test.ts` | POST /api/admin/key-versions/rotate → 401 without token |
| Key rotation: keyHash required | `api/admin.test.ts` | POST missing keyHash → 400 |
| Diagnostics endpoint → auth required | `api/admin.test.ts` | GET /api/admin/diagnostics → 401 without token |
| Allowlist lookup errors fail closed | `api/admin.depth.test.ts` | GET /api/admin/diagnostics returns 500 INTERNAL_ERROR when `ipAllowlistEntry.findMany` throws |
| Structured domain logging | `unit/logging/logger.test.ts` | createDomainLogger calls child() with {domain}; all 10 domains covered |
| Domain logging adoption (all route plugins + schedulers + backup/retention sub-domains) | `src/routes/*.routes.ts` (tagRequestLogDomain at each plugin), `src/app.ts` (scheduler wiring), `src/routes/admin.routes.ts` (backup/retention sub-domain loggers) | 7 route plugins emit `{ domain }`-tagged request logs; backup and restore handlers use `'backup'` child loggers; purge handlers use `'retention'` child loggers |
| Backup restore happy path + tamper detection + admin IP blocking | `api/admin.depth.test.ts` | restore success (200), tampered snapshot restore fails VALIDATION_FAILED, diagnostics blocked with IP_BLOCKED when allowlist excludes caller |

---

## 8. Cross-Cutting Security

| Requirement | Test File | Primary Assertion |
|---|---|---|
| AES-256-GCM field encryption | `unit/security/encryption.test.ts` | encryptFieldString/decryptFieldString round-trip; empty string handled |
| HKDF key derivation per version | `unit/admin/backup.test.ts` | Different version numbers produce different effective keys (decryption fails with wrong version if key is changed) |
| Master key startup guard (no zero-key fallback) | `unit/security/encryption.test.ts`, `unit/config.test.ts` | parseMasterKey rejects empty/short/overlength/non-hex keys; loadConfig rejects missing or malformed key in non-test env |
| Response envelope: success/error/meta | `api/auth.test.ts`, `api/admin.test.ts`, etc. | All error responses have {success:false, error:{code,message}, meta:{requestId,timestamp}} |
| VALIDATION_FAILED code on schema errors | `api/strategy.test.ts`, `api/outbound.test.ts` | 400 errors use VALIDATION_FAILED code |
| UNAUTHORIZED code on auth failures | `api/auth.test.ts`, `api/warehouse.test.ts` | 401 errors use UNAUTHORIZED code |
| Global validation error envelope normalization | `api/validation-envelope.test.ts` | warehouse/outbound/admin schema failures return `VALIDATION_FAILED` with structured `error.details` |
| Auth runs before schema validation on protected routes | `api/validation-envelope.test.ts` | fake-token POST /api/warehouse/facilities returns `401 UNAUTHORIZED` (not `400 VALIDATION_FAILED`) — confirms preValidation auth barrier |

---

## 9. Test Suite Infrastructure

| Requirement | Test File | Notes |
|---|---|---|
| Unit tests in unit_tests/ | `repo/backend/unit_tests/**/*.test.ts` | 27 test files covering pure functions and security primitives |
| API tests in api_tests/ | `repo/backend/api_tests/**/*.test.ts` | 17 test files: baseline contracts + depth suites + validation envelope |
| Docker-first test runner | `repo/run_tests.sh` | 4-step: build → migrate → unit tests → API tests |
| DB migration before API tests | `repo/run_tests.sh` | `prisma migrate deploy` in step 2 |
| Vitest unit config | `repo/backend/vitest.unit.config.ts` | includes: `unit_tests/**/*.test.ts` |
| Vitest API config | `repo/backend/vitest.api.config.ts` | includes: `api_tests/**/*.test.ts` |

---

## 10. Docker & Config (Prompt 9)

| Requirement | Test File / Asset | Notes |
|---|---|---|
| Config — all env vars parsed | `unit/config.test.ts` | PORT, HOST, DATABASE_URL, NODE_ENV, LOG_LEVEL, ENCRYPTION_MASTER_KEY, SESSION_TIMEOUT_HOURS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MINUTES, BACKUP_DIR |
| Config — docker-equivalent paths | `unit/config.test.ts` | docker-equivalent env test asserts /app/database and /app/backups paths |
| SQLite WAL mode + busy_timeout | `src/plugins/prisma.plugin.ts` | Applied via $executeRaw at plugin init |
| Dockerfile — non-root user | `repo/backend/Dockerfile` | greencycle user; BACKUP_DIR, LOG_LEVEL declared |
| Dockerfile — healthcheck | `repo/backend/Dockerfile` | wget /health; 30s interval, 15s start period |
| docker-compose — all env vars | `repo/docker-compose.yml` | BACKUP_DIR, LOG_LEVEL, SESSION_*, ENCRYPTION_MASTER_KEY (via shell env) |
| docker-compose — healthcheck | `repo/docker-compose.yml` | Mirrors Dockerfile HEALTHCHECK |
| API test DATABASE_URL from env | `repo/backend/api_tests/*.test.ts` | All API suites use process.env.DATABASE_URL ?? fallback |

---

## 11. Current Static Audit Alignment

Attestation that each audit checkpoint has a corresponding evidence source in the repo, including newly added depth and validation-envelope suites.

| Audit Checkpoint | Evidence Source |
|---|---|
| Repo structure compliance | `repo/README.md` (tree), `docs/design.md` §3, top-level `ls`; no `sessions/`, no root `unit_tests/`, no root `questions.md`, no `repo/frontend/` |
| Backend-only scope | No `repo/frontend/`; Dockerfile/compose reference only `backend` service |
| Docs present & synchronized | `docs/{design,api-spec,traceability,questions}.md`, `repo/README.md` all present and cross-linked |
| Port / path / volume consistency | `Dockerfile` + `docker-compose.yml` + `README.md` + `config.ts` + `run_tests.sh` all align on port 3000, `/app/database`, `/app/backups`, `greencycle-data`, `greencycle-backups` |
| Env var surface documented | `README.md` "Configuration" table + `docs/design.md` §22 table + `unit/config.test.ts` coverage |
| Security boundaries (auth + RBAC + rate + IP + audit + mask + encrypt) | `unit/security/*.test.ts` (6 files), `api/*.test.ts` 401 coverage across all protected routes, `unit/audit/audit.test.ts`, `unit/admin/backup.test.ts` |
| Append-only audit events | `src/audit/audit.ts`, `unit/audit/audit.test.ts` |
| Log redaction | `src/app.ts` Pino redact paths, `unit/logging/logger.test.ts` |
| Business-logic presence (FSMs, idempotency, variance, shortage, strategy, CMS, tags) | See sections 1–10 above — depth suites add DB-backed assertions for critical paths |
| Backup + restore path-traversal prevention | `unit/admin/backup.test.ts` (validateSnapshotPath, GCM tamper detection) |
| Retention (7y billing / 2y operational) | `unit/admin/retention.test.ts`, `api/admin.test.ts` confirm routes |
| Key rotation + 180-day expiry | `api/admin.test.ts` rotate auth check, `unit/admin/backup.test.ts` version envelope |
| Requirement-to-test traceability | This document (sections 1–10 + this section) |
| Doc honesty (no stale acceptance claims) | `repo/README.md`, `docs/api-spec.md`, `docs/design.md`, `docs/questions.md` updated to remediation-state language |
| IP allowlist scope clearly documented | `docs/design.md` §18 route-group enforcement note, `docs/questions.md` #10 closing clarification |
| No Docker / test execution during implementation | Verified by absence of runtime artifacts (no `*.db`, no `node_modules` under `repo/backend`, no build output) |

---

## Notes on DB-Required Tests

Tests marked `[DB]` require a migrated SQLite database with fixture data and run fully inside Docker via `run_tests.sh`. These cover:

- **Happy paths**: create/read operations that touch Prisma
- **Not-found flows (404)**: retrieving non-existent resource IDs
- **Conflict paths (409)**: duplicate usernames, invoice numbers, SKU codes
- **State transition enforcement (409)**: illegal appointment/article transitions
- **Manager approval gating**: partial shipment approval flow
- **Idempotency replay**: wave generation returning cached response
- **Tag tombstone merge**: self-merge rejection, duplicate tag rejection
- **Encryption round-trips**: member field create/read with decrypt+mask

Tests that do NOT require a migrated DB (all currently authored):
- 401 unauthenticated access (auth middleware fires before DB)
- 400 schema validation failures (JSON Schema validates before DB)
- Pure function unit tests (no Prisma dependency)
