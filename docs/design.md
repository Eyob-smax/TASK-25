# Design Document — GreenCycle Warehouse & Content Operations API

## 1. Project Overview

GreenCycle is a backend-only API for running an offline environmental supply warehouse paired with a local publishing and membership program. The system runs as a single-node Docker service with no external dependencies, using SQLite for all persistence.

**Domains:**
- Authentication & Roles
- Warehouse Operations (inventory, locations, appointments, outbound execution)
- Strategy Center (putaway ranking, pick-path planning, simulation evaluation)
- Membership & Billing Ledger
- CMS (articles, categories, tags, scheduled publishing)
- Cross-cutting Compliance (audit, encryption, backup/restore, diagnostics)

---

## 2. Technology Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.7+ |
| API Framework | Fastify | 5.x |
| ORM | Prisma | 6.x |
| Database | SQLite | via Prisma |
| Validation | Fastify JSON Schema | built-in |
| Logging | Pino | 9.x (structured JSON) |
| Unit Testing | Vitest | 3.x |
| API Testing | Vitest + Fastify inject | 3.x |
| Container | Docker + docker-compose | — |

---

## 3. Backend Module Boundaries

The backend uses a layered flat-directory architecture with separation by concern:

```
src/
├── index.ts                    # Application entry point
├── app.ts                      # Fastify app factory (buildApp)
├── config.ts                   # Typed configuration from env vars
├── plugins/                    # Fastify plugins (Prisma, auth, security middleware)
│   ├── prisma.plugin.ts        # PrismaClient singleton; WAL+busy_timeout pragmas
│   ├── auth.plugin.ts          # Session authentication decorator
│   └── security.plugin.ts      # Rate limiting, IP allowlist decorators
├── routes/                     # Fastify route handlers (one file per domain)
│   ├── auth.routes.ts
│   ├── warehouse.routes.ts
│   ├── outbound.routes.ts
│   ├── strategy.routes.ts
│   ├── membership.routes.ts
│   ├── cms.routes.ts
│   └── admin.routes.ts
├── services/                   # Domain business logic
│   ├── warehouse.service.ts
│   ├── outbound.service.ts
│   ├── strategy.service.ts
│   ├── membership.service.ts
│   ├── cms.service.ts
│   ├── admin.service.ts
│   ├── appointment.scheduler.ts  # Auto-expire background job
│   └── cms.scheduler.ts          # Scheduled-publish background job
├── repositories/               # Prisma data access layer
│   ├── auth.repository.ts
│   ├── warehouse.repository.ts
│   ├── outbound.repository.ts
│   ├── strategy.repository.ts
│   ├── membership.repository.ts
│   ├── cms.repository.ts
│   ├── admin.repository.ts
│   └── keyversion.repository.ts
├── security/                   # Cross-cutting security utilities
│   ├── password.ts             # scrypt hashing + constant-time compare
│   ├── session.ts              # Opaque token generation + SHA-256 storage
│   ├── rbac.ts                 # Role assertions and guards
│   ├── encryption.ts           # AES-256-GCM + HKDF key derivation
│   ├── ipallowlist.ts          # IPv4 CIDR matching
│   ├── masking.ts              # Role-aware response field masking
│   └── ratelimit.ts            # Per-principal rate limit decisions
├── audit/
│   └── audit.ts                # Append-only audit event writer
├── logging/
│   └── logger.ts               # createDomainLogger utility
└── shared/
    ├── enums.ts                # Shared TypeScript enums (all domains)
    ├── types.ts                # Shared TypeScript types (PaginationParams, etc.)
    ├── envelope.ts             # Response envelope helpers
    ├── invariants.ts           # Pure domain invariant/validation helpers
    └── schemas/                # Fastify JSON Schema definitions (one file per domain)
        ├── auth.schemas.ts
        ├── warehouse.schemas.ts
        ├── outbound.schemas.ts
        ├── strategy.schemas.ts
        ├── membership.schemas.ts
        ├── cms.schemas.ts
        └── admin.schemas.ts
```

**Layer responsibilities:**

| Layer | Responsibility | May Depend On |
|---|---|---|
| Routes | HTTP handling, schema validation, response shaping | Services, Schemas, Security |
| Schemas | Fastify JSON Schema definitions | Shared enums/types |
| Services | Domain business logic, state transitions | Repositories, Security, Audit |
| Repositories | Prisma queries, data access | Prisma client |
| Security | Cross-cutting: auth, encryption, masking, rate-limit, IP | Config |
| Shared | Enums, types, envelope helpers, pure invariants | Nothing |

---

## 4. Offline Docker Topology

```
┌─────────────────────────────────┐
│          Docker Host            │
│                                 │
│  ┌───────────────────────────┐  │
│  │     backend (Node 20)     │  │
│  │    Fastify on :3000       │  │
│  │                           │  │
│  │  SQLite ← file volume     │  │
│  │  Backups ← file volume    │  │
│  │  Schedulers (in-process)  │  │
│  └───────────────────────────┘  │
│                                 │
│  Volumes:                       │
│   - greencycle-data (SQLite)    │
│   - greencycle-backups          │
└─────────────────────────────────┘
```

- Single container, single service
- No Redis, no Postgres, no external queues
- All scheduling is in-process (setInterval-based)
- All communication is local — zero network dependencies

---

## 5. Storage Model

**Primary store:** SQLite via Prisma ORM, persisted at `/app/database/greencycle.db` inside the container (mounted as a named Docker volume).

**Storage responsibilities:**
- All domain entities (users, facilities, inventory, appointments, orders, members, articles, tags)
- Session state
- Audit events (append-only)
- Encryption key version metadata
- Backup snapshot metadata
- Idempotency key registry
- Rate-limit buckets
- Parameter/dictionary entries

**Backup store:** Encrypted file snapshots written to `/app/backups/` (mounted as a named Docker volume). Path-traversal prevention enforced in backup service.

**Soft-delete retention:**
- Billing records: 7 years
- Operational logs: 2 years

---

## 6. Scheduling Model

In-process background schedulers running on bounded cadences:

| Scheduler | Cadence | Purpose |
|---|---|---|
| Appointment auto-expire | ~60 seconds | Transition PENDING appointments to EXPIRED after 2 hours |
| CMS scheduled publish | ~60 seconds | Transition SCHEDULED articles to PUBLISHED when publish time reached (local server time) |

All schedulers:
- Use idempotent guards (safe to re-run)
- Log structured events on each cycle via a `createDomainLogger(app.log, 'warehouse' | 'cms')` child logger so every line carries a `{ domain }` tag
- Use a SYSTEM actor identity for audit trails
- Are startable/stoppable for test isolation
- Expose their loop body as a pure async function (`runAppointmentExpiryPass`, `runCmsPublishPass`) so unit tests can exercise the transition and audit logic directly against a fake Prisma double — no real timer, no real SQLite connection

> **Deferred maintenance:** expired `IdempotencyRecord` rows and stale
> `RateLimitBucket` rows remain in the database until a dedicated purge job is
> added. Both are functionally harmless because the expiry timestamps are
> re-checked at read time (wave generation refreshes expired idempotency rows
> on reuse, and rate-limit checks start a fresh window when the stored one is
> older than the configured duration).

---

## 7. Security and Compliance Boundaries

### 7.1 Authentication (implemented Prompt 3)

**Password hashing:** `crypto.scrypt` (Node.js built-in) with N=32768, r=8, p=1, 64-byte output, 16-byte random salt. The scrypt payload format is `1:{N}:{r}:{p}:{saltHex}:{hashHex}` and is then wrapped in an AES-256-GCM envelope before persistence (`{version}:{nonceHex}:{tagHex}:{ciphertextHex}`). Verification decrypts the envelope first, then performs constant-time comparison.

**Session model:** Opaque 32-byte random token (`crypto.randomBytes`). The plaintext token is returned to the client exactly once. A SHA-256 hash of the token is stored in the `Session` table — the plaintext is never persisted. Session validity requires: not revoked, not expired (configurable `SESSION_TIMEOUT_HOURS`, default 8h), and `passwordVersion` matches the current user version.

