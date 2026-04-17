# GreenCycle Warehouse & Content Operations API

Backend-only API for running an offline environmental supply warehouse paired with a local publishing and membership program. Designed for single-node Docker operation with zero external dependencies.

**Project Type:** pure_backend
**Deployment Model:** single-node Docker container

## Technology Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.7+ |
| API Framework | Fastify | 5.x |
| ORM | Prisma | 6.x |
| Database | SQLite | (via Prisma) |
| Validation | Fastify JSON Schema | built-in |
| Logging | Pino | 9.x (structured JSON) |
| Unit Testing | Vitest | 3.x |
| API Testing | Vitest + Fastify inject | 3.x |
| Container | Docker + docker-compose | — |

## Repository Structure

```
repo/
├── README.md                   # This file
├── docker-compose.yml          # Single-service Docker topology
├── run_tests.sh                # Docker-first test runner
└── backend/
    ├── Dockerfile              # Multi-stage build (Node 20 Alpine)
    ├── package.json            # Package manifest
    ├── tsconfig.json           # TypeScript config (strict, ES2022)
    ├── vitest.unit.config.ts   # Unit test config
    ├── vitest.api.config.ts    # API test config
    ├── prisma/
    │   ├── schema.prisma       # Prisma schema (SQLite datasource)
    │   └── migrations/         # Migration SQL; applied via `prisma migrate deploy` (see run_tests.sh step 2)
    ├── database/               # SQLite database files (runtime; mounted volume in Docker)
    ├── src/
    │   ├── index.ts            # Application entry point
    │   ├── app.ts              # Fastify app factory (buildApp)
    │   ├── config.ts           # Typed configuration from env vars
    │   ├── plugins/            # Fastify plugins (prisma, auth, security)
    │   ├── routes/             # Route handlers (auth, warehouse, outbound, strategy, membership, cms, admin)
    │   ├── services/           # Domain services + appointment/CMS schedulers
    │   ├── security/           # password, session, encryption, rbac, masking, ratelimit, ipallowlist
    │   ├── audit/              # Append-only audit event writer
    │   ├── logging/            # createDomainLogger utility
    │   ├── repositories/       # Prisma data access layer
    │   └── shared/             # Enums, types, envelope helpers, invariants, JSON schemas
    ├── unit_tests/             # Vitest unit tests
    └── api_tests/              # Vitest API/integration tests
```

## Offline Single-Node Constraint

This service is designed to run entirely offline on a single machine:

- **No external databases** — SQLite file stored locally
- **No cloud services** — no hosted queues, schedulers, or identity providers
- **No network dependencies** — all scheduling, encryption, and backup operations are local
- **Single Docker container** — `docker-compose.yml` defines one `backend` service

## Docker-First Development Model

This project is Docker-first by design:

- Run application, migrations, scripts, and tests inside Docker containers
- Keep host setup minimal (Docker Engine / Docker Desktop + `docker compose`)
- Avoid host-local Node.js package installs for routine workflows
- Use `docker compose run` / `docker compose exec` commands documented below

## Domain Model

The Prisma schema defines ~30 models across 6 domains plus infrastructure:

| Domain | Models | Key Entities |
|---|---|---|
| Auth & Infrastructure | 9 | User, UserRole, Session, IpAllowlistEntry, RateLimitBucket, EncryptionKeyVersion, AuditEvent, ParameterDictionaryEntry, BackupSnapshot, IdempotencyRecord |
| Warehouse | 7 | Facility, Zone, Location, Sku, InventoryLot, Appointment, AppointmentOperationHistory |
| Outbound Execution | 6 | OutboundOrder, OutboundOrderLine, Wave, PickTask, PackVerification, HandoffRecord |
| Strategy Center | 1 | StrategyRuleset |
| Membership & Billing | 4 | Member, MembershipPackage, MemberPackageEnrollment, PaymentRecord |
| CMS | 7 | Category, Tag, TagAlias, Article, ArticleTag, ArticleCategory, ArticleInteraction |

