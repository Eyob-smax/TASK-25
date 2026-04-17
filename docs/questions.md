# Questions — GreenCycle Warehouse & Content Operations API

Blocker-level and implementation-shaping ambiguities. Each entry uses the format:
`The Gap` → `The Interpretation` → `Proposed Implementation`.

---

## 1. Session transport and rotation model

**The Gap**
The prompt requires local username/password login, session issuance, and password rotation, but it does not specify whether sessions should be cookie-backed, header-backed, or fully opaque server sessions.

**The Interpretation**
Use server-managed opaque sessions stored in SQLite with rotation-aware session invalidation and Bearer-token transport via the `Authorization` header.

**Proposed Implementation**
Implement a session table with expiration, revocation, password-version linkage, and audit metadata. Invalidate all active sessions for a user on password rotation unless a narrower policy is later required.

---

## 2. Role catalog and approval boundaries

**The Gap**
The prompt requires authenticated sessions and role-based authorization, reviewer-gated CMS publishing, and manager approval for partial shipments, but it does not define the concrete role catalog.

**The Interpretation**
Use a small explicit role set: `SYSTEM_ADMIN`, `WAREHOUSE_MANAGER`, `WAREHOUSE_OPERATOR`, `STRATEGY_MANAGER`, `MEMBERSHIP_MANAGER`, `CMS_REVIEWER`, and `BILLING_MANAGER`. Allow composite permission mappings so a single principal can hold multiple roles.

**Proposed Implementation**
Model roles and permissions separately. Gate partial-shipment approval to `WAREHOUSE_MANAGER` or `SYSTEM_ADMIN`, and gate CMS review/publish transitions to `CMS_REVIEWER` or `SYSTEM_ADMIN`.

---

## 3. Appointment auto-expire execution cadence

**The Gap**
The prompt requires appointments to auto-expire if not confirmed within 2 hours, but it does not define the scheduler cadence or whether expiration must happen exactly at the boundary.

**The Interpretation**
Use a local scheduler that scans on a short bounded cadence, such as once per minute. Treat eligibility as `created_at + 2 hours <= now` and record the transition when the scheduler processes the appointment.

**Proposed Implementation**
Implement a scheduled background job with idempotent transition guards, a system actor identity, and immutable operation-history recording for each auto-expire action.

---

## 4. Expected pack weight and volume source of truth

**The Gap**
The prompt requires pack-time rejection if weight or volume variance exceeds ±5 percent of expected, but it does not explicitly define how expected totals are calculated for mixed outbound lines.

**The Interpretation**
Calculate expected weight and volume by summing the ordered quantities of each line against the SKU-level unit weight and unit volume captured in the item catalog at packing time, unless a later packaging model is introduced.

**Proposed Implementation**
Persist a calculated expected snapshot on pack-verification creation so the comparison remains auditable even if the SKU master data changes later.

---

## 5. Backorder line lifecycle after shortage conversion

**The Gap**
The prompt requires shortages from stockout, damage, and oversell to become backorder lines and partial shipment to require manager approval, but it does not define the backorder entity lifecycle.

**The Interpretation**
Represent backorders as linked child lines derived from the original outbound order line, with shortage reason, quantity, approval status, and fulfillment status tracked explicitly.

**Proposed Implementation**
Create `OutboundOrderLine` linkage fields for `source_line_id`, `line_type`, `shortage_reason`, and approval metadata. Keep the original line immutable aside from status progression and quantity fulfilled.

---

## 6. Putaway and pick-path scoring formulas

**The Gap**
The prompt names FIFO vs FEFO, ABC velocity weighting, heat level, and path cost, but it does not provide exact formulas or coefficient ranges for the Strategy Center.

**The Interpretation**
Implement a configurable weighted scoring engine with transparent coefficients stored in strategy-rule records. Keep the score breakdown inspectable so ranked outputs and simulation metrics remain explainable.

**Proposed Implementation**
Store rule sets with explicit numeric weights and deterministic tie-breakers. Return per-candidate score components in the Strategy Center response for auditability and tuning.

---

## 7. Simulation evaluation dataset eligibility

**The Gap**
The prompt requires simulation over the last 30 days of completed pick tasks, but it does not define whether cancelled or exception-closed pick tasks count in the historical dataset.

**The Interpretation**
Use only successfully completed pick tasks with sufficient path and timing data for the primary simulation dataset. Exclude cancelled tasks and optionally report exception-closed tasks separately as constraint-violation context.

**Proposed Implementation**
Filter simulation input to `completed_at` within the last 30 days and maintain a secondary metric set for excluded exception cases so results remain explainable.

---

## 8. Sensitive member identifiers and masking policy depth