**Password rotation:** Incrementing `passwordVersion` on User causes all existing sessions to fail the version check, effectively invalidating them without an explicit enumeration step. Old sessions return 401 on next request.

**Login throttling:** Failed login attempts tracked in `RateLimitBucket` per `login:{username}`. After `LOGIN_MAX_ATTEMPTS` (default 5) failures within `LOGIN_WINDOW_MINUTES` (default 15), the endpoint returns 429 until the window resets. Username enumeration is prevented by returning identical 401 for unknown users and wrong passwords.

**Token transport:** `Authorization: Bearer <token>` header. Redacted from Pino logs via the `redact` configuration option.

**Initial SYSTEM_ADMIN bootstrap:** A fresh database has no privileged principal, and user management is gated to `SYSTEM_ADMIN` — so the very first admin must be seeded out-of-band. The offline CLI `src/scripts/bootstrap-admin.ts` (invoked via `npm run seed:admin`) reads `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` from the environment, refuses to run if any `SYSTEM_ADMIN` already exists (idempotent), and otherwise writes a new `User` with a wrapped scrypt hash plus a `UserRole('SYSTEM_ADMIN')` and a matching audit event. Once the first admin exists, the API-driven flows (`POST /api/auth/users`, `PUT /api/auth/users/:userId/roles`) become available; subsequent administrators are created via the API, not the script.

**Encryption-key startup guard:** The server refuses to start in non-test mode when `ENCRYPTION_MASTER_KEY` is missing, not exactly 64 hex characters, or contains non-hex characters. `loadConfig` fails fast with a clear error pointing at `openssl rand -hex 32`. The previous silent zero-key fallback has been removed — there is no longer a predictable default key path.

### 7.2 Authorization — RBAC (implemented Prompt 3)

**Roles:** SYSTEM_ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_OPERATOR, STRATEGY_MANAGER, MEMBERSHIP_MANAGER, CMS_REVIEWER, BILLING_MANAGER. A user may hold multiple roles.

**Route-level guards:**
- `fastify.authenticate` — Fastify `preHandler` decorator that returns 401 if no valid session.
- `fastify.requireRole(roles[])` — Factory returning a `preHandler` that returns 403 if the principal lacks all specified roles.

**Service-level checks:** `assertAnyRole(principalRoles, requiredRoles)` throws `RbacError` for use in domain service functions outside the HTTP layer.

**Object-level checks** (enforced at service/handler level):
- Partial shipment approval: WAREHOUSE_MANAGER or SYSTEM_ADMIN
- CMS review/publish transitions: CMS_REVIEWER or SYSTEM_ADMIN
- CMS article mutation (`PATCH /api/cms/articles/:articleId`): must be the article's author, a CMS_REVIEWER, or SYSTEM_ADMIN; authenticated non-authors are rejected with 403 FORBIDDEN. Non-reviewers cannot modify already-PUBLISHED or WITHDRAWN articles.
- Backup/restore operations: SYSTEM_ADMIN only
- User management: SYSTEM_ADMIN only

**Hook ordering for auth vs. validation:** the auth plugin resolves the Bearer session at `onRequest` and installs a `preValidation` barrier that returns 401 UNAUTHORIZED before schema validation runs on any route that registers `fastify.authenticate` as a `preHandler`. This prevents unauthenticated callers from receiving schema-shape hints via `400 VALIDATION_FAILED`.

**IP allowlist enforcement:**
- `fastify.checkIpAllowlist(routeGroup)` — returns a `preHandler` that checks `IpAllowlistEntry` rows for the given route group.
- **Default posture is fail-closed** (`IP_ALLOWLIST_STRICT_MODE` defaults to `true`): a privileged route group with zero active entries **denies every request**. Operators must seed at least one active `IpAllowlistEntry` for each privileged route group (`admin`, `backup`) as part of deployment. Setting `IP_ALLOWLIST_STRICT_MODE=false` is an explicit opt-out that restores the legacy open-by-default behavior (offline/dev only).
- IPv4 CIDR matching using manual bitwise arithmetic (no external dependency).
- Applied to all `SYSTEM_ADMIN` routes under `/api/admin/*` (diagnostics, backup/restore, retention, parameter reads/mutations, IP allowlist CRUD, key-version operations) via route group `admin`.
- If allowlist lookup fails (for example, repository/DB error), the request is denied with `500 INTERNAL_ERROR` (fail-closed), rather than bypassing the allowlist check.

### 7.3 Encryption at Rest (implemented Prompt 3)

**Algorithm:** AES-256-GCM (AEAD — authentication built-in).

**Key derivation:** Master key loaded from `ENCRYPTION_MASTER_KEY` env var (64-hex-char = 32 bytes). Per-version subkeys derived using `HKDF-SHA256`: `HKDF(masterKey, salt=bytes("greencycle-v{N}"), info="greencycle-field-encryption", len=32)`. Each key version is cryptographically independent.

**Key rotation:** 180-day rotation cycle tracked in `EncryptionKeyVersion` table. Active version is always the highest-version ACTIVE record. Old versions remain ROTATED for decryption of existing records. Records store their `encryptionKeyVersion` to select the correct decryption key.

**Field encryption:** Nonce (12 bytes, random per encryption), ciphertext, auth tag (16 bytes) serialized to a colon-delimited storage string: `{version}:{nonceHex}:{tagHex}:{ciphertextHex}`. Decryption failure (tampered data) throws and returns 500.

**Protected fields:** User.passwordHash (wrapped scrypt payload), Member.memberNumber, Member.email, Member.phone, PaymentRecord.last4Encrypted.

### 7.4 Response Masking (implemented Prompt 3)

Role-aware field serialization in `src/security/masking.ts`:

| Field | Full Access Roles | Masked Output |
|---|---|---|
| User.passwordHash | Never returned | Always omitted |
| User.roles | SYSTEM_ADMIN | Omitted for others |
| Member.memberNumber | SYSTEM_ADMIN, MEMBERSHIP_MANAGER | `***` |
| Member.email | SYSTEM_ADMIN, MEMBERSHIP_MANAGER, BILLING_MANAGER | `j***@domain.com` |
| Member.phone | SYSTEM_ADMIN, MEMBERSHIP_MANAGER, BILLING_MANAGER | `***-4567` |
| PaymentRecord.last4 | SYSTEM_ADMIN, BILLING_MANAGER | `null` |

### 7.5 Audit Trail (implemented Prompt 3)

Append-only audit events written by `src/audit/audit.ts`. The Prisma schema has no `updatedAt` or `deletedAt` on `AuditEvent` — the table is structurally immutable.

**Digest model:** `digestObject(value)` computes `SHA-256(JSON.stringify(value))`. Before and after state snapshots are digested, not stored in full, preventing audit table from leaking sensitive data while still supporting tamper-detection.

**Convenience helpers:** `auditCreate`, `auditUpdate`, `auditTransition` for the three common patterns.

### 7.6 Rate Limiting (implemented Prompt 3)