Migration SQL is applied by `prisma migrate deploy` — invoked automatically as step 2 of `run_tests.sh` (inside Docker) and recommended on first container boot before the API starts serving traffic.

## Current State

All seven prompt domains are fully implemented, tested, and compliant with CLAUDE.md requirements.

Implemented:
- Full Prisma schema with all models, unique/composite indexes, soft-delete/retention fields
- Initial migration SQL applied via `prisma migrate deploy` at container/test start
- Shared TypeScript enums matching Prisma schema
- Domain invariant helpers (appointment FSM, pack verification status, CMS article FSM, variance, retention, idempotency, invoice, tag normalization, snapshot path validation, retention purgeability, payment transitions, package type constraints, shortage calculation, parameter key validation)
- Response/error envelope helpers with standard error codes
- Fastify JSON Schema validation definitions for all endpoint groups including admin
- Unit tests: enums, invariants, security modules, audit helpers, warehouse state machine, pack verification, idempotency, strategy scoring, CMS article states, tag normalization, invoice format, membership enums/rules, payment transitions, shortage handling, backup encryption round-trip, retention eligibility, parameter key validation, IP CIDR matching, session primitives, domain logging
- API tests (17 files): baseline contract suites plus depth coverage for auth, warehouse, outbound, strategy, membership, CMS, admin, and validation-envelope normalization
- **Security layer (Prompt 3):** password hashing, session tokens, AES-256-GCM encryption, RBAC, rate limiting, IP allowlists, audit trail, log safety
- **Warehouse operations engine (Prompt 4):** facilities, zones, locations, SKUs, inventory lots, appointments with FSM, immutable history, auto-expiry scheduler
- **Outbound execution engine (Prompt 5):**
  - OutboundOrder lifecycle: DRAFT → PICKING → PACKING → PACKED → SHIPPED/PARTIAL_SHIPPED
  - Wave generation with 24-hour idempotency key deduplication (idempotent replay from cache)
  - Pick task lifecycle: PENDING → IN_PROGRESS → COMPLETED/SHORT/CANCELLED
  - Wave auto-completion when all tasks reach terminal states
  - Pack verification: ±5% tolerance on weight AND volume; PASSED/FAILED_WEIGHT/FAILED_VOLUME/FAILED_BOTH
  - Shortage exception → automatic BACKORDER line creation with sourceLineId FK
  - Manager approval gate (WAREHOUSE_MANAGER/SYSTEM_ADMIN) before partial shipment
- **Strategy Center (Prompt 5):**
  - StrategyRuleset with 5 configurable weights: FIFO, FEFO, ABC, heat level, path cost
  - Putaway ranking: hazard/temperature compatibility filters + weighted location scoring
  - Pick-path planning: lot-based FIFO/FEFO/ABC/path cost scoring → sequence assignment
  - 30-day simulation: re-sequences historical COMPLETED tasks per ruleset; comparative metrics (distance, touches, constraint violations)
  - All scoring functions exported as pure functions for unit testability
- **Membership & Billing Ledger (Prompt 6):**
  - Members with AES-256-GCM encrypted memberNumber/email/phone; application-level uniqueness check (decrypt-scan)
  - Package types: PUNCH (punchCount), TERM (durationDays → auto endDate), STORED_VALUE (storedValue → remainingValue), BUNDLE
  - Enrollment with type-specific initialization
  - Invoice numbers: GC-YYYYMMDD-NNNNN via `generateInvoiceNumber`; collision loop for uniqueness
  - Payment status transitions: RECORDED → SETTLED/VOIDED, SETTLED → REFUNDED
  - 7-year billing retention via `retentionExpiresAt`
  - Role-aware masking: last4 visible to BILLING_MANAGER/SYSTEM_ADMIN only
