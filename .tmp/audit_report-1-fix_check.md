# GreenCycle Warehouse & Content Operations API

## Fix Check for audit_report-1.md (Independent Re-Verification)

Date: 2026-04-17  
Method: Static source inspection only (no Docker, no app run, no test run)  
Scope: Re-check of issues listed in .tmp/audit_report-1.md against current code

---

## Verdict

All originally reported actionable defects are now fixed in the current codebase.

Status summary:

- Fixed: H-1, M-1, M-2, L-1, L-2, L-3, L-4

---

## Issue-by-Issue Results

### H-1: Admin depth test shared DB state pollution

Status: FIXED

Evidence:

- repo/backend/api_tests/admin.depth.test.ts#L24 includes afterEach cleanup.
- repo/backend/api_tests/admin.depth.test.ts#L25 deletes IpAllowlistEntry rows:
  - await app.prisma.ipAllowlistEntry.deleteMany({});

Conclusion:

- Cross-test state leakage from allowlist entries is remediated.

---

### M-1: Auth-before-validation gap on outbound/strategy routes

Status: FIXED

Evidence:

- Outbound routes include explicit auth + role prehandlers (examples):
  - repo/backend/src/routes/outbound.routes.ts#L56
  - repo/backend/src/routes/outbound.routes.ts#L66
- Strategy routes include explicit auth + role prehandlers (examples):
  - repo/backend/src/routes/strategy.routes.ts#L51
  - repo/backend/src/routes/strategy.routes.ts#L61
- Ordering is test-covered for outbound and strategy:
  - repo/backend/api_tests/validation-envelope.test.ts#L87
  - repo/backend/api_tests/validation-envelope.test.ts#L101

Conclusion:

- The schema-leak ordering issue is resolved in both implementation and tests.

---

### M-2: Missing pino-pretty dependency

Status: FIXED

Evidence:

- repo/backend/package.json#L29 contains:
  - "pino-pretty": "^13.0.0"

Conclusion:

- Development startup dependency is present.

---

### L-1: IP allowlist open-by-default posture

Status: FIXED

Evidence:

- Config now defaults strict mode to fail-closed unless explicitly disabled:
  - repo/backend/src/config.ts#L43
- Security plugin applies fail-closed default when evaluating allowlists:
  - repo/backend/src/plugins/security.plugin.ts#L147
- Allowlist helper supports explicit failClosed behavior and documents strict default:
  - repo/backend/src/security/ipallowlist.ts#L59
  - repo/backend/src/security/ipallowlist.ts#L75
- README now documents strict-mode default and opt-out behavior:
  - repo/README.md#L258
  - repo/README.md#L270

Conclusion:

- Fresh deployments now default to fail-closed behavior for privileged route groups with empty active allowlists, addressing the original low-severity posture concern.

---

### L-2: README stale internal audit reference

Status: FIXED

Evidence:

- No references to .tmp/audit_report-1.md remain in README.

Conclusion:

- Internal workflow artifact leak in README is removed.

---

### L-3: O(n) member number uniqueness scan

Status: FIXED

Evidence:

- Membership service now uses deterministic hash lookup for uniqueness:
  - repo/backend/src/services/membership.service.ts#L80
  - repo/backend/src/services/membership.service.ts#L81
- Hash is persisted with the member record:
  - repo/backend/src/services/membership.service.ts#L92

Conclusion:

- Uniqueness check is no longer implemented as decrypt-and-scan of all rows.

---

### L-4: Simplistic string-prefix simulation distance heuristic

Status: FIXED

Evidence:

- Dedicated structural proxy function added:
  - repo/backend/src/services/strategy.service.ts#L279
- Simulation now calls estimatePickStepDistance rather than substring-prefix comparison:
  - repo/backend/src/services/strategy.service.ts#L333

Conclusion:

- Previous string-prefix heuristic has been replaced with a structured location-field proxy.

---

## Final Assessment

The codebase now reflects remediation of all issues identified in .tmp/audit_report-1.md based on static source inspection.

Note:

- There is a minor stale inline comment in config typing that says strict mode default is false, while runtime/default docs now enforce true. This does not change behavior but may be worth cleanup for consistency.