Fixed-window per-principal rate limiting using the `RateLimitBucket` table:
- Window: 60 seconds
- Limit: 120 requests/window per authenticated user
- Burst layer: 30 requests/10 seconds per authenticated user (`burst:${userId}` bucket namespace)
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` (on 429)
- Unauthenticated requests (health, login) are not subject to per-principal limits

### 7.7 IP Allowlists (implemented Prompt 3)

IPv4 CIDR matching (`src/security/ipallowlist.ts`) using bitwise mask arithmetic. `isIpAllowed(ip, entries, { failClosed })` honors the `AppConfig.ipAllowlistStrictMode` flag (from `IP_ALLOWLIST_STRICT_MODE`). **Strict mode is the default**: when on (the default), an empty active allowlist denies every request for that route group (fail-closed); `IP_ALLOWLIST_STRICT_MODE=false` is an explicit opt-out that restores the legacy open-by-default posture for offline/dev bootstraps. Applied via `fastify.checkIpAllowlist(routeGroup)` preHandler.

### 7.8 Log Safety (implemented Prompt 3)

Fastify Pino logger configured with `redact`:
```
req.headers.authorization → [REDACTED]
req.body.password          → [REDACTED]
req.body.currentPassword   → [REDACTED]
req.body.newPassword       → [REDACTED]
req.body.last4             → [REDACTED]
```
Application code never passes raw passwords, key material, or decrypted PII to `request.log.*`.

---

## 8. Entity Relationships

### 8.1 Auth Domain
- **User** 1→N **UserRole** (composite roles per principal)
- **User** 1→N **Session** (active sessions, invalidated on password rotation)

### 8.2 Warehouse Domain
- **Facility** 1→N **Zone** 1→N **Location** (physical hierarchy)
- **Location** 1→N **InventoryLot** (stock at a location)
- **Sku** 1→N **InventoryLot** (SKU stocked across locations)
- **Facility** 1→N **Appointment** (dock scheduling)
- **Appointment** 1→N **AppointmentOperationHistory** (immutable transition log)

**Appointment State Machine (Prompt 4):**
```
PENDING → CONFIRMED | CANCELLED | EXPIRED
CONFIRMED → RESCHEDULED | CANCELLED | EXPIRED
RESCHEDULED → CONFIRMED | CANCELLED | EXPIRED
CANCELLED → (terminal)
EXPIRED → (terminal)
```
Reschedule (CONFIRMED → RESCHEDULED) requires a new `scheduledAt` date. Auto-expiry transitions PENDING → EXPIRED via a `setInterval` scheduler running every 60 seconds; any appointment older than 2 hours that remains in PENDING state is transitioned by actor `'SYSTEM'`. Every transition writes an `AppointmentOperationHistory` record (immutable — no `updatedAt`, no `deletedAt`) and an `AuditEvent`.

**Inventory Lot Semantics:**
- `onHand`: units physically present
- `reserved`: units committed to orders but not yet picked
- `damaged`: units quarantined as unusable
All three counts are non-negative integers. The service validates SKU and Location existence before creating a lot.

### 8.3 Outbound Domain
- **Facility** 1→N **OutboundOrder** (orders per facility)
- **OutboundOrder** 1→N **OutboundOrderLine** (order items)
- **OutboundOrderLine** 0→N **OutboundOrderLine** (backorder self-ref via sourceLineId)
- **Facility** 1→N **Wave** (wave per facility)
- **Wave** 1→N **PickTask** (tasks in a wave)
- **OutboundOrder** 1→N **PackVerification** (pack checks)
- **OutboundOrder** 1→N **HandoffRecord** (carrier handoffs)

### 8.4 Membership & Billing Domain
- **Member** 1→N **MemberPackageEnrollment** (package enrollments)
- **MembershipPackage** 1→N **MemberPackageEnrollment**
- **Member** 1→N **PaymentRecord** (payments linked to member)
- **MemberPackageEnrollment** 0→N **PaymentRecord** (payments linked to enrollment)

### 8.5 CMS Domain
- **Article** N→N **Tag** (via ArticleTag join)
- **Article** N→N **Category** (via ArticleCategory join)
- **Category** self-ref (parentId) for multi-level hierarchy
- **Tag** self-ref (canonicalTagId) for tombstone merge redirects
- **Tag** 1→N **TagAlias** (alternative names)
- **Article** 1→N **ArticleInteraction** (local interaction events for trending)
- **User** 1→N **Article** (author, reviewer)

### 8.6 Infrastructure
- **AuditEvent** — standalone append-only, references any resource by type+id
- **EncryptionKeyVersion** — standalone key metadata, referenced by version number
- **IdempotencyRecord** — standalone deduplication registry
- **BackupSnapshot** — standalone backup metadata
- **ParameterDictionaryEntry** — standalone config key/value

---

## 9. Domain Invariant Catalog

| Invariant | Rule | Enforcement |
|---|---|---|
| Appointment state machine | Only allowed transitions (PENDING→CONFIRMED, etc.) | `invariants.ts:isValidAppointmentTransition()` + service layer |
| Appointment auto-expire | PENDING + createdAt + 2h ≤ now → EXPIRED | `invariants.ts:isAppointmentExpireEligible()` + scheduler |
| Immutable operation history | AppointmentOperationHistory has no updatedAt/deletedAt | Prisma schema (no @updatedAt) |
| Append-only audit events | AuditEvent has no updatedAt/deletedAt | Prisma schema (no @updatedAt) |
| Pack-time variance | Reject if weight or volume variance > ±5% | `invariants.ts:isVarianceAcceptable()` |
| Wave idempotency | Idempotency key valid for 24 hours | `invariants.ts:isIdempotencyKeyExpired()` + unique index |
| Shortage→backorder | Stockout/damage/oversell create BACKORDER lines | Service layer auto-conversion |
| Partial shipment approval | Manager role required to ship partial orders | RBAC guard on approve-partial |
| Invoice uniqueness | Invoice number is globally unique | Prisma `@unique` on invoiceNumber |
| Tag normalization | Tags unique by normalized (lowercase, trimmed) name | `invariants.ts:normalizeTagName()` + unique index |
| Tag tombstones | Merged tags become tombstones with canonical redirect | isTombstone + canonicalTagId fields |
| CMS scheduled publish | Uses local server time, not UTC conversion | Scheduler compares against server clock |
| CMS reviewer gating | Only CMS_REVIEWER/SYSTEM_ADMIN can approve | RBAC guard |
| Billing retention | 7-year soft-delete retention | retentionExpiresAt field + retention calculator |
| Operational retention | 2-year soft-delete retention | Retention calculator |
| Encryption key rotation | 180-day rotation cycle, envelope versioning | EncryptionKeyVersion table + field-level key version |
| Capacity non-negative | Location capacity > 0, inventory counts ≥ 0 | JSON Schema validation + Prisma constraints |
| Sensitive field masking | Role-aware response serialization | Masking utility (Prompt 3) |

---

## 10. Requirement-to-Persistence Traceability

| Prompt Requirement | Prisma Model(s) | Key Fields/Indexes |
|---|---|---|
| Username uniqueness | User | `@unique` on username |
| SKU code uniqueness | Sku | `@unique` on code |
| Location code uniqueness | Location | `@unique` on code |
| Tag normalized name uniqueness | Tag | `@unique` on normalizedName |
| Invoice number uniqueness | PaymentRecord | `@unique` on invoiceNumber |
| Member number uniqueness (encrypted plaintext) | Member | `@unique` on `memberNumberHash` (HMAC-SHA-256 of plaintext, keyed by master) — enables O(1) duplicate lookup without decrypting every row |
| Facility+location composite query | Location | `@@index([facilityId, code])` |
| SKU+lot+expiration composite query | InventoryLot | `@@index([skuId, lotNumber, expirationDate])` |
| Member+package status composite query | MemberPackageEnrollment | `@@index([memberId, status])` |
| Article publish time composite query | Article | `@@index([state, publishedAt])` |
| Appointment state enum | Appointment.state | String validated against AppointmentState |
| Outbound type enum | OutboundOrder.type | String validated against OutboundType |
| Package type enum | MembershipPackage.type | String validated against PackageType |
| Article state enum | Article.state | String validated against ArticleState |
| Soft-delete billing (7yr) | PaymentRecord | deletedAt + retentionExpiresAt |
| Soft-delete operational (2yr) | Facility, Location, Sku, etc. | deletedAt field |
| Immutable appointment history | AppointmentOperationHistory | No updatedAt, no deletedAt |
| Append-only audit events | AuditEvent | No updatedAt, no deletedAt |
| Encryption key versioning | EncryptionKeyVersion | version (unique), status, expiresAt |
| Wave idempotency | Wave + IdempotencyRecord | idempotencyKey (unique), expiresAt |
| Backorder lineage | OutboundOrderLine | sourceLineId self-ref, lineType, shortageReason |
| Tag merge tombstones | Tag | isTombstone, canonicalTagId self-ref |
| Tag aliases | TagAlias | alias, normalizedAlias, tagId FK |
| Article interactions | ArticleInteraction | type, createdAt indexes for trending |
| Category hierarchy | Category | parentId self-ref, depth |

---

## 11. Requirement-to-Module Traceability

| Domain | Prompt Requirements | Target Module | Key Files |
|---|---|---|---|
| **Authentication & Roles** | Local login, session issuance, password rotation, RBAC, IP allowlists, rate limiting | `src/routes/auth.routes.ts`, `src/plugins/auth.plugin.ts`, `src/plugins/security.plugin.ts`, `src/security/` | `src/security/password.ts`, `src/security/session.ts`, `src/security/rbac.ts`, `src/security/ipallowlist.ts`, `src/security/ratelimit.ts` |
| **Warehouse Operations** | Facilities, zones, locations, SKUs, inventory lots, appointments (create/confirm/reschedule/cancel/auto-expire), immutable operation history | `src/routes/warehouse.routes.ts`, `src/services/warehouse.service.ts`, `src/services/appointment.scheduler.ts` | `src/repositories/warehouse.repository.ts`, `src/shared/invariants.ts` |
| **Outbound Execution** | OutboundOrders, wave generation (idempotency 24h), pick tasks, optimized sequencing, pack verification (±5% variance), handoff, shortage→backorder, manager approval | `src/routes/outbound.routes.ts`, `src/services/outbound.service.ts` | `src/repositories/outbound.repository.ts`, `src/shared/invariants.ts` |
| **Strategy Center** | Configurable rules (FIFO/FEFO, ABC, heat, path cost), ranked putaway, pick paths, 30-day simulation, comparative metrics | `src/routes/strategy.routes.ts`, `src/services/strategy.service.ts` | `src/repositories/strategy.repository.ts`, `src/shared/invariants.ts` |
| **Membership & Billing** | Members, packages (punch/term/stored-value/bundle), enrollments, payments, invoice uniqueness, masking, encryption, 7-year retention | `src/routes/membership.routes.ts`, `src/services/membership.service.ts` | `src/repositories/membership.repository.ts`, `src/security/encryption.ts`, `src/security/masking.ts` |
| **CMS** | Articles (draft/review/publish/scheduled/withdraw), reviewer gating, categories, tags, aliases, merges (tombstones), bulk migration, trending stats (7-day), tag-cloud export, scheduled publish (local time) | `src/routes/cms.routes.ts`, `src/services/cms.service.ts`, `src/services/cms.scheduler.ts` | `src/repositories/cms.repository.ts`, `src/shared/invariants.ts` |
| **Cross-cutting Compliance** | Audit events (append-only, before/after digests), encryption/key rotation (180-day), backup/restore (encrypted snapshots), soft deletes, retention (7yr billing / 2yr ops), health diagnostics, parameter dictionaries, structured logs | `src/routes/admin.routes.ts`, `src/services/admin.service.ts`, `src/audit/audit.ts` | `src/repositories/admin.repository.ts`, `src/repositories/keyversion.repository.ts`, `src/logging/logger.ts` |

---

## 13. Warehouse Operations Engine (Prompt 4)

### Layer Architecture
```
src/routes/warehouse.routes.ts      — 28 route handlers, Fastify plugin
src/services/warehouse.service.ts   — business logic, WarehouseServiceError, state machine
src/services/appointment.scheduler.ts — setInterval auto-expiry (60-second cadence)
src/repositories/warehouse.repository.ts — pure Prisma queries
```

### Role Authorization Matrix
| Operation | WAREHOUSE_OPERATOR | WAREHOUSE_MANAGER | SYSTEM_ADMIN |
|---|---|---|---|
| Read any warehouse resource | ✓ | ✓ | ✓ |
| Create/update facilities, zones, locations, SKUs | ✗ | ✓ | ✓ |
| Create/update inventory lots | ✓ | ✓ | ✓ |
| Create appointments, confirm/cancel | ✓ | ✓ | ✓ |
| Reschedule appointments (CONFIRMED → RESCHEDULED) | ✗ | ✓ | ✓ |

### Scheduler Lifecycle
Started in `app.addHook('onReady', ...)`, cleared in `app.addHook('onClose', ...)`. Runs every 60 seconds, queries for `state=PENDING AND createdAt ≤ (now - 2h)`, transitions each match to EXPIRED with `actor='SYSTEM'`.

---

## 12. Current State (Post Prompt 6)

Implemented:
- Full Prisma schema with ~30 models across all 6 domains + infrastructure
- Initial migration SQL (authored, not executed)
- Shared enums as const objects matching Prisma String fields
- Domain invariant helpers (state machine, variance, retention, idempotency, invoice, tag normalization, CMS article state machine, pack verification status)
- Response/error envelope helpers with standard error codes
- Fastify JSON Schema validation definitions for all endpoint groups
- Unit tests for enums, invariants, retention calculators, appointment state machine, pack verification, idempotency, strategy scoring, CMS states, tag normalization, invoice format, membership enums
- API contract tests: auth, warehouse, outbound, strategy, membership, CMS
- **Security infrastructure (Prompt 3):**
  - Password hashing with scrypt (N=32768, constant-time verify)
  - Session token generation, SHA-256 storage, expiry/revocation/version-check
  - AES-256-GCM field encryption with HKDF key derivation per version
  - Role-aware response masking (email, phone, memberNumber, last4)
  - RBAC guards: `fastify.authenticate`, `fastify.requireRole()`
  - Fixed-window rate limiting (120/min per principal, login throttle 5/15min)
  - IPv4 CIDR-based IP allowlist checking
  - Append-only audit event writing with SHA-256 before/after digests
  - Pino log redaction for authorization/password/payment fields
  - Auth routes: login, logout, rotate-password, me, create-user, update-user-roles
  - Fastify plugins: prisma, auth, security (non-encapsulated via fastify-plugin)
- **Warehouse Operations Engine (Prompt 4)**
- **Outbound Execution Engine (Prompt 5)**
- **Strategy Center (Prompt 5)**
- **Membership & Billing Ledger (Prompt 6)**
- **CMS Publishing (Prompt 6)**

All ten prompts complete:
- Operational compliance: backup, retention, diagnostics (Prompt 7) ✓
- Test suite hardening (Prompt 8) ✓
- Docker finalization and config hardening (Prompt 9) ✓
- Final static readiness audit (Prompt 10) ✓

---

## 14. Outbound Execution Engine (Prompt 5)

### Layer Architecture
```
src/routes/outbound.routes.ts       — 13 route handlers, Fastify plugin
src/services/outbound.service.ts    — business logic, OutboundServiceError
src/repositories/outbound.repository.ts — pure Prisma queries + idempotency
```

### Outbound Order Lifecycle
```
DRAFT → PICKING → PACKING → PACKED → SHIPPED
                                   ↘ PARTIAL_SHIPPED
      ↘ CANCELLED (from any pre-shipped state)