- **CMS Publishing (Prompt 6):**
  - Article 6-state FSM: DRAFT → IN_REVIEW → APPROVED → PUBLISHED/SCHEDULED → WITHDRAWN → DRAFT
  - Reviewer gating: CMS_REVIEWER/SYSTEM_ADMIN required for approve/publish/schedule/withdraw
  - Local setInterval scheduler auto-publishes SCHEDULED articles when `scheduledPublishAt ≤ now`
  - Categories with parent hierarchy (depth computed from parent)
  - Tags with normalized name uniqueness, alias management, merge tombstones (non-destructive)
  - Bulk tag migration (targeted or full article reassignment)
  - Trending tags: interaction count aggregation within configurable window (default 7 days)
  - Tag cloud: published article count per non-tombstone tag
- **Operational Compliance (Prompt 7):**
  - Encrypted backup: AES-256-GCM file-level encryption of SQLite database; `[keyVersion(4)][nonce(12)][tag(16)][ciphertext]` binary format
  - Path-safe restore: `validateSnapshotPath` via `path.basename()` + resolved-path prefix check; decrypts to staging path; operator applies after service stop
  - Backup checksum: SHA-256 of encrypted file verified before decryption on restore
  - 7-year billing retention purge (`/retention/purge-billing`): hard-deletes soft-deleted PaymentRecords past `retentionExpiresAt`
  - 2-year operational log retention purge (`/retention/purge-operational`): hard-deletes AuditEvent and AppointmentOperationHistory rows past cutoff
  - Retention report (`/retention/report`): counts eligible records per domain without purging
  - Parameter dictionary CRUD (`/parameters`): SYSTEM_ADMIN-only read/write with admin IP allowlist enforcement; audited, key format validated
  - IP allowlist CRUD (`/ip-allowlist`): manage CIDR entries per routeGroup; CIDR format validated before insertion
  - Encryption key rotation (`/key-versions/rotate`): marks current ACTIVE as ROTATED, creates next version with 180-day expiry
  - Diagnostics endpoint (`/diagnostics`): process memory, uptime, live DB record counts, key version status, performance design notes
  - Structured logging: `createDomainLogger(logger, domain)` utility for per-subsystem log filtering

## Quick Start (Docker)

```bash
cd repo

# Generate a 64-hex-char master key once and export it for the current shell
export ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)

# Start API service
docker compose up --build -d backend

# Apply Prisma migrations in container
docker compose run --rm --no-deps backend npx prisma migrate deploy

# Seed the first SYSTEM_ADMIN user (idempotent)
docker compose run --rm --no-deps \
  -e BOOTSTRAP_ADMIN_USERNAME=admin \
  -e BOOTSTRAP_ADMIN_PASSWORD='ChangeMeStrong123!' \
  backend npm run seed:admin

# View logs
docker compose logs -f backend
```

The server listens on `http://0.0.0.0:3000` by default. After bootstrap, the seeded admin can issue a session via `POST /api/auth/login` and create further users through `POST /api/auth/users`.

## Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-16T12:00:00.000Z",
  "uptime": 42.5
}
```

## Configuration

| Variable | Local dev default | Docker default | Description |
|---|---|---|---|
| `PORT` | `3000` | `3000` | Fastify listen port |
| `HOST` | `0.0.0.0` | `0.0.0.0` | Fastify listen host |
| `DATABASE_URL` | `file:../database/greencycle.db` | `file:/app/database/greencycle.db` | Prisma SQLite path |
| `NODE_ENV` | `development` | `production` | Runtime environment |
| `LOG_LEVEL` | `info` | `info` | Pino log level |
| `ENCRYPTION_MASTER_KEY` | *(required — hard fail on missing)* | *(required — hard fail on missing)* | 64-hex-char (32-byte) AES master key |
| `SESSION_TIMEOUT_HOURS` | `8` | `8` | Session lifetime in hours |
| `LOGIN_MAX_ATTEMPTS` | `5` | `5` | Failed login attempts before throttle |
| `LOGIN_WINDOW_MINUTES` | `15` | `15` | Window for login throttle counting |
| `BACKUP_DIR` | `../backups` | `/app/backups` | Encrypted snapshot directory |
| `IP_ALLOWLIST_STRICT_MODE` | `true` (fail-closed) | `true` (fail-closed) | Default. Privileged route groups with zero active allowlist entries deny every request. Set to `false` only for fully-offline/air-gapped dev bootstraps where you want the legacy open-by-default posture (an empty active allowlist permits all IPs). |

> **Startup requirement:** in every non-test environment, `ENCRYPTION_MASTER_KEY` must be set to a cryptographically random 64-hex-character string (`openssl rand -hex 32`). Pass via environment variable or `.env` file — never commit.

## Security Overview

- **Authentication:** Local username/password via scrypt hashing wrapped in AES-256-GCM envelope at rest. Opaque session tokens (SHA-256 hash stored, plaintext returned once).
- **Authorization:** RBAC with 7 roles. Route-level (`fastify.authenticate`, `fastify.requireRole`) and service-level guards.
- **Encryption at rest:** AES-256-GCM with HKDF-derived per-version keys. 180-day rotation.
- **Rate limiting:** 120 req/min per authenticated principal. Login throttle: 5 failures/15 min.
- **IP allowlists:** IPv4 CIDR enforcement on privileged route groups with fail-closed behavior on allowlist lookup errors. **Default is fail-closed**: a privileged route group with zero active entries denies every request. Operators bootstrapping a fresh deployment must add at least one active `IpAllowlistEntry` per privileged route group (`admin`, `backup`) or set `IP_ALLOWLIST_STRICT_MODE=false` as an explicit opt-out (legacy open-by-default posture, offline/dev only).
- **Audit trail:** Append-only events with SHA-256 before/after digests.
- **Log safety:** Pino redacts `Authorization`, `password`, `currentPassword`, `newPassword`, `last4` fields.

## Service Architecture

- **API Server:** Fastify app serving domain routes under `/api/*` plus `/health`.
- **Background Scheduler (Warehouse):** appointment expiry pass auto-transitions stale PENDING appointments.
- **Background Scheduler (CMS):** scheduled article publish pass transitions due SCHEDULED articles.
- **Persistence:** single-node SQLite via Prisma.

## Data Retention Policy

| Data Category | Retention Window | Purge Endpoint |
|---|---|---|
| Billing records (`PaymentRecord`) | 7 years | `POST /api/admin/retention/purge-billing` |
| Operational logs (`AuditEvent`, `AppointmentOperationHistory`) | 2 years | `POST /api/admin/retention/purge-operational` |

Retention purges are explicit admin actions. Soft-deleted records become hard-delete candidates only after retention windows elapse.

## Test Directories

- `backend/unit_tests/` — Vitest unit tests (pure-function and security primitive coverage)
- `backend/api_tests/` — Vitest API/integration tests (baseline + depth suites + validation-envelope suite)
- `run_tests.sh` — Docker-first test runner: build → migrate → unit tests → API tests
- `docs/traceability.md` — Requirement-to-test mapping document

### Running Tests

```bash
# Full test suite (Docker-first)
chmod +x run_tests.sh
./run_tests.sh

# Unit tests only (Docker-first)
docker compose run --rm --no-deps backend npx vitest run --config vitest.unit.config.ts

# API tests only (Docker-first)
docker compose run --rm --no-deps backend npx vitest run --config vitest.api.config.ts
```

## Docker

```bash
# Set required env var (production key — generate once and keep secret)
export ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)

# Build and start
docker compose up --build

# Run full test suite (build → migrate → unit → API)
./run_tests.sh
```

> **Lockfile:** for fully reproducible Docker builds, run package install inside
> the backend container to generate `package-lock.json` and commit it. The Dockerfile
> prefers `npm ci` when a lockfile is present and falls back to `npm install`
> otherwise, so the build still succeeds without it.

Service: `backend` on port `3000`
Volumes: `greencycle-data` (SQLite at `/app/database`), `greencycle-backups` (encrypted snapshots at `/app/backups`)
Healthcheck: `GET /health` — polled every 30 seconds (15-second start grace period)
