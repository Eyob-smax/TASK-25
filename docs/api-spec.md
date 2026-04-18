# API Specification — GreenCycle Warehouse & Content Operations API

## 1. API Grouping Strategy

All domain endpoints are grouped under the `/api` prefix, organized by business domain:

| Prefix | Domain | Auth Required |
|---|---|---|
| `/health` | Health check | No |
| `/api/auth` | Authentication & Sessions | Partial (login is public) |
| `/api/warehouse` | Warehouse Operations | Yes |
| `/api/outbound` | Outbound Execution (orders, waves, picks, pack, handoff) | Yes |
| `/api/strategy` | Strategy Center | Yes |
| `/api/membership` | Membership & Billing Ledger | Yes |
| `/api/cms` | CMS & Taxonomy | Yes |
| `/api/admin` | Backup, Restore, Diagnostics, Parameters | Yes (privileged) |

---

## 2. Response Envelope Convention

All successful responses use a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-04-16T12:00:00.000Z"
  }
}
```

For list endpoints, `data` is an array and `meta` includes pagination:

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "requestId": "...",
    "timestamp": "...",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalCount": 142,
      "totalPages": 8
    }
  }
}
```

For mutating operations, `meta` includes the audit event ID:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "...",
    "timestamp": "...",
    "auditEventId": "ae-550e8400-..."
  }
}
```

---

## 3. Error Envelope Convention

All errors use a consistent envelope with human-readable messages:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Location capacity must be a positive number in cubic feet.",
    "details": [
      {
        "field": "capacityCuFt",
        "message": "Must be greater than 0",
        "value": -5
      }
    ]
  },
  "meta": {
    "requestId": "...",
    "timestamp": "..."
  }
}
```

Schema validation failures are normalized by the global Fastify error handler to `VALIDATION_FAILED` with structured `error.details` entries.

Protected routes emit `401 UNAUTHORIZED` **before** schema validation runs: the auth
plugin resolves the session at `onRequest` and a `preValidation` barrier short-circuits
missing or invalid sessions, so unauthenticated callers never receive
`400 VALIDATION_FAILED` schema hints for endpoints they cannot access.

### Standard Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Request payload or query parameter validation failed |
| `UNAUTHORIZED` | 401 | No valid session or session expired |
| `FORBIDDEN` | 403 | Authenticated but insufficient role/permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource or illegal state transition |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key already used with different parameters |
| `RATE_LIMITED` | 429 | Request rate exceeded (120/min or burst 30) |
| `IP_BLOCKED` | 403 | Request IP not in allowlist for this route |
| `VARIANCE_EXCEEDED` | 422 | Pack-time weight or volume variance exceeds ±5% |
| `APPROVAL_REQUIRED` | 422 | Operation requires manager/admin approval |
| `INTERNAL_ERROR` | 500 | Unexpected server error (no sensitive details exposed) |

---

## 4. Authentication and Session Conventions

### Session Model
- Sessions are opaque server-managed tokens (32 random bytes, hex-encoded = 64 chars).
- The plaintext token is returned once at login and never persisted — only its SHA-256 hash is stored.
- Clients include the token in the `Authorization` header: `Authorization: Bearer <token>`.
- Session expiry is configurable via `SESSION_TIMEOUT_HOURS` env var (default: 8 hours).
- Session invalidation: `revokedAt` field set; also auto-invalidated by `passwordVersion` mismatch after rotation.

### Login Flow
1. `POST /api/auth/login` with `{ username, password }`
2. Server checks login throttle (5 attempts / 15-minute window per username).
3. Server looks up user, verifies password with constant-time scrypt compare.
4. Returns `{ token, expiresAt, user }` on success.
5. Returns identical 401 `UNAUTHORIZED` for unknown username or wrong password (prevents enumeration).

### Session Validation (every protected request)
1. `Authorization: Bearer <token>` header parsed.
2. Token hashed (SHA-256) and looked up in `Session` table.
3. Validated: not expired, not revoked, `passwordVersion` matches current user version.
4. Principal (userId, username, roles, sessionId) attached to request as `request.principal`.

### Protected Routes
- All routes except `/health` and `POST /api/auth/login` require `request.principal` to be set.
- `fastify.authenticate` preHandler returns 401 if no valid session.
- `fastify.requireRole(roles[])` preHandler returns 403 if principal lacks required roles.
- Function-level and object-level authorization checks use `assertAnyRole()` or domain permission helpers in `src/security/rbac.ts`.

### Authorization Response Headers
```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1744808400    (Unix epoch)
Retry-After: 45                  (only on 429)
```

---

## 5. Idempotency-Key Conventions

For operations that require idempotency (e.g., wave generation):

- Client includes `Idempotency-Key: <uuid>` request header
- Server stores the key with request hash and response for 24 hours
- Duplicate submission within 24 hours with same key + same parameters: returns cached response
- Duplicate submission with same key + different parameters: returns `IDEMPOTENCY_CONFLICT` error
- Expired keys are treated as stale at read time and refreshed when reused; no dedicated purge scheduler is currently registered

---

## 6. Audit Metadata Conventions

Every create or update operation emits an append-only audit event containing:

| Field | Description |
|---|---|
| `id` | Unique audit event ID |
| `actor` | User ID or SYSTEM for automated actions |
| `action` | CREATE, UPDATE, DELETE (soft), TRANSITION |
| `resourceType` | Entity type (e.g., Appointment, Article, PaymentRecord) |
| `resourceId` | Entity ID |
| `before` | SHA-256 digest of serialized state before operation |
| `after` | SHA-256 digest of serialized state after operation |
| `timestamp` | ISO 8601 timestamp |
| `metadata` | Additional context (e.g., transition reason, approval status) |

Audit events are append-only at write time (no in-place updates). Operational retention policy can hard-delete events older than the 2-year retention window via `/api/admin/retention/purge-operational`.

---

## 7. Endpoint Groups

### 7.1 Authentication & Sessions — `/api/auth`

*Implemented in Prompt 3.*

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | None | — | Authenticate with username/password, receive session token |
| `POST` | `/api/auth/logout` | Required | Any | Revoke current session |
| `POST` | `/api/auth/rotate-password` | Required | Any | Rotate password, invalidate all sessions |
| `GET` | `/api/auth/me` | Required | Any | Get current principal info and roles |
| `POST` | `/api/auth/users` | Required | SYSTEM_ADMIN | Create a new user with roles |
| `PUT` | `/api/auth/users/:userId/roles` | Required | SYSTEM_ADMIN | Replace all roles for a user |

**POST /api/auth/login — request:**
```json
{ "username": "warehouse_op", "password": "SecurePass123!" }
```
**POST /api/auth/login — 200 response:**
```json
{
  "success": true,
  "data": {
    "token": "a3f8c2e1...(64-char hex)",
    "expiresAt": "2026-04-16T20:00:00.000Z",
    "user": {
      "id": "clxyz...",
      "username": "warehouse_op",
      "isActive": true,
      "encryptionKeyVersion": "1",
      "createdAt": "2026-04-01T08:00:00.000Z",
      "updatedAt": "2026-04-01T08:00:00.000Z"
    }
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```
**POST /api/auth/login — 401 (invalid credentials):**
```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Invalid credentials" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```
**POST /api/auth/login — 429 (login throttled):**
```json
{
  "success": false,
  "error": { "code": "RATE_LIMITED", "message": "Too many failed login attempts. Try again later." },
  "meta": { "requestId": "...", "timestamp": "...", "retryAfterSeconds": 842 }
}
```