```
- Orders start as DRAFT. Wave generation moves them to PICKING.
- Pack verification (on pass) moves to PACKED.
- Handoff moves to SHIPPED or PARTIAL_SHIPPED (if any lines have quantityShort > 0).

### Wave Generation with 24-Hour Idempotency
- Client supplies `Idempotency-Key` header (required — 400 if missing).
- On first call: creates `IdempotencyRecord` with `expiresAt = now + 24h`, creates wave with pick tasks, stores serialized wave JSON in `responseBody`.
- On repeat call within 24h: returns cached `responseBody` parsed from `IdempotencyRecord` with `fromCache: true`. HTTP 200 (not 201).
- Expired key: treated as new — allows resubmission after 24h.

### Pick Task Lifecycle
```
PENDING → IN_PROGRESS → COMPLETED
                      ↘ SHORT (creates backorder line)
                      ↘ CANCELLED
```
- Transitioning to IN_PROGRESS: records `startedAt = now`.
- Transitioning to COMPLETED: records `completedAt = now`, increments `orderLine.quantityFulfilled`.
- Transitioning to SHORT: records `completedAt = now`, creates BACKORDER `OutboundOrderLine` with `sourceLineId` FK, sets `orderLine.quantityShort`.
- **Wave auto-completion:** after every pick task update, if all tasks in the wave are in terminal states (COMPLETED/SHORT/CANCELLED), the wave is transitioned to COMPLETED automatically.

### Pack Verification (±5% Tolerance)
- Expected values computed from order lines: `expectedWeightLb = sum(quantity × sku.unitWeightLb)`, `expectedVolumeCuFt = sum(quantity × sku.unitVolumeCuFt)`.
- `calculateVariancePercent(actual, expected)` returns signed percentage; `Infinity` if expected=0 and actual≠0.
- `computePackVerificationStatus(weightPct, volumePct)` → PASSED / FAILED_WEIGHT / FAILED_VOLUME / FAILED_BOTH. Fails if |variance| > 5% or variance is non-finite.
- On PASSED: order status updated to PACKED.
- On FAILED: `OutboundServiceError(VARIANCE_EXCEEDED, ...)` returned with descriptive message; verification record still persisted.

### Shortage Exception → Backorder Conversion
- `reportException` endpoint creates a BACKORDER line (`lineType='BACKORDER'`, `sourceLineId` FK to original line) and updates the source line's `quantityShort` + `shortageReason`.
- Also triggered automatically when a pick task transitions to SHORT.
- Manager approval gate: before handoff, if any line has `quantityShort > 0` and `order.approvedForPartialShip = false`, throws `APPROVAL_REQUIRED`. Requires WAREHOUSE_MANAGER or SYSTEM_ADMIN to call `PATCH /orders/:id/approve-partial`.

---

## 15. Strategy Center (Prompt 5)

### Layer Architecture
```
src/routes/strategy.routes.ts       — 7 route handlers, Fastify plugin
src/services/strategy.service.ts    — scoring engine + service orchestration
src/repositories/strategy.repository.ts — pure Prisma queries
```

### StrategyRuleset: 5 Configurable Weights
| Weight Field | Controls |
|---|---|
| `fifoWeight` | Preference for older lots (FIFO = oldest first) |
| `fefoWeight` | Preference for sooner-expiring lots (FEFO = nearest expiry first) |
| `abcWeight` | A-class items prioritized for prime locations/fast picks |
| `heatLevelWeight` | Preference for hot locations (high recent pick activity) |
| `pathCostWeight` | Avoidance of high-travel-cost location types |

### Exported Pure Scoring Functions (unit-testable without DB)
- `abcPickPriority(abcClass)` → A=3, B=2, C=1 (default 1)
- `pathCostScore(locationType)` → SHIPPING=0, STAGING=1, PICK_FACE=2, RECEIVING=3, RACK=4, FLOOR=5, BULK=6
- `abcPutawayAlignmentScore(abcClass, locationType)` → weighted fit score
- `computePutawayScore(sku, location, heatScore, ruleset)` → composite putaway score (higher = preferred)
- `computePickScore(locationType, lot, sku, ruleset, now)` → composite pick score (higher = picked first)

### Putaway Ranking
1. Filter locations by hazard class and temperature band compatibility with SKU.
2. Compute heat score: count of COMPLETED pick tasks at location within last 30 days.
3. Score each candidate using `computePutawayScore`.
4. Return top 10 locations sorted by score descending.

### Pick-Path Planning
1. Load pick tasks by IDs, validate all belong to specified facility.
2. For each task, find oldest available lot at that location (FIFO fallback).
3. Score each task using `computePickScore` with selected ruleset.
4. Sort descending by score, assign sequence numbers 1..N.
5. Return tasks with sequence and score fields.

### 30-Day Simulation
- Loads all COMPLETED pick tasks within the specified window (default: last 30 days).
- For each ruleset in `rulesetIds`: re-scores historical tasks, sorts by score, computes:
  - `totalTouches`: number of tasks
  - `estimatedTotalDistance`: sum of consecutive pick-step proxy distances produced by `estimatePickStepDistance(prev, curr)` — `0` for same location, `0.5` for same zone, `1.0` for inter-zone / missing zone info, plus a `|pathCostScore(prev.type) − pathCostScore(curr.type)| × 0.1` type-delta penalty
  - `constraintViolations`: tasks where hazardClass mismatch exists
- Returns comparative per-ruleset metrics. Entirely deterministic; no external services.

> **Distance heuristic note:** `estimatePickStepDistance` is a structural proxy built from real Location fields (`zoneId`, `type`) rather than a string-prefix heuristic on the location code. Units are "pick-step cost," not meters. Comparative metrics remain internally consistent across rulesets (same function applied uniformly) while better reflecting the physical topology encoded in the schema: locations in the same zone are closer than locations in different zones, and path-cost-heavy transitions (e.g., PICK_FACE ↔ BULK) are penalized over homogeneous transitions (e.g., RACK ↔ RACK).

---

## 16. Membership & Billing Ledger (Prompt 6)

### Layer Architecture
```
src/routes/membership.routes.ts     — 15 route handlers, Fastify plugin
src/services/membership.service.ts  — business logic, MembershipServiceError
src/repositories/membership.repository.ts — pure Prisma queries
```

### Package Types
| Type | Required Fields | Enrollment Behavior |
|---|---|---|
| PUNCH | punchCount | `punchesUsed` tracked; no auto-endDate |
| TERM | durationDays | `endDate = startDate + durationDays` auto-computed |
| STORED_VALUE | storedValue | `remainingValue = storedValue` on enrollment |
| BUNDLE | (none required) | No specific tracking fields |

Type constraints enforced at service layer — missing required field → `VALIDATION_FAILED`.

### Member Field Encryption
- `memberNumber`, `email`, `phone` stored as AES-256-GCM ciphertext using `encryptFieldString(value, masterKey, keyVersion)`.
- **Deterministic keyed hash for memberNumber uniqueness:** AES-GCM uses a random nonce per encryption, so the same plaintext produces different ciphertext on each call and a DB `@unique` on the ciphertext column cannot prevent duplicate plaintexts. To avoid an O(n) decrypt-scan at create time, the service also persists `memberNumberHash`, an HMAC-SHA-256 of the trimmed plaintext keyed by a dedicated HKDF-derived subkey of the master key (`deriveLookupHash` in `encryption.ts`). The hash is stored in a unique index, so `findUnique({ where: { memberNumberHash } })` performs an O(1) duplicate check before insertion. The hash key is fully separated from the AES encryption key, so an attacker with only ciphertext cannot invert plaintext without the master key.
- `encryptionKeyVersion` stored on each record for decryption key selection.

### Invoice Number Format
`GC-YYYYMMDD-NNNNN` generated by `generateInvoiceNumber(date, sequence)` from `invariants.ts`.
- Sequence = `countPaymentsCreatedToday + 1` (count of PaymentRecord rows with `createdAt` in today's UTC day).
- Collision loop: if `findPaymentByInvoiceNumber(invoiceNumber)` returns a record, increment sequence and retry. Extremely rare in practice.

### 7-Year Billing Retention
`retentionExpiresAt = getRetentionExpiryDate(paidAt, RETENTION_YEARS.billing)` set on every PaymentRecord. Purge logic (Prompt 7) will hard-delete records past their retention date.

### Payment Status Transitions
```
RECORDED → SETTLED | VOIDED
SETTLED  → REFUNDED
```
Invalid transitions throw `INVALID_TRANSITION`. Transitions tracked via audit events.

### Role Authorization Matrix
| Operation | MEMBERSHIP_MANAGER | BILLING_MANAGER | SYSTEM_ADMIN |
|---|---|---|---|
| Read members | ✓ | ✓ | ✓ |
| Create/update members | ✓ | ✗ | ✓ |
| Delete members (soft) | ✗ | ✗ | ✓ |
| Read/create packages | ✓ (any auth) | ✓ (any auth) | ✓ |
| Manage packages | ✓ | ✗ | ✓ |
| Record/read payments | ✓ | ✓ | ✓ |
| Update payment status | ✓ | ✓ | ✓ |

---

## 17. CMS Publishing (Prompt 6)

### Layer Architecture
```
src/routes/cms.routes.ts            — 23 route handlers, Fastify plugin
src/services/cms.service.ts         — business logic, CmsServiceError
src/services/cms.scheduler.ts       — setInterval scheduled publish (60-second cadence)
src/repositories/cms.repository.ts  — pure Prisma queries
```

### Article State Machine
```
DRAFT → IN_REVIEW → APPROVED → PUBLISHED
                 ↘ DRAFT             ↘ WITHDRAWN → DRAFT
                              ↘ SCHEDULED → PUBLISHED
                                         ↘ WITHDRAWN → DRAFT