**The Gap**
The prompt lists member identifiers as sensitive but does not define the exact fields or masking depth.

**The Interpretation**
Treat member numbers, contact information, external identity references, and any stored identifier used to distinguish a member operationally as sensitive by default. Expose minimally necessary masked forms outside privileged manager and admin roles.

**Proposed Implementation**
Define a field-classification map in the domain layer and enforce role-aware serialization rules through a shared response-masking utility.

---

## 9. Encryption key rotation and re-encryption strategy

**The Gap**
The prompt requires locally managed keys rotated every 180 days, but it does not state whether historical ciphertext must be re-encrypted immediately or whether key-versioned reads are acceptable.

**The Interpretation**
Use envelope-style key versioning where records retain the key version used at encryption time. Support gradual rewrap or re-encryption during maintenance flows rather than requiring immediate bulk rewrite on rotation day.

**Proposed Implementation**
Persist key-version metadata alongside encrypted fields, keep active and legacy decrypt capability, and add audit-tracked maintenance commands for re-encryption if needed later.

---

## 10. IP allowlist scope

**The Gap**
The prompt requires IP allowlists but does not define whether they apply to every authenticated request, only privileged routes, or both authenticated and unauthenticated flows.

**The Interpretation**
Apply allowlists most strictly to privileged administrative and restore/export operations, while keeping the middleware capable of broader enforcement by route group if later required. Keep login protected by rate limits regardless.

**Proposed Implementation**
Implement route-group allowlist policies with explicit configuration in code and documentation, rather than one global hardcoded decision.

**Closing note (Prompt 10 audit)**
Current implementation enforces `checkIpAllowlist('admin')` on all `SYSTEM_ADMIN` admin routes (diagnostics, backup/restore, retention, parameter reads/mutations, IP-allowlist CRUD, key-version operations). Allowlist lookup failures are denied with `500 INTERNAL_ERROR` (fail-closed). This now aligns with the tightened security posture in current code and tests.

---

## 11. Backup snapshot path management and restore safety

**The Gap**
The prompt requires encrypted file snapshots to a local filesystem path, but it does not define how permissible backup paths are selected or how restore safety checks should work.

**The Interpretation**
Restrict backup and restore operations to configured base directories under service control. Reject path traversal, arbitrary absolute destinations outside the allowed root, and restores without privileged approval.

**Proposed Implementation**
Add validated configured backup roots, snapshot metadata records, checksum and key-version metadata, and restore authorization guards limited to `SYSTEM_ADMIN`.

---

## 12. Payment record model and invoice numbering format

**The Gap**
The prompt requires `PaymentRecord` and unique invoice numbers but does not define invoice format, payment state taxonomy, or reversal handling.

**The Interpretation**
Use a deterministic local invoice format such as `GC-YYYYMMDD-SEQ`, backed by a unique stored invoice value. Track payment lifecycle states explicitly, including recorded, settled, voided, and refunded/reversed if later needed.

**Proposed Implementation**
Implement invoice generation through a local sequence service scoped to the application, with a state enum and audit-linked mutation history for corrections or reversals.

---

## 13. CMS article interaction event taxonomy

**The Gap**
The prompt requires trending-tag stats from the last 7 days of article interactions recorded locally, but it does not define which interactions count.

**The Interpretation**
Count at least article views and meaningful engagement events generated inside the local API surface. Keep the interaction taxonomy explicit and extensible rather than burying it in ad hoc counters.

**Proposed Implementation**
Create `ArticleInteraction` records with event type, article, timestamp, and optional actor/session linkage. Base trending calculations on configurable per-event weights with sensible defaults documented in `docs/design.md`.

---

## 14. Category hierarchy depth and merge constraints

**The Gap**
The prompt requires multi-level categories and tag merges, but it does not define hierarchy depth limits or invalid merge cases such as self-merge or cycles.

**The Interpretation**
Allow arbitrarily deep category hierarchies at the schema level while enforcing cycle prevention in service logic. For tag merges, reject self-merge and merges into tombstoned or already-merged tags.

**Proposed Implementation**
Use adjacency-list category relationships with cycle detection and implement tag-merge validation plus canonical redirect enforcement in a dedicated taxonomy service.

---

## 15. Health diagnostics boundary for offline operation

**The Gap**
The prompt requires health diagnostics without network dependencies, but it does not specify how deep those diagnostics should go.

**The Interpretation**
Expose process, datastore, scheduler, encryption-key status, backup-path readiness, and queue/backlog diagnostics that can be derived locally without external probes.

**Proposed Implementation**
Implement structured health and readiness endpoints that inspect only local dependencies and internal state, and keep any heavyweight diagnostics behind privileged access if they expose sensitive operational detail.