**POST /api/auth/rotate-password — request:**
```json
{ "currentPassword": "OldPass123!", "newPassword": "NewPass456!" }
```
**POST /api/auth/rotate-password — 200 response:**
```json
{
  "success": true,
  "data": { "message": "Password rotated. All sessions have been invalidated." },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**POST /api/auth/users — request (SYSTEM_ADMIN only):**
```json
{
  "username": "new_operator",
  "password": "TempPass123!",
  "roles": ["WAREHOUSE_OPERATOR"]
}
```

**PUT /api/auth/users/:userId/roles — request (SYSTEM_ADMIN only):**
```json
{ "roles": ["WAREHOUSE_MANAGER", "STRATEGY_MANAGER"] }
```

### 7.2 Warehouse Operations — `/api/warehouse`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/warehouse/facilities` | Create facility |
| `GET` | `/api/warehouse/facilities` | List facilities |
| `GET` | `/api/warehouse/facilities/:id` | Get facility |
| `PATCH` | `/api/warehouse/facilities/:id` | Update facility |
| `POST` | `/api/warehouse/facilities/:facilityId/zones` | Create zone |
| `GET` | `/api/warehouse/facilities/:facilityId/zones` | List zones |
| `POST` | `/api/warehouse/locations` | Create location |
| `GET` | `/api/warehouse/locations` | List/query locations |
| `GET` | `/api/warehouse/locations/:id` | Get location |
| `PATCH` | `/api/warehouse/locations/:id` | Update location |
| `POST` | `/api/warehouse/skus` | Create SKU/item |
| `GET` | `/api/warehouse/skus` | List/query SKUs |
| `GET` | `/api/warehouse/skus/:id` | Get SKU |
| `PATCH` | `/api/warehouse/skus/:id` | Update SKU |
| `POST` | `/api/warehouse/inventory-lots` | Create inventory lot |
| `GET` | `/api/warehouse/inventory-lots` | List/query inventory lots |
| `PATCH` | `/api/warehouse/inventory-lots/:id` | Update lot counts |
| `POST` | `/api/warehouse/appointments` | Create appointment |
| `GET` | `/api/warehouse/appointments` | List appointments |
| `GET` | `/api/warehouse/appointments/:id` | Get appointment with history |
| `POST` | `/api/warehouse/appointments/:id/confirm` | Confirm appointment |
| `POST` | `/api/warehouse/appointments/:id/reschedule` | Reschedule appointment |
| `POST` | `/api/warehouse/appointments/:id/cancel` | Cancel appointment |

### 7.3 Outbound Execution — `/api/outbound`
Access scope: WAREHOUSE_MANAGER/SYSTEM_ADMIN have full outbound visibility. Non-manager operators are scoped to outbound records they created; cross-owner reads return `404 NOT_FOUND`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/outbound/orders` | Create outbound order |
| `GET` | `/api/outbound/orders` | List outbound orders |
| `GET` | `/api/outbound/orders/:id` | Get outbound order with lines |
| `POST` | `/api/outbound/waves` | Generate wave (idempotency key required) |
| `GET` | `/api/outbound/waves/:id` | Get wave with pick tasks |
| `PATCH` | `/api/outbound/pick-tasks/:id` | Update pick task status |
| `POST` | `/api/outbound/orders/:id/pack-verify` | Pack verification (weight/volume) |
| `POST` | `/api/outbound/orders/:id/handoff` | Record outbound handoff (requires `PACKED` + latest verification `PASSED`) |
| `POST` | `/api/outbound/orders/:id/exceptions` | Report shortage exception |
| `PATCH` | `/api/outbound/orders/:id/approve-partial` | Manager approval for partial shipment |

### 7.4 Strategy Center — `/api/strategy`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/strategy/rulesets` | Create strategy ruleset |
| `POST` | `/api/strategy/simulate` | Run fixed 30-day simulation evaluation (`windowDays` must be `30`) |
| `GET` | `/api/strategy/rulesets` | List strategy rulesets |
| `GET` | `/api/strategy/rulesets/:rulesetId` | Get ruleset details |
| `PATCH` | `/api/strategy/rulesets/:rulesetId` | Update ruleset weights |
| `POST` | `/api/strategy/putaway-rank` | Get ranked putaway locations |
| `POST` | `/api/strategy/pick-path` | Get optimized pick path |
| `POST` | `/api/strategy/simulate` | Run 30-day simulation evaluation |

### 7.5 Membership & Billing — `/api/membership`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/membership/members` | Create member |
| `GET` | `/api/membership/members` | List members (MEMBERSHIP_MANAGER/SYSTEM_ADMIN) |
| `GET` | `/api/membership/members/:id` | Get member (MEMBERSHIP_MANAGER/SYSTEM_ADMIN) |
| `POST` | `/api/admin/key-versions/rotate` | Manual key rotation (automatic scheduler also enforces overdue rotation) (IP-allowlisted) |
| `PATCH` | `/api/membership/members/:id` | Update member |
| `DELETE` | `/api/membership/members/:id` | Soft-delete member |
| `POST` | `/api/membership/packages` | Create membership package |
| `GET` | `/api/membership/packages` | List packages |
| `POST` | `/api/membership/members/:id/enrollments` | Enroll member in package |
| `GET` | `/api/membership/members/:id/enrollments` | List enrollments |
| `POST` | `/api/membership/payments` | Record payment |
| `GET` | `/api/membership/payments` | List payments |
| `GET` | `/api/membership/payments/:id` | Get payment (masked by role) |
| `PATCH` | `/api/membership/payments/:id/status` | Transition payment status |
| `DELETE` | `/api/membership/payments/:id` | Soft-delete payment (anchors 7-year `retentionExpiresAt`) |

### 7.6 CMS — `/api/cms`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/cms/articles` | Create article (draft) |
| `GET` | `/api/cms/articles` | List articles |
| `GET` | `/api/cms/articles/:id` | Get article |
| `PATCH` | `/api/cms/articles/:id` | Update article |
| `POST` | `/api/cms/articles/:id/submit-review` | Submit for review |
| `POST` | `/api/cms/articles/:id/approve` | Approve for publish (reviewer only) |
| `POST` | `/api/cms/articles/:id/publish` | Publish article |
| `POST` | `/api/cms/articles/:id/schedule` | Schedule publish (local server time) |
| `POST` | `/api/cms/articles/:id/withdraw` | Withdraw published article |
| `POST` | `/api/cms/categories` | Create category |
| `GET` | `/api/cms/categories` | List categories (tree) |
| `PATCH` | `/api/cms/categories/:id` | Update category |
| `POST` | `/api/cms/tags` | Create tag |
| `GET` | `/api/cms/tags` | List tags |
| `POST` | `/api/cms/tags/:id/aliases` | Add tag alias |
| `POST` | `/api/cms/tags/merge` | Merge tags (creates tombstone) |
| `POST` | `/api/cms/tags/bulk-migrate` | Bulk re-associate articles to tags |
| `GET` | `/api/cms/tags/trending` | Get trending tags (last 7 days) |
| `GET` | `/api/cms/tags/cloud` | Export tag cloud (aggregated counts) |
| `POST` | `/api/cms/articles/:id/interactions` | Record article interaction |