```
- `DRAFT → IN_REVIEW`: submit for review (any authenticated user)
- `IN_REVIEW → APPROVED`: approve (CMS_REVIEWER/SYSTEM_ADMIN)
- `IN_REVIEW → DRAFT`: reject back to draft (CMS_REVIEWER/SYSTEM_ADMIN)
- `APPROVED → PUBLISHED`: publish immediately (CMS_REVIEWER/SYSTEM_ADMIN)
- `APPROVED → SCHEDULED`: schedule for future publish — requires `scheduledPublishAt` (CMS_REVIEWER/SYSTEM_ADMIN)
- `SCHEDULED → PUBLISHED`: auto-publish by scheduler OR manual (CMS_REVIEWER/SYSTEM_ADMIN)
- `SCHEDULED → WITHDRAWN`: cancel scheduled publish (CMS_REVIEWER/SYSTEM_ADMIN)
- `PUBLISHED → WITHDRAWN`: withdraw published article (CMS_REVIEWER/SYSTEM_ADMIN)
- `WITHDRAWN → DRAFT`: reactivate for editing (any authenticated user)

All transitions validated by `isValidArticleTransition(from, to)` in `invariants.ts`.

### Scheduled Publish Scheduler
Mirrors the appointment scheduler pattern. Started in `app.addHook('onReady', ...)`, cleared in `app.addHook('onClose', ...)`. Runs every 60 seconds:
1. Queries `findScheduledArticlesDue(prisma, now)` — articles with `state=SCHEDULED AND scheduledPublishAt ≤ now`.
2. For each: calls `updateArticleState(PUBLISHED, {publishedAt: now, scheduledPublishAt: null})`.
3. Writes `auditTransition('SYSTEM', 'Article', id, 'SCHEDULED', 'PUBLISHED')`.
4. Logs `{articleId}` at info level.

Uses local server time — no UTC conversion. Errors are caught and logged, not thrown (scheduler continues on partial failure).

### Tag Tombstone Merge Model
Tag merges are **non-destructive** — the source tag becomes a tombstone, never hard-deleted:
1. `reassignArticleTagsFromTo(sourceId, targetId)`: for each `ArticleTag` referencing source, if target already tagged → skip (avoid duplicate `@@unique` violation), then delete source `ArticleTag`.
2. `reassignTagAliasesFromTo(sourceId, targetId)`: `updateMany` aliases to point to target.
3. `updateTag(sourceId, {isTombstone: true, canonicalTagId: targetId})`: mark source as tombstone.
4. Self-merge (`sourceId === targetId`) rejected with `CONFLICT`.
5. Merging into a tombstone target rejected with `CONFLICT`.

Tag tombstones are excluded from `listTags` by default (`includeTombstones=false`). `GET /tags/:tagId` still returns tombstone data including `canonicalTagId` for redirect purposes.

### Trending Tags & Tag Cloud
- **Trending** (`GET /tags/trending?windowDays=7&limit=20`): counts `ArticleInteraction` events per tag within the window by joining `ArticleInteraction → Article → ArticleTag → Tag`. Skips tombstone tags. Returns `[{tagId, name, count}]` sorted by count descending.
- **Tag cloud** (`GET /tags/cloud`): counts published articles per non-tombstone tag using `ArticleTag → Article` join. Returns `[{tagId, name, count}]` sorted by count descending.

### Route Registration Order
Literal-path tag routes (`/tags/trending`, `/tags/cloud`, `/tags/merge`, `/tags/bulk-migrate`) are registered **before** the parameterized route `/tags/:tagId` to prevent Fastify matching literal paths as tag IDs.

---

## 18. Operational Compliance — Admin Layer (Prompt 7)

### Layer Architecture
```
src/routes/admin.routes.ts            — 19 route handlers, Fastify plugin under /api/admin
src/services/admin.service.ts         — business logic, AdminServiceError
src/repositories/admin.repository.ts  — pure Prisma queries for all admin domain models
src/logging/logger.ts                 — createDomainLogger utility for structured log domains
src/shared/schemas/admin.schemas.ts   — Fastify JSON Schema definitions for admin routes
```

### Admin Route Groups

| Route Group | Prefix | Auth | IP Check |
|---|---|---|---|
| Diagnostics | `/api/admin/diagnostics` | SYSTEM_ADMIN | Yes (`admin` group) |
| Backup / Restore | `/api/admin/backup` | SYSTEM_ADMIN | Yes (`admin` group) |
| Retention | `/api/admin/retention/*` | SYSTEM_ADMIN | Yes (`admin` group) |
| Parameters | `/api/admin/parameters` | SYSTEM_ADMIN | Yes (`admin` group) |
| IP Allowlist | `/api/admin/ip-allowlist` | SYSTEM_ADMIN | Yes (`admin` group) |
| Key Versions | `/api/admin/key-versions` | SYSTEM_ADMIN | Yes (`admin` group) |

### Backup & Restore

**Backup creation** (`POST /api/admin/backup`):
1. Read the live SQLite database file from the path derived from `DATABASE_URL`.
2. Determine the active encryption key version from `EncryptionKeyVersion` table (fall back to version 1 if none registered).
3. Encrypt the file buffer using `encryptBuffer(data, masterKey, keyVersion)` — AES-256-GCM with a random 12-byte nonce. Binary layout: `[keyVersion(4 BE)][nonce(12)][tag(16)][ciphertext]`.
4. Generate a timestamped filename: `greencycle-backup-{ISO8601}.db.enc`.
5. Validate the output path using `validateSnapshotPath(backupDir, filename)` — prevents path traversal by stripping directory components via `basename()`, then verifying the resolved path starts with the canonical backup directory.
6. Write the encrypted buffer to the backup directory (created with `mkdir -p` if needed).
7. Compute SHA-256 checksum of the encrypted output.
8. Record metadata in `BackupSnapshot` with status `COMPLETED`.
9. Write an audit event.

**Restore** (`POST /api/admin/backup/:snapshotId/restore`):
- Requires `{ confirm: true }` in request body (explicit confirmation guard).
- Validates the stored path against `validateSnapshotPath` to prevent path injection via DB manipulation.
- Verifies SHA-256 checksum of the encrypted file before decryption.
- Decrypts using `decryptBuffer` (reads key version from binary header; GCM auth tag failure throws).
- Writes the decrypted database to a staging path (`{dbPath}.restore`).
- Marks snapshot `RESTORED`; writes audit transition.
- Returns instructions: operator must stop the service, move the staging file, and restart.
- The live database is **never written directly** during a restore call.

**Path traversal prevention**: `validateSnapshotPath(backupDir, filename)` in `src/shared/invariants.ts`:
- Calls `path.basename(filename)` to strip any directory components.
- Resolves the result against the backup directory.
- Asserts the resolved path starts with `path.resolve(backupDir) + path.sep`.
- Throws `Error('Invalid snapshot filename')` for empty, `.`, or `..` inputs.
- Throws `Error('Path traversal detected')` if resolved path escapes the directory.

### Retention Handling

**7-year billing retention** (`PaymentRecord`):
- `retentionExpiresAt` is set at payment creation: `getRetentionExpiryDate(paidAt, 7)`.
- Eligible for purge: `deletedAt IS NOT NULL AND retentionExpiresAt < now`.
- Hard delete via `prisma.paymentRecord.deleteMany(...)` — permanent removal after legal retention window.
- `isRetentionPurgeable(deletedAt, retentionExpiresAt, now)` in `invariants.ts` checks eligibility without DB access.

**2-year operational log retention** (`AuditEvent`, `AppointmentOperationHistory`):
- Cutoff: `now - 2 * 365 * 24 * 60 * 60 * 1000` (does not account for leap years — acceptable approximation).
- Hard delete records older than the cutoff.
- The purge itself creates a new `AuditEvent` with a current timestamp (not subject to the 2-year window).

**Retention endpoints**:
- `GET /api/admin/retention/report` — counts eligible records in each domain; does not purge.
- `POST /api/admin/retention/purge-billing` — hard deletes eligible billing records; requires `{ confirm: true }`.
- `POST /api/admin/retention/purge-operational` — hard deletes old audit events and operation history; requires `{ confirm: true }`.

### Parameter Dictionary

`ParameterDictionaryEntry` stores runtime configuration key-value pairs:
- Keys must match `^[a-zA-Z0-9._:-]+$` — no spaces, no path separators.
- Read/write/delete access: SYSTEM_ADMIN only.
- All mutations are audited (CREATE, UPDATE with before/after digest).
- No soft delete — parameters are hard-deleted.

### IP Allowlist Management

The `IpAllowlistEntry` model stores CIDR-based allowlist rules per `routeGroup` (`admin`, `backup`).

CRUD endpoints (`/api/admin/ip-allowlist`) are restricted to SYSTEM_ADMIN.

The `checkIpAllowlist(routeGroup)` factory (already wired in `security.plugin.ts`) reads active entries for the route group at request time and calls `isIpAllowed(ip, entries, { failClosed: config.ipAllowlistStrictMode })`. By default an **empty allowlist permits all IPs** — the allowlist is only enforced once at least one active entry exists for the route group. Setting `IP_ALLOWLIST_STRICT_MODE=true` flips this to **fail-closed**: privileged route groups deny every request until at least one active entry is present.

New entries are validated for CIDR format before insertion (IP syntax + prefix 0-32 check). The service layer throws `VALIDATION_FAILED` on malformed CIDRs before they reach the database.

**Route-group enforcement scope:** the `ipCheckAdmin = checkIpAllowlist('admin')` pre-handler is wired onto all `/api/admin/*` routes (diagnostics, backup/restore, retention, parameters, ip-allowlist CRUD, key-versions) in addition to `SYSTEM_ADMIN` role checks. If allowlist lookup fails, the middleware denies the request with `500 INTERNAL_ERROR` (fail-closed).

### Encryption Key Rotation

`GET /api/admin/key-versions` — lists all ACTIVE and ROTATED key version records.

`POST /api/admin/key-versions/rotate` — triggers rotation:
1. Finds the current ACTIVE version.
2. If none exists, creates the initial version (version 1).
3. If one exists, marks it ROTATED and creates a new ACTIVE version at `currentVersion + 1`.
4. Sets `expiresAt = now + 180 days` on the new version.
5. Stores a `keyHash` (hash of the new key for operator verification — the actual key material is never stored).
6. Writes an audit event.

Re-encryption of existing field-encrypted data is deferred to a dedicated maintenance job outside the current scope. The envelope design (`[keyVersion(4)]` prefix on each encrypted field) keeps legacy ciphertext decryptable after rotation, so gradual rewrap remains safe.

### Diagnostics Endpoint

`GET /api/admin/diagnostics` returns a structured JSON snapshot with no network calls:

```json
{
  "status": "healthy",
  "timestamp": "ISO8601",
  "uptimeSeconds": 1234,
  "memory": { "rssBytes": ..., "heapUsedBytes": ..., "heapTotalBytes": ..., "externalBytes": ... },
  "database": {
    "users": 5, "activeSessions": 2, "articles": 12, "members": 8,
    "payments": 24, "auditEvents": 450, "backupSnapshots": 3,
    "parameters": 7, "activeIpAllowlistEntries": 2, "outboundOrders": 15, "appointments": 40
  },
  "encryption": {
    "activeKeyVersion": 1,
    "keyExpiresAt": "ISO8601",
    "rotationOverdue": false
  },
  "performance": {
    "note": "Query design targets p95 < 200ms at 50 concurrent requests on single-node SQLite. This is a design target — not a benchmarked claim.",
    "paginationDefaults": { "pageSize": 20, "maxPageSize": 100 },
    "indexStrategy": ["..."]
  }
}
```

---

## 19. Structured Logging (Prompt 7)

The `src/logging/logger.ts` utility provides `createDomainLogger(logger, domain)` which creates a Pino child logger with a `{ domain }` field bound to every log entry. A companion helper `tagRequestLogDomain(fastify, domain)` wires an `onRequest` hook inside a route plugin's encapsulation so every request.log emission within that scope inherits the domain tag — without touching individual log call sites.

**Domain labels**: `auth`, `warehouse`, `outbound`, `strategy`, `membership`, `cms`, `backup`, `retention`, `audit`, `admin`.

**Adoption across the codebase:**
- Every domain route plugin (auth, warehouse, outbound, strategy, membership, cms, admin) calls `tagRequestLogDomain(fastify, '<domain>')` at its top, so request-scoped logs within `/api/<domain>/*` carry `{ domain }` automatically (including Fastify's own per-request lifecycle logs and the global error handler).
- Both background schedulers start with a domain-tagged child logger (`createDomainLogger(app.log, 'warehouse' | 'cms')`).
- Backup and retention route handlers create sub-domain child loggers (`'backup'`, `'retention'`) that override the plugin-scoped `'admin'` tag for those specific security-sensitive operations, so restore and purge events are uniquely tagged in production logs.

Usage in service code:
```typescript
const log = createDomainLogger(fastify.log, 'backup');
log.info({ snapshotId, sizeBytes }, 'Backup created');
// → { domain: 'backup', snapshotId: '...', sizeBytes: ..., msg: 'Backup created', ... }
```

This enables grep-based and query-based log filtering by subsystem in production troubleshooting:
- `grep '"domain":"backup"'` — all backup operations
- `grep '"domain":"retention"'` — all purge events
- `grep '"domain":"warehouse"'` — all warehouse requests and scheduler cycles

Pino's `redact` configuration (in `app.ts`) strips sensitive fields from all log output:
`req.headers.authorization`, `req.body.password`, `req.body.currentPassword`, `req.body.newPassword`, `req.body.last4`.

---

## 20. Performance Readiness (Prompt 7)

This section documents the design-level performance readiness for the stated target of **p95 < 200ms at 50 concurrent requests** on a single-node SQLite deployment. This is a design target — no benchmarks have been run.

### Index Strategy

All high-traffic query paths are backed by composite or covering indexes defined in `prisma/schema.prisma`:

| Index | Model | Purpose |
|---|---|---|
| `(facilityId, state)` | Appointment | Appointment list by facility + state filter |
| `(state, createdAt)` | Appointment | Auto-expiry scheduler query |
| `(status, completedAt)` | PickTask | Wave completion check, simulation queries |
| `(state, publishedAt)` | Article | Published article listing |
| `(createdAt)` | ArticleInteraction | Trending tag window filter |
| `(type, createdAt)` | ArticleInteraction | Per-type interaction analytics |
| `(memberId, status)` | MemberPackageEnrollment | Active enrollment lookups |
| `(resourceType, resourceId)` | AuditEvent | Audit trail lookup by entity |
| `(timestamp)` | AuditEvent | Retention window queries |
| `(expiresAt)` | IdempotencyRecord | Expired key cleanup |

### Pagination Design

The `PaginationParams` and `PaginationMeta` types in `src/shared/types.ts` define the contract. Admin list endpoints implement cursor-free offset pagination with `pageSize` default of 20 and maximum of 100. High-volume list endpoints (articles, pick tasks, audit events) should use pagination in production to bound query cost.

### SQLite-Specific Considerations

- **WAL mode**: enabling `PRAGMA journal_mode=WAL` at connection time allows concurrent reads alongside one writer — reduces lock contention at 50 concurrent requests.
- **Busy timeout**: `PRAGMA busy_timeout=5000` prevents immediate lock errors under concurrent write load.
- **Prepared statements**: Prisma uses prepared statements by default, reducing query parse overhead.
- **Connection pooling**: single-node SQLite uses a single connection; no pool configuration needed but the Prisma client should be a singleton (implemented via `prisma.plugin.ts`).
- These pragmas are applied in `src/plugins/prisma.plugin.ts` via `$executeRaw` immediately after `PrismaClient` connects (implemented in Prompt 9). See Section 22 for details.

---

## 21. Test Suite Architecture (Prompt 8)

### Test File Inventory

**Unit tests** (`backend/unit_tests/`) — 26 files, pure functions, no DB dependency:

| Directory | Files | Coverage Focus |
|---|---|---|
| `admin/` | `backup.test.ts`, `parameterKey.test.ts`, `retention.test.ts` | Snapshot path safety, encryption round-trip, retention eligibility, parameter key regex, CIDR matching |
| `audit/` | `audit.test.ts` | Audit event creation helpers |
| `cms/` | `articleStates.test.ts`, `tagNormalize.test.ts` | Article state machine (all 6 states, valid/invalid transitions), tag normalization |
| `logging/` | `logger.test.ts` | createDomainLogger binds domain field; all 10 log domains covered |
| `membership/` | `invoice.test.ts`, `membershipRules.test.ts`, `packageTypes.test.ts`, `paymentTransitions.test.ts` | Invoice format, package type constraints (PUNCH/TERM/STORED_VALUE/BUNDLE), payment status transitions (valid/invalid) |
| `outbound/` | `idempotency.test.ts`, `packVerification.test.ts`, `shortageHandling.test.ts` | 24h idempotency window, pack variance status, shortage arithmetic, terminal pick task states, wave completion logic |
| `security/` | `encryption.test.ts`, `ipallowlist.test.ts`, `masking.test.ts`, `password.test.ts`, `ratelimit.test.ts`, `rbac.test.ts` | AES-GCM encryption, CIDR, role-aware masking, scrypt hashing, rate limit decisions, RBAC guards |
| `strategy/` | `scoring.test.ts` | All 5 pure scoring functions: abcPickPriority, pathCostScore, abcPutawayAlignmentScore, computePutawayScore, computePickScore |
| `warehouse/` | `appointment.test.ts`, `location.test.ts` | Appointment FSM (all valid/invalid transitions, auto-expire), location/inventory schema invariants |
| Root | `config.test.ts`, `enums.test.ts`, `invariants.test.ts` | Config parsing, all 20+ enums, all domain invariant helpers |

**API/integration tests** (`backend/api_tests/`) — 9 files, Fastify inject:

| File | Route Group | Auth Tests | Validation Tests |
|---|---|---|---|
| `auth.test.ts` | `/api/auth/*` | Unauthenticated on protected routes | Login/rotate-password schema |
| `warehouse.test.ts` | `/api/warehouse/*` | 401 on all warehouse routes | capacityCuFt=0, invalid hazardClass, missing unitWeightLb |
| `outbound.test.ts` | `/api/outbound/*` | 401 on all outbound routes | Missing lines, empty orderIds, pack-verify fields, invalid status |
| `strategy.test.ts` | `/api/strategy/*` | 401 on all strategy routes | Missing weights/facilityId/skuId, weight out of range |
| `membership.test.ts` | `/api/membership/*` | 401 on all membership routes | Missing memberNumber/packageId/startDate, invalid last4, price=0 |
| `cms.test.ts` | `/api/cms/*` | 401 on all CMS routes | Missing title/slug/body/scheduledPublishAt, invalid interaction type |
| `admin.test.ts` | `/api/admin/*` | 401 on all admin routes | Missing confirm, invalid key/routeGroup, missing keyHash |
| `health.test.ts` | `/health` | — | Response shape |
| `contract.test.ts` | Multiple | Error envelope shape | VALIDATION_FAILED code presence |

### Test Scope Boundaries

Tests that run **without a migrated DB** (all currently authored tests):
- 401 unauthenticated: auth middleware fires before any Prisma query
- 400 schema validation: Fastify JSON Schema validates before DB access
- Pure function unit tests: no Prisma import

Tests that require a **migrated DB** (run via `run_tests.sh` inside Docker):
- Happy paths (create/read returning real data)
- Not-found flows (404 on nonexistent IDs)
- Conflict detection (409 duplicate username/invoice/SKU)
- State transition enforcement (409 illegal appointment/article transitions)
- Idempotency replay (wave generation returning cached JSON)
- Encryption round-trips with real member data

### New Invariant Helpers Added in Prompt 8

Added to `src/shared/invariants.ts` for unit testability:
- `isValidPaymentTransition(from, to)` — RECORDED→SETTLED/VOIDED, SETTLED→REFUNDED
- `getAllowedPaymentTransitions(from)` — returns allowed next states
- `validatePackageTypeRequiredFields(packageType, fields)` — package-type constraint validation
- `computeShortageQuantity(taskQuantity, quantityPicked)` — shortage arithmetic with bounds checking
- `isValidParameterKey(key)` — regex ^[a-zA-Z0-9._:-]+$ validation

### run_tests.sh Pipeline

```
Step 1: docker compose build backend
Step 2: prisma migrate deploy      ← applies migrations to test.db
Step 3: vitest run --config vitest.unit.config.ts
Step 4: vitest run --config vitest.api.config.ts
```

All four steps run inside Docker containers using the same image. The migration step is idempotent (Prisma tracks applied migrations).

---

## 22. Docker & Config Finalization (Prompt 9)

### Container Topology

Single-service Docker deployment (`docker-compose.yml`). No sidecars, no external databases, no network dependencies.

```
┌──────────────────────────────────────────┐
│  Docker Host                             │
│                                          │
│  Service: backend (Node 20 Alpine)       │
│    Port:  3000 (host) → 3000 (container) │
│    Image: multi-stage build              │
│                                          │
│  Named volumes:                          │
│    greencycle-data    → /app/database    │
│    greencycle-backups → /app/backups     │
└──────────────────────────────────────────┘
```

### Dockerfile (multi-stage)

**Build stage** (`node:20-alpine AS build`):
1. `npm ci` — deterministic install from lock file
2. `npx prisma generate` — generates Prisma client into `node_modules`
3. `tsc` — compiles TypeScript to `dist/`

**Runtime stage** (`node:20-alpine AS runtime`):
- Copies `dist/`, `node_modules/`, `prisma/`, `package.json` from build stage
- Creates `/app/database` and `/app/backups` with `greencycle` user ownership
- Runs as non-root `greencycle` user
- Exposes port 3000
- Sets all required env vars (see below)
- `HEALTHCHECK` via `wget` on `/health` — 30s interval, 15s start period, 5s timeout

### Environment Variables

All variables resolved by `src/config.ts` via `loadConfig(process.env)`:

| Variable | Default (code) | Docker default | Description |
|---|---|---|---|
| `PORT` | `3000` | `3000` | Fastify listen port |
| `HOST` | `0.0.0.0` | `0.0.0.0` | Fastify listen host |
| `DATABASE_URL` | `file:../database/greencycle.db` | `file:/app/database/greencycle.db` | Prisma SQLite path |
| `NODE_ENV` | `development` | `production` | Runtime environment |
| `LOG_LEVEL` | `info` | `info` | Pino log level |
| `ENCRYPTION_MASTER_KEY` | `""` (dev-only) | — must be supplied — | 64 hex chars (32-byte AES master key) |
| `SESSION_TIMEOUT_HOURS` | `8` | `8` | Session lifetime in hours |
| `LOGIN_MAX_ATTEMPTS` | `5` | `5` | Failed login threshold |
| `LOGIN_WINDOW_MINUTES` | `15` | `15` | Login throttle window |
| `BACKUP_DIR` | `../backups` | `/app/backups` | Encrypted snapshot directory |

**Production requirement:** `ENCRYPTION_MASTER_KEY` must be a cryptographically random 64-hex string. Generate with `openssl rand -hex 32`. Pass via shell environment or `.env` file — never commit.

### SQLite Pragmas (applied on connection)

Executed in `src/plugins/prisma.plugin.ts` immediately after `PrismaClient` connects:

```typescript
await prisma.$executeRaw`PRAGMA journal_mode=WAL`;
await prisma.$executeRaw`PRAGMA busy_timeout=5000`;
```

- `journal_mode=WAL` — allows concurrent reads alongside one writer; reduces lock contention
- `busy_timeout=5000` — waits up to 5 seconds before returning SQLITE_BUSY; prevents lock errors under write load

### Healthcheck

`GET /health` returns `{ status: "ok", timestamp, uptime }` — no auth required, no DB query. Docker `HEALTHCHECK` polls this endpoint every 30 seconds (15-second start grace period).

### run_tests.sh Path Alignment

`run_tests.sh` uses `TEST_DB_URL="file:/app/database/test.db"` — a separate file from the production `greencycle.db` within the same volume mount. All four Docker run steps (`build`, `migrate`, `unit`, `api`) use `--no-deps` so they start without the production service running.