### 7.7 Admin & Operations — `/api/admin`

All admin routes require `SYSTEM_ADMIN` and enforce the `admin` IP allowlist group, including read-only parameter lookups. If allowlist lookup fails, the request is denied with `500 INTERNAL_ERROR` (fail-closed behavior).

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/diagnostics` | Structured local diagnostics (memory, DB counts, key status) (IP-allowlisted) |
| `POST` | `/api/admin/backup` | Create encrypted backup snapshot (IP-allowlisted) |
| `GET` | `/api/admin/backup` | List backup snapshots (IP-allowlisted) |
| `GET` | `/api/admin/backup/:snapshotId` | Get backup snapshot metadata (IP-allowlisted) |
| `POST` | `/api/admin/backup/:snapshotId/restore` | Restore from encrypted snapshot (SYSTEM_ADMIN, IP-allowlisted) |
| `GET` | `/api/admin/retention/report` | Retention eligibility counts per domain (IP-allowlisted) |
| `POST` | `/api/admin/retention/purge-billing` | Hard-delete billing records past 7-year retention (IP-allowlisted) |
| `POST` | `/api/admin/retention/purge-operational` | Hard-delete operational logs past 2-year retention (IP-allowlisted) |
| `GET` | `/api/admin/parameters` | List parameters (SYSTEM_ADMIN, IP-allowlisted) |
| `GET` | `/api/admin/parameters/:key` | Get parameter value (SYSTEM_ADMIN, IP-allowlisted) |
| `POST` | `/api/admin/parameters` | Create parameter entry (IP-allowlisted) |
| `PUT` | `/api/admin/parameters/:key` | Update parameter value (IP-allowlisted) |
| `DELETE` | `/api/admin/parameters/:key` | Remove parameter (IP-allowlisted) |
| `GET` | `/api/admin/ip-allowlist` | List IP allowlist entries (optional `routeGroup` filter) (IP-allowlisted) |
| `POST` | `/api/admin/ip-allowlist` | Add IP allowlist entry (CIDR + routeGroup) (IP-allowlisted) |
| `PATCH` | `/api/admin/ip-allowlist/:entryId` | Update allowlist entry (IP-allowlisted) |
| `DELETE` | `/api/admin/ip-allowlist/:entryId` | Remove allowlist entry (IP-allowlisted) |
| `GET` | `/api/admin/key-versions` | List encryption key versions (IP-allowlisted) |
| `POST` | `/api/admin/key-versions/rotate` | Rotate encryption master key (180-day expiry) (IP-allowlisted) |

### 7.8 Health — `/health`

*Implemented in Prompt 1.*

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Basic health check (no auth) |

---

## 8. Payload Contracts

Concrete request/response shapes for each endpoint group. Validation schemas are defined in `src/shared/schemas/`.

### 8.1 Authentication

**POST /api/auth/login**
```json
// Request
{ "username": "operator1", "password": "securePass123" }

// Success (200)
{
  "success": true,
  "data": {
    "token": "opaque-session-token",
    "expiresAt": "2026-04-17T12:00:00.000Z",
    "user": { "id": "...", "username": "operator1", "roles": ["WAREHOUSE_OPERATOR"] }
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}

// Error (401)
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Invalid username or password." }, "meta": { ... } }
```

**POST /api/auth/rotate-password**
```json
// Request
{ "currentPassword": "oldPass123", "newPassword": "newSecure456" }

// Success (200) — all sessions invalidated
{ "success": true, "data": { "message": "Password rotated. All existing sessions have been invalidated." }, "meta": { ... } }
```

**POST /api/auth/users** (admin only)
```json
// Request
{ "username": "reviewer1", "password": "securePass123", "roles": ["CMS_REVIEWER"] }

// Success (201)
{ "success": true, "data": { "id": "...", "username": "reviewer1", "roles": ["CMS_REVIEWER"] }, "meta": { "auditEventId": "..." } }
```

### 8.2 Warehouse — Facilities, Zones, Locations

**POST /api/warehouse/facilities**
```json
// Request
{ "name": "Main Warehouse", "code": "WH-001", "address": "123 Green St" }

// Success (201)
{ "success": true, "data": { "id": "...", "name": "Main Warehouse", "code": "WH-001", "address": "123 Green St", "isActive": true }, "meta": { "auditEventId": "..." } }
```

**POST /api/warehouse/locations**
```json
// Request
{
  "facilityId": "...", "code": "A-01-01", "capacityCuFt": 120.5,
  "type": "RACK", "hazardClass": "NONE", "temperatureBand": "AMBIENT", "isPickFace": true
}

// Success (201)
{ "success": true, "data": { "id": "...", "code": "A-01-01", "capacityCuFt": 120.5, ... }, "meta": { "auditEventId": "..." } }

// Error (400) — capacity must be positive
{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "Location capacity must be a positive number.", "details": [{ "field": "capacityCuFt", "message": "Must be greater than 0" }] }, "meta": { ... } }
```

### 8.3 Warehouse — SKUs and Inventory Lots

**POST /api/warehouse/skus**
```json
// Request
{ "code": "SKU-ECO-001", "name": "Recycled Paper Towels", "abcClass": "A", "unitWeightLb": 2.5, "unitVolumeCuFt": 0.5 }

// Success (201)
{ "success": true, "data": { "id": "...", "code": "SKU-ECO-001", ... }, "meta": { "auditEventId": "..." } }

// Error (409) — duplicate SKU code
{ "success": false, "error": { "code": "CONFLICT", "message": "A SKU with code 'SKU-ECO-001' already exists." }, "meta": { ... } }
```

**POST /api/warehouse/inventory-lots**
```json
// Request
{ "skuId": "...", "locationId": "...", "lotNumber": "LOT-2026-042", "expirationDate": "2027-04-16T00:00:00Z", "onHand": 100 }

// Success (201)
{ "success": true, "data": { "id": "...", "skuId": "...", "lotNumber": "LOT-2026-042", "onHand": 100, "reserved": 0, "damaged": 0 }, "meta": { "auditEventId": "..." } }
```

### 8.4 Warehouse — Appointments

**POST /api/warehouse/appointments**
```json
// Request
{ "facilityId": "...", "type": "INBOUND", "scheduledAt": "2026-04-20T14:00:00Z", "carrierId": "CARRIER-01" }

// Success (201)
{ "success": true, "data": { "id": "...", "state": "PENDING", "type": "INBOUND", "scheduledAt": "2026-04-20T14:00:00Z" }, "meta": { "auditEventId": "..." } }
```

**POST /api/warehouse/appointments/:id/confirm**
```json
// Request
{ "reason": "Carrier confirmed arrival window" }

// Success (200)
{ "success": true, "data": { "id": "...", "state": "CONFIRMED", "confirmedAt": "2026-04-16T15:00:00Z" }, "meta": { "auditEventId": "..." } }

// Error (409) — invalid transition
{ "success": false, "error": { "code": "INVALID_TRANSITION", "message": "Cannot transition appointment from EXPIRED to CONFIRMED. Allowed transitions from EXPIRED: none (terminal state)." }, "meta": { ... } }
```

**POST /api/warehouse/appointments/:id/reschedule**
```json
// Request
{ "scheduledAt": "2026-04-22T10:00:00Z", "reason": "Carrier delay" }

// Success (200) — transitions CONFIRMED → RESCHEDULED
{ "success": true, "data": { "id": "...", "state": "RESCHEDULED", "scheduledAt": "2026-04-22T10:00:00Z" }, "meta": { "auditEventId": "..." } }
```

**GET /api/warehouse/appointments/:id** — includes operation history
```json
{
  "success": true,
  "data": {
    "id": "...", "state": "CONFIRMED",
    "operationHistory": [
      { "id": "...", "actor": "user-123", "priorState": "PENDING", "newState": "CONFIRMED", "reason": "Carrier confirmed", "timestamp": "2026-04-16T15:00:00Z" }
    ]
  },
  "meta": { ... }
}
```

### 8.5 Outbound — Orders, Waves, Pack Verification

**POST /api/outbound/orders**
```json
// Request
{
  "facilityId": "...", "type": "SALES", "requestedShipDate": "2026-04-20T00:00:00Z",
  "lines": [{ "skuId": "...", "quantity": 50 }, { "skuId": "...", "quantity": 25 }]
}

// Success (201)
{ "success": true, "data": { "id": "...", "status": "DRAFT", "lines": [...] }, "meta": { "auditEventId": "..." } }
```

**POST /api/outbound/waves** — requires `Idempotency-Key` header
```json
// Headers: { "Idempotency-Key": "550e8400-e29b-..." }
// Request
{ "facilityId": "...", "orderIds": ["order-1", "order-2"] }

// Success (201)
{ "success": true, "data": { "id": "...", "idempotencyKey": "550e8400-e29b-...", "status": "CREATED", "pickTasks": [...] }, "meta": { "auditEventId": "..." } }

// Error (409) — same key, different params
{ "success": false, "error": { "code": "IDEMPOTENCY_CONFLICT", "message": "Idempotency key '550e8400-e29b-...' was already used with different request parameters." }, "meta": { ... } }
```

**POST /api/outbound/orders/:id/pack-verify**
```json
// Request
{ "actualWeightLb": 125.3, "actualVolumeCuFt": 48.2 }

// Success (200) — within ±5%
{ "success": true, "data": { "status": "PASSED", "weightVariancePct": 2.1, "volumeVariancePct": -1.5 }, "meta": { "auditEventId": "..." } }

// Error (422) — variance exceeded
{ "success": false, "error": { "code": "VARIANCE_EXCEEDED", "message": "Pack verification failed. Weight variance 8.2% exceeds ±5% tolerance (expected: 115.8 lb, actual: 125.3 lb)." }, "meta": { ... } }
```

**POST /api/outbound/orders/:id/exceptions**
```json
// Request
{ "lineId": "...", "shortageReason": "STOCKOUT", "quantityShort": 10 }

// Success (201) — source line updated and backorder line created
{ "success": true, "data": { "line": { "id": "...", "quantityShort": 10, "shortageReason": "STOCKOUT" }, "backorder": { "id": "...", "lineType": "BACKORDER", "shortageReason": "STOCKOUT", "quantity": 10 } }, "meta": { "auditEventId": "..." } }

// Error (400) — quantityShort exceeds remaining quantity
{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "quantityShort (...) cannot exceed remaining line quantity (...)" }, "meta": { ... } }
```

**PATCH /api/outbound/orders/:id/approve-partial** (manager only)
```json
// Request
{ "reason": "Customer accepted partial delivery" }

// Success (200)
{ "success": true, "data": { "id": "...", "approvedForPartialShip": true, "approvedBy": "manager-1" }, "meta": { "auditEventId": "..." } }

// Error (403) — non-manager
{ "success": false, "error": { "code": "FORBIDDEN", "message": "Only WAREHOUSE_MANAGER or SYSTEM_ADMIN can approve partial shipments." }, "meta": { ... } }
```

### 8.6 Strategy Center

**POST /api/strategy/rulesets**
```json
// Request
{ "name": "FEFO Priority", "fifoWeight": 0.2, "fefoWeight": 1.0, "abcWeight": 0.8, "heatLevelWeight": 0.5, "pathCostWeight": 1.0 }

// Success (201)
{ "success": true, "data": { "id": "...", "name": "FEFO Priority", ... }, "meta": { "auditEventId": "..." } }
```

**POST /api/strategy/putaway-rank**
```json
// Request
{ "facilityId": "...", "skuId": "...", "quantity": 100, "rulesetId": "..." }

// Success (200) — ranked locations with score breakdown
{
  "success": true,
  "data": {
    "rankedLocations": [
      { "locationId": "...", "code": "A-01-01", "totalScore": 8.5, "components": { "fifo": 2.0, "fefo": 0.0, "abc": 3.0, "heat": 1.5, "pathCost": 2.0 } },
      { "locationId": "...", "code": "B-02-03", "totalScore": 7.2, "components": { ... } }
    ]
  },
  "meta": { ... }
}
```

**POST /api/strategy/simulate**
```json
// Request
{ "facilityId": "...", "rulesetIds": ["ruleset-1", "ruleset-2"], "windowDays": 30 }

// Success (200) — comparative metrics
{
  "success": true,
  "data": {
    "results": [
      { "rulesetId": "ruleset-1", "rulesetName": "FIFO Default", "metrics": { "estimatedTotalDistance": 15420.5, "totalTouches": 892, "constraintViolations": 3 } },
      { "rulesetId": "ruleset-2", "rulesetName": "FEFO Priority", "metrics": { "estimatedTotalDistance": 16100.2, "totalTouches": 845, "constraintViolations": 1 } }
    ],
    "datasetInfo": { "windowDays": 30, "completedPickTasks": 1247, "excludedTasks": 23 }
  },
  "meta": { ... }
}
```

### 8.7 Membership & Billing

**POST /api/membership/members**
```json
// Request
{ "memberNumber": "MEM-001", "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com" }

// Success (201) — sensitive fields masked for non-privileged roles
{ "success": true, "data": { "id": "...", "memberNumber": "***-001", "firstName": "Jane", "lastName": "Doe", "email": "j***@example.com" }, "meta": { "auditEventId": "..." } }
```

**POST /api/membership/payments**
```json
// Request
{ "memberId": "...", "enrollmentId": "...", "amount": 49.99, "paymentMethod": "CARD", "last4": "4242" }

// Success (201)
{ "success": true, "data": { "id": "...", "invoiceNumber": "GC-20260416-00001", "amount": 49.99, "status": "RECORDED", "last4": "****" }, "meta": { "auditEventId": "..." } }
```

**GET /api/membership/payments/:id** — masked response for non-privileged
```json
{ "success": true, "data": { "id": "...", "invoiceNumber": "GC-20260416-00001", "amount": 49.99, "last4": "****", "memberId": "***masked***" }, "meta": { ... } }
```

### 8.8 CMS — Articles, Tags, Categories

**POST /api/cms/articles**
```json
// Request
{ "title": "Sustainable Packaging Guide", "slug": "sustainable-packaging-guide", "body": "...", "tagIds": ["tag-1"], "categoryIds": ["cat-1"] }

// Success (201)
{ "success": true, "data": { "id": "...", "state": "DRAFT", "title": "Sustainable Packaging Guide" }, "meta": { "auditEventId": "..." } }
```

**POST /api/cms/articles/:id/approve** (reviewer only)
```json
// Success (200)
{ "success": true, "data": { "id": "...", "state": "APPROVED", "reviewerId": "reviewer-1" }, "meta": { "auditEventId": "..." } }

// Error (403) — non-reviewer
{ "success": false, "error": { "code": "FORBIDDEN", "message": "Only CMS_REVIEWER or SYSTEM_ADMIN can approve articles for publication." }, "meta": { ... } }
```

**POST /api/cms/articles/:id/schedule**
```json
// Request
{ "scheduledPublishAt": "2026-04-20T09:00:00" }

// Success (200) — uses local server time
{ "success": true, "data": { "id": "...", "state": "SCHEDULED", "scheduledPublishAt": "2026-04-20T09:00:00" }, "meta": { "auditEventId": "..." } }
```

**POST /api/cms/tags/merge**
```json
// Request
{ "sourceTagId": "tag-old", "targetTagId": "tag-canonical" }

// Success (200) — source becomes tombstone
{ "success": true, "data": { "sourceTag": { "id": "tag-old", "isTombstone": true, "canonicalTagId": "tag-canonical" }, "articlesReassociated": 15 }, "meta": { "auditEventId": "..." } }

// Error (409) — self-merge
{ "success": false, "error": { "code": "CONFLICT", "message": "Cannot merge a tag into itself." }, "meta": { ... } }
```

**GET /api/cms/tags/trending**
```json
{
  "success": true,
  "data": {
    "window": { "days": 7, "from": "2026-04-09T00:00:00Z", "to": "2026-04-16T00:00:00Z" },
    "tags": [
      { "tagId": "...", "name": "recycling", "interactionCount": 342, "weightedScore": 512.5 },
      { "tagId": "...", "name": "solar energy", "interactionCount": 198, "weightedScore": 297.0 }
    ]
  },
  "meta": { ... }
}
```

**GET /api/cms/tags/cloud**
```json
{ "success": true, "data": { "tags": [{ "name": "recycling", "count": 47 }, { "name": "solar energy", "count": 31 }] }, "meta": { ... } }
```

### 8.9 Admin & Operations

**POST /api/admin/backup**
```json
// Success (201)
{ "success": true, "data": { "id": "...", "filename": "backup-20260416-150000.enc", "path": "/app/backups/backup-20260416-150000.enc", "sizeBytes": 4521890, "checksum": "sha256:abc..." }, "meta": { "auditEventId": "..." } }
```

**GET /api/admin/diagnostics** — structured local diagnostics (see full schema in section 15).

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": { "users": 5, "articles": 12, "members": 8 },
    "encryption": { "activeKeyVersion": 3, "keyExpiresAt": "2026-10-13T00:00:00Z", "rotationOverdue": false },
    "uptimeSeconds": 86400
  },
  "meta": { ... }
}
```

> Unauthenticated health probe is served by `GET /health` (no `/api` prefix). Audit-event query endpoints are not exposed over HTTP in the current scope — audit trail queries are performed internally via the services layer.

---

## 9. Warehouse Operations Endpoint Contracts (Prompt 4)

All warehouse routes are under `/api/warehouse`. All require `Authorization: Bearer <token>`.

### 9.1 Facilities

**POST /api/warehouse/facilities** — roles: WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request
{ "name": "Main Warehouse", "code": "WH-001", "address": "123 Industrial Blvd" }

// Success (201)
{
  "success": true,
  "data": { "id": "fac-cuid", "name": "Main Warehouse", "code": "WH-001", "address": "123 Industrial Blvd", "isActive": true, "createdAt": "...", "updatedAt": "..." },
  "meta": { "requestId": "...", "timestamp": "..." }
}

// Conflict (409) — duplicate code
{ "success": false, "error": { "code": "CONFLICT", "message": "Facility code 'WH-001' already exists" }, "meta": { ... } }

// Unauthorized (401)
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "No session token provided" }, "meta": { ... } }
```

**PATCH /api/warehouse/facilities/:facilityId** — roles: WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request (all fields optional)
{ "name": "Updated Name", "isActive": false }

// Success (200) — returns updated facility
```

**DELETE /api/warehouse/facilities/:facilityId** — soft delete; roles: WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Success (200)
{ "success": true, "data": { "message": "Facility deleted" }, "meta": { ... } }
```

### 9.2 Zones

**POST /api/warehouse/facilities/:facilityId/zones** — roles: WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request
{ "name": "Rack Zone A", "code": "RACK-A", "description": "High-bay racking" }

// Success (201) — returns created zone
// Conflict (409) — zone code already exists in facility
```

### 9.3 Locations

**POST /api/warehouse/locations** — roles: WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request
{
  "facilityId": "fac-cuid",
  "code": "A-01-001",
  "capacityCuFt": 48.0,
  "type": "RACK",
  "hazardClass": "NONE",
  "temperatureBand": "AMBIENT",
  "isPickFace": true
}

// Success (201) — returns created location
// Conflict (409) — location code globally non-unique
```

**GET /api/warehouse/locations?facilityId=fac-cuid&includeInactive=false** — any authenticated

### 9.4 SKUs

**POST /api/warehouse/skus** — roles: WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request
{ "code": "SKU-10042", "name": "Recycled Bin 50L", "unitWeightLb": 2.5, "unitVolumeCuFt": 1.8, "abcClass": "A" }

// Success (201) — returns created SKU
// Conflict (409) — SKU code already exists
```

### 9.5 Inventory Lots

**POST /api/warehouse/inventory-lots** — roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request
{
  "skuId": "sku-cuid",
  "locationId": "loc-cuid",
  "lotNumber": "LOT-2026-001",
  "batchNumber": "BATCH-A",
  "expirationDate": "2027-06-01T00:00:00.000Z",
  "onHand": 100,
  "reserved": 0,
  "damaged": 0
}

// Success (201) — returns lot with sku and location included
// Not Found (404) — if skuId or locationId doesn't exist
```

**PATCH /api/warehouse/inventory-lots/:lotId** — roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request (all optional, minimum 0)
{ "onHand": 95, "damaged": 5 }
```

### 9.6 Appointments

**POST /api/warehouse/appointments** — roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request
{
  "facilityId": "fac-cuid",
  "type": "INBOUND",
  "scheduledAt": "2026-04-17T09:00:00.000Z",
  "carrierId": "CARRIER-XYZ",
  "referenceNumber": "PO-00456",
  "notes": "Fragile cargo"
}

// Success (201) — state is always PENDING on creation
{
  "success": true,
  "data": { "id": "apt-cuid", "state": "PENDING", "facilityId": "...", "type": "INBOUND", "scheduledAt": "...", "createdBy": "user-id", ... },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**GET /api/warehouse/appointments/:appointmentId** — any authenticated; includes history
```json
// Success (200)
{
  "success": true,
  "data": {
    "id": "apt-cuid",
    "state": "CONFIRMED",
    "operationHistory": [
      { "id": "...", "actor": "user-id", "priorState": "", "newState": "PENDING", "reason": "Created", "timestamp": "..." },
      { "id": "...", "actor": "user-id", "priorState": "PENDING", "newState": "CONFIRMED", "reason": "Dock confirmed", "timestamp": "..." }
    ]
  }
}
```

**POST /api/warehouse/appointments/:appointmentId/confirm** — roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request (required reason)
{ "reason": "Dock confirmed with carrier" }

// Success (200) — returns updated appointment with history
// Invalid transition (409)
{ "success": false, "error": { "code": "INVALID_TRANSITION", "message": "Cannot transition appointment from 'EXPIRED' to 'CONFIRMED'" }, "meta": { ... } }
```

**POST /api/warehouse/appointments/:appointmentId/reschedule** — roles: WAREHOUSE_MANAGER, SYSTEM_ADMIN
```json
// Request — scheduledAt required
{ "scheduledAt": "2026-04-18T14:00:00.000Z", "reason": "Carrier rescheduled" }

// Transitions CONFIRMED → RESCHEDULED with new scheduledAt
// Validation error (400) if scheduledAt missing
{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "Reschedule requires a new scheduledAt date" }, "meta": { ... } }
```

**POST /api/warehouse/appointments/:appointmentId/cancel** — roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, SYSTEM_ADMIN

**GET /api/warehouse/appointments?facilityId=fac-cuid&state=PENDING&type=INBOUND** — any authenticated

---

## 10. Current State

The repository currently includes baseline API tests plus DB-backed depth suites for auth, warehouse, outbound, membership, CMS, admin, and validation-envelope normalization. Static audit re-run is required to confirm final acceptance status.

Implemented routes:
- `/api/auth/*` — login, logout, rotate-password, me, create-user, update-roles
- `/api/warehouse/*` — facilities, zones, locations, SKUs, inventory lots, appointments (with FSM + auto-expire)
- `/api/outbound/*` — orders, waves (24h idempotency), pick tasks, pack verify, exceptions, handoff, partial-shipment approval
- `/api/strategy/*` — rulesets, putaway-rank, pick-path, 30-day simulate
- `/api/membership/*` — members (AES-256-GCM encrypted fields), packages (4 types), enrollments, payments (with state transitions)
- `/api/cms/*` — articles (6-state FSM + scheduled publish), categories, tags (aliases, merge tombstones, bulk-migrate, trending, cloud)
- `/api/admin/*` — diagnostics, encrypted backup/restore, retention purge (7-year billing, 2-year operational), parameters, IP allowlist, key-version rotation

See `docs/traceability.md` for the requirement-to-test map and depth-suite coverage additions.

---

## 11. Outbound Execution (Prompt 5)

### POST /api/outbound/orders — Create outbound order
Roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, SYSTEM_ADMIN

**Request:**
```json
{
  "facilityId": "fac-cuid",
  "type": "SALES",
  "referenceNumber": "SO-2026-001",
  "lines": [
    { "skuId": "sku-cuid-1", "quantity": 5 },
    { "skuId": "sku-cuid-2", "quantity": 10 }
  ]
}
```

**201 Success:**
```json
{
  "success": true,
  "data": {
    "id": "order-cuid",
    "facilityId": "fac-cuid",
    "type": "SALES",
    "status": "DRAFT",
    "referenceNumber": "SO-2026-001",
    "lines": [
      { "id": "line-cuid-1", "skuId": "sku-cuid-1", "quantity": 5, "quantityFulfilled": 0, "quantityShort": 0, "lineType": "STANDARD" }
    ],
    "createdAt": "2026-04-16T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**400 Validation:**
```json
{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "body must have required property 'facilityId'" }, "meta": { "requestId": "...", "timestamp": "..." } }
```

### POST /api/outbound/waves — Generate wave (with idempotency)
Roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, SYSTEM_ADMIN
Required header: `Idempotency-Key: <uuid>`

**201 Success (first call):**
```json
{
  "success": true,
  "data": {
    "id": "wave-cuid",
    "facilityId": "fac-cuid",
    "status": "CREATED",
    "pickTasks": [
      { "id": "task-cuid-1", "skuId": "sku-cuid-1", "locationId": "loc-cuid", "quantity": 5, "sequence": 1, "status": "PENDING" }
    ]
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**200 Cached replay (repeat call within 24h):**
```json
{
  "success": true,
  "data": { "fromCache": true, "wave": { ... } },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### PATCH /api/outbound/pick-tasks/:taskId — Update pick task (SHORT example)
**Request:**
```json
{ "status": "SHORT", "quantityPicked": 3, "assignedTo": "user-cuid" }
```

**200 Success (shortage creates backorder):**
```json
{
  "success": true,
  "data": {
    "id": "task-cuid",
    "status": "SHORT",
    "quantityPicked": 3,
    "completedAt": "2026-04-16T12:05:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### POST /api/outbound/orders/:orderId/pack-verify — Pack verification
**Request:**
```json
{ "actualWeightLb": 112.3, "actualVolumeCuFt": 3.7 }
```

**422 VARIANCE_EXCEEDED:**
```json
{
  "success": false,
  "error": {
    "code": "VARIANCE_EXCEEDED",
    "message": "Weight variance +6.2% exceeds ±5% tolerance"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### POST /api/outbound/orders/:orderId/handoff — Handoff to carrier
**409 INVALID_TRANSITION (order not yet packed):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Order must be PACKED before handoff (...)"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**422 APPROVAL_REQUIRED (shortage without manager approval):**
```json
{
  "success": false,
  "error": {
    "code": "APPROVAL_REQUIRED",
    "message": "Partial shipment requires manager approval"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

## 12. Strategy Center (Prompt 5)

### POST /api/strategy/putaway-rank — Ranked putaway locations
Roles: WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, STRATEGY_MANAGER, SYSTEM_ADMIN

**Request:**
```json
{ "facilityId": "fac-cuid", "skuId": "sku-cuid", "quantity": 50 }
```

**200 Success:**
```json
{
  "success": true,
  "data": [
    { "location": { "id": "loc-cuid", "code": "A01-01", "type": "PICK_FACE" }, "score": 24.5, "heatScore": 12 },
    { "location": { "id": "loc-cuid-2", "code": "B02-03", "type": "RACK" }, "score": 18.2, "heatScore": 3 }
  ],
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### POST /api/strategy/simulate — Simulation with comparative metrics

**Request:**
```json
{ "facilityId": "fac-cuid", "rulesetIds": ["rs-cuid-1", "rs-cuid-2"], "windowDays": 30 }
```

`windowDays` is fixed to `30` by contract. Any non-30 value is rejected with `400 VALIDATION_FAILED`.
Note: member read endpoints are limited to MEMBERSHIP_MANAGER and SYSTEM_ADMIN.
`POST /api/admin/key-versions/rotate` — manual rotation trigger:

Automatic enforcement: app startup wires a local scheduler that runs key-rotation passes on a configurable interval (`KEY_ROTATION_CHECK_INTERVAL_MS`, default 24h). When the active key version is overdue, the scheduler rotates to the next version automatically.

**200 Success:**
```json
{
  "success": true,
  "data": {
    "tasks": 142,
    "results": [
      {
        "rulesetId": "rs-cuid-1",
        "name": "FIFO-heavy",
        "totalTouches": 142,
        "estimatedTotalDistance": 83.5,
        "constraintViolations": 0
      },
      {
        "rulesetId": "rs-cuid-2",
        "name": "ABC-path-optimized",
        "totalTouches": 142,
        "estimatedTotalDistance": 61.0,
        "constraintViolations": 2
      }
    ]
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

## 13. Membership & Billing (Prompt 6)

### POST /api/membership/members — Create member
Roles: MEMBERSHIP_MANAGER, SYSTEM_ADMIN

**Request:**
```json
{
  "memberNumber": "M-2026-001",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "phone": "555-867-5309"
}
```

**201 Success (fields encrypted at rest, masked in response per role):**
```json
{
  "success": true,
  "data": {
    "id": "member-cuid",
    "memberNumber": "M-2026-001",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "j***@example.com",
    "phone": "***-5309",
    "isActive": true,
    "createdAt": "2026-04-16T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

Note: member read endpoints are limited to MEMBERSHIP_MANAGER and SYSTEM_ADMIN.

### POST /api/membership/payments — Record payment
Roles: BILLING_MANAGER, MEMBERSHIP_MANAGER, SYSTEM_ADMIN

**Request:**
```json
{
  "memberId": "member-cuid",
  "enrollmentId": "enroll-cuid",
  "amount": 99.99,
  "currency": "USD",
  "paymentMethod": "CARD",
  "last4": "4242",
  "paidAt": "2026-04-16T12:00:00.000Z"
}
```

**201 Success:**
```json
{
  "success": true,
  "data": {
    "id": "pay-cuid",
    "invoiceNumber": "GC-20260416-00001",
    "amount": 99.99,
    "currency": "USD",
    "status": "RECORDED",
    "last4": null,
    "paidAt": "2026-04-16T12:00:00.000Z",
    "deletedAt": null,
    "retentionExpiresAt": null
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

Note: `last4` is `null` for MEMBERSHIP_MANAGER; BILLING_MANAGER and SYSTEM_ADMIN see the unmasked value. `retentionExpiresAt` is `null` while the record is active; it is populated only when the payment is soft-deleted (see `DELETE` below).

### GET /api/membership/payments/:paymentId — Get payment (role-aware masking)
- **BILLING_MANAGER / SYSTEM_ADMIN**: `last4` = `"4242"` (decrypted)
- **MEMBERSHIP_MANAGER**: `last4` = `null` (masked)
- Soft-deleted payments return 404.

### DELETE /api/membership/payments/:paymentId — Soft-delete payment
Roles: BILLING_MANAGER, MEMBERSHIP_MANAGER, SYSTEM_ADMIN

Soft-deletes the payment and anchors the 7-year billing retention clock:
`deletedAt = now`, `retentionExpiresAt = deletedAt + 7 years`. The record stops
appearing in read endpoints and becomes eligible for hard-purge by
`POST /api/admin/retention/purge-billing` once `retentionExpiresAt < now`.

**200 Success:**
```json
{
  "success": true,
  "data": {
    "id": "pay-cuid",
    "deletedAt": "2026-04-18T12:00:00.000Z",
    "retentionExpiresAt": "2033-04-18T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

## 14. CMS Publishing (Prompt 6)

### POST /api/cms/articles — Create article (DRAFT)
Any authenticated user.

**Request:**
```json
{
  "title": "Spring 2026 Warehouse Update",
  "slug": "spring-2026-warehouse-update",
  "body": "Full article content here...",
  "tagIds": ["tag-cuid-1"],
  "categoryIds": ["cat-cuid-1"]
}
```

**201 Success:**
```json
{
  "success": true,
  "data": {
    "id": "article-cuid",
    "title": "Spring 2026 Warehouse Update",
    "slug": "spring-2026-warehouse-update",
    "state": "DRAFT",
    "authorId": "user-cuid",
    "publishedAt": null,
    "scheduledPublishAt": null
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### POST /api/cms/articles/:articleId/submit-review — Submit for review
Any authenticated user. Transitions DRAFT → IN_REVIEW.

**200 Success:**
```json
{
  "success": true,
  "data": { "id": "article-cuid", "state": "IN_REVIEW" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### POST /api/cms/articles/:articleId/approve — Approve
Roles: CMS_REVIEWER, SYSTEM_ADMIN. Transitions IN_REVIEW → APPROVED.

### POST /api/cms/articles/:articleId/schedule — Schedule publish
Roles: CMS_REVIEWER, SYSTEM_ADMIN. Transitions APPROVED → SCHEDULED.

**Request:**
```json
{ "scheduledPublishAt": "2026-05-01T09:00:00.000Z" }
```

**200 Success:**
```json
{
  "success": true,
  "data": { "id": "article-cuid", "state": "SCHEDULED", "scheduledPublishAt": "2026-05-01T09:00:00.000Z" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**422 INVALID_TRANSITION (wrong state):**
```json
{
  "success": false,
  "error": { "code": "INVALID_TRANSITION", "message": "Cannot transition article from DRAFT to SCHEDULED" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### POST /api/cms/tags/merge — Merge tags (creates tombstone)
Roles: CMS_REVIEWER, SYSTEM_ADMIN.

**Request:**
```json
{ "sourceTagId": "tag-old-cuid", "targetTagId": "tag-canonical-cuid" }
```

**200 Success:**
```json
{
  "success": true,
  "data": {
    "id": "tag-old-cuid",
    "name": "old-tag-name",
    "isTombstone": true,
    "canonicalTagId": "tag-canonical-cuid"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**409 CONFLICT (self-merge):**
```json
{
  "success": false,
  "error": { "code": "CONFLICT", "message": "Cannot merge tag into itself" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### GET /api/cms/tags/trending?windowDays=7&limit=10
Any authenticated user.

`windowDays` is fixed to `7` by contract. Any non-7 value is rejected with `400 VALIDATION_FAILED`.

**200 Success:**
```json
{
  "success": true,
  "data": [
    { "tagId": "tag-cuid-1", "name": "sustainability", "count": 47 },
    { "tagId": "tag-cuid-2", "name": "green-tech", "count": 31 }
  ],
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

## 15. Admin & Operational Compliance (Prompt 7)

All admin routes require `SYSTEM_ADMIN` role and enforce the `admin` IP allowlist group.

---

### GET /api/admin/diagnostics
Returns a structured health and operational snapshot. No network calls.

**200 Success:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-04-17T12:00:00.000Z",
    "uptimeSeconds": 3600,
    "memory": {
      "rssBytes": 52428800,
      "heapUsedBytes": 28311552,
      "heapTotalBytes": 33554432,
      "externalBytes": 1048576
    },
    "database": {
      "users": 5, "activeSessions": 2, "articles": 12, "members": 8,
      "payments": 24, "auditEvents": 450, "backupSnapshots": 3,
      "parameters": 7, "activeIpAllowlistEntries": 2,
      "outboundOrders": 15, "appointments": 40
    },
    "encryption": {
      "activeKeyVersion": 1,
      "keyExpiresAt": "2026-10-14T00:00:00.000Z",
      "rotationOverdue": false
    },
    "performance": {
      "note": "Query design targets p95 < 200ms at 50 concurrent requests on single-node SQLite. This is a design target — not a benchmarked claim.",
      "paginationDefaults": { "pageSize": 20, "maxPageSize": 100 },
      "indexStrategy": ["Appointment(facilityId, state)", "..."]
    }
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### POST /api/admin/backup
Creates an encrypted snapshot of the live SQLite database file. Requires IP allowlist check (routeGroup `admin`).

**201 Success:**
```json
{
  "success": true,
  "data": {
    "id": "snap-cuid-1",
    "filename": "greencycle-backup-2026-04-17T12-00-00-000Z.db.enc",
    "path": "/app/backups/greencycle-backup-2026-04-17T12-00-00-000Z.db.enc",
    "sizeBytes": 4194320,
    "encryptionKeyVersion": 1,
    "checksum": "sha256hex...",
    "status": "COMPLETED",
    "createdBy": "user-cuid-1",
    "createdAt": "2026-04-17T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**500 INTERNAL_ERROR** (database file unreadable):
```json
{
  "success": false,
  "error": { "code": "INTERNAL_ERROR", "message": "Cannot read database file: ENOENT: no such file or directory" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### POST /api/admin/backup/:snapshotId/restore
Decrypts a backup to a staging path. Body: `{ "confirm": true }`.

**200 Success:**
```json
{
  "success": true,
  "data": {
    "snapshotId": "snap-cuid-1",
    "stagingPath": "/app/database/greencycle.db.restore",
    "instructions": "Backup decrypted to staging path. Stop the service, move the staging file to replace the active database file, then restart the service."
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**400 VALIDATION_FAILED** (missing confirm):
```json
{
  "success": false,
  "error": { "code": "VALIDATION_FAILED", "message": "body must have required property 'confirm'" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**400 VALIDATION_FAILED** (checksum mismatch):
```json
{
  "success": false,
  "error": { "code": "VALIDATION_FAILED", "message": "Backup checksum verification failed — file may be corrupted or tampered" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### GET /api/admin/retention/report
Returns counts of records eligible for purge in each domain.

**200 Success:**
```json
{
  "success": true,
  "data": {
    "reportedAt": "2026-04-17T12:00:00.000Z",
    "billing": {
      "eligibleForPurge": 3,
      "retentionYears": 7,
      "policy": "Hard delete soft-deleted PaymentRecord rows whose retentionExpiresAt is in the past (deletedAt + 7y anchor)"
    },
    "operational": {
      "cutoffDate": "2024-04-17T12:00:00.000Z",
      "retentionYears": 2,
      "auditEventsEligible": 1205,
      "operationHistoryEligible": 87,
      "policy": "Hard delete AuditEvent and AppointmentOperationHistory rows older than 2 years"
    }
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### POST /api/admin/retention/purge-billing
Hard-deletes soft-deleted `PaymentRecord` rows whose `retentionExpiresAt` is in the past.
The 7-year retention clock is anchored at soft-delete time (see `DELETE /api/membership/payments/:id`); active records (no `deletedAt`) are never eligible.
Body: `{ "confirm": true }` — enforced both at the schema layer and at the service layer; omitting or setting `confirm: false` returns `VALIDATION_FAILED` and writes no data.

**200 Success:**
```json
{
  "success": true,
  "data": { "domain": "billing", "purgedCount": 3, "purgedAt": "2026-04-17T12:00:00.000Z" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### POST /api/admin/retention/purge-operational
Hard-deletes `AuditEvent` and `AppointmentOperationHistory` rows older than 2 years.
Body: `{ "confirm": true }` — enforced at both schema and service layers.

**200 Success:**
```json
{
  "success": true,
  "data": {
    "domain": "operational",
    "cutoffDate": "2024-04-17T12:00:00.000Z",
    "auditEventsPurged": 1205,
    "operationHistoryPurged": 87,
    "purgedAt": "2026-04-17T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### POST /api/admin/parameters — Create parameter

**201 Success:**
```json
{
  "success": true,
  "data": {
    "id": "param-cuid-1",
    "key": "cms.featured.limit",
    "value": "12",
    "description": "Featured article cap for CMS homepage",
    "updatedBy": "user-cuid-1",
    "createdAt": "2026-04-17T12:00:00.000Z",
    "updatedAt": "2026-04-17T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**400 VALIDATION_FAILED** (invalid key format):
```json
{
  "success": false,
  "error": { "code": "VALIDATION_FAILED", "message": "body/key must match pattern \"^[a-zA-Z0-9._:-]+$\"" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**409 CONFLICT** (key already exists):
```json
{
  "success": false,
  "error": { "code": "CONFLICT", "message": "Parameter 'cms.featured.limit' already exists" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### POST /api/admin/ip-allowlist — Create IP allowlist entry

**201 Success:**
```json
{
  "success": true,
  "data": {
    "id": "entry-cuid-1",
    "cidr": "192.168.1.0/24",
    "routeGroup": "admin",
    "description": "Office LAN",
    "isActive": true,
    "createdAt": "2026-04-17T12:00:00.000Z",
    "updatedAt": "2026-04-17T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**400 VALIDATION_FAILED** (invalid routeGroup):
```json
{
  "success": false,
  "error": { "code": "VALIDATION_FAILED", "message": "body/routeGroup must be equal to one of the allowed values" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

---

### POST /api/admin/key-versions/rotate — Trigger key rotation

Body: `{ "keyHash": "sha256-of-new-key-for-operator-verification" }`

**201 Success (initial version):**
```json
{
  "success": true,
  "data": {
    "id": "kv-cuid-1",
    "version": 1,
    "status": "ACTIVE",
    "algorithm": "aes-256-gcm",
    "keyHash": "sha256...",
    "createdAt": "2026-04-17T12:00:00.000Z",
    "expiresAt": "2026-10-14T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**201 Success (rotation from v1 → v2):**
```json
{
  "success": true,
  "data": {
    "id": "kv-cuid-2",
    "version": 2,
    "status": "ACTIVE",
    "algorithm": "aes-256-gcm",
    "keyHash": "new-sha256...",
    "createdAt": "2026-04-17T12:00:00.000Z",
    "expiresAt": "2026-10-14T12:00:00.000Z"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```
