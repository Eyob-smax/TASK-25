# Test Coverage Audit

## Scope and Method (Static-Only)

- Inspection mode: static only (no test execution, no scripts, no containers run).
- Audited files: route definitions in `repo/backend/src/app.ts` and `repo/backend/src/routes/*.ts`, API tests in `repo/backend/api_tests/*.ts`, unit tests in `repo/backend/unit_tests/**`, test runner `repo/run_tests.sh`, and `repo/README.md`.
- Endpoint definition rule used: unique `METHOD + fully resolved PATH` including route prefixes from `buildApp` registration (`repo/backend/src/app.ts:133-139`).

## Project Type Detection

- README declares canonical `Project Type: backend` (`repo/README.md:5`).
- Light structural inference confirms backend-only repository (only `backend/` application directory present; no frontend app directory).
- Effective inferred type for test analysis: **backend** (declared + confirmed).

## Backend Endpoint Inventory

Source of truth:

- Health route: `repo/backend/src/app.ts` (`app.get('/health', ...)`).
- Domain route prefixes: `repo/backend/src/app.ts:133-139`.
- Domain route handlers: `repo/backend/src/routes/*.ts`.

Total endpoints discovered: **111**

### Auth (`/api/auth`)

1. POST /api/auth/login
2. POST /api/auth/logout
3. POST /api/auth/rotate-password
4. GET /api/auth/me
5. POST /api/auth/users
6. PUT /api/auth/users/:userId/roles

### Warehouse (`/api/warehouse`)

1. GET /api/warehouse/facilities
2. POST /api/warehouse/facilities
3. GET /api/warehouse/facilities/:facilityId
4. PATCH /api/warehouse/facilities/:facilityId
5. DELETE /api/warehouse/facilities/:facilityId
6. GET /api/warehouse/facilities/:facilityId/zones
7. POST /api/warehouse/facilities/:facilityId/zones
8. GET /api/warehouse/facilities/:facilityId/zones/:zoneId
9. GET /api/warehouse/locations
10. POST /api/warehouse/locations
11. GET /api/warehouse/locations/:locationId
12. PATCH /api/warehouse/locations/:locationId
13. GET /api/warehouse/skus
14. POST /api/warehouse/skus
15. GET /api/warehouse/skus/:skuId
16. PATCH /api/warehouse/skus/:skuId
17. GET /api/warehouse/inventory-lots
18. POST /api/warehouse/inventory-lots
19. GET /api/warehouse/inventory-lots/:lotId
20. PATCH /api/warehouse/inventory-lots/:lotId
21. GET /api/warehouse/appointments
22. POST /api/warehouse/appointments
23. GET /api/warehouse/appointments/:appointmentId
24. POST /api/warehouse/appointments/:appointmentId/confirm
25. POST /api/warehouse/appointments/:appointmentId/cancel
26. POST /api/warehouse/appointments/:appointmentId/reschedule

### Outbound (`/api/outbound`)

1. GET /api/outbound/orders
2. POST /api/outbound/orders
3. GET /api/outbound/orders/:orderId
4. PATCH /api/outbound/orders/:orderId/approve-partial
5. POST /api/outbound/orders/:orderId/exceptions
6. POST /api/outbound/orders/:orderId/pack-verify
7. POST /api/outbound/orders/:orderId/handoff
8. GET /api/outbound/waves
9. POST /api/outbound/waves
10. GET /api/outbound/waves/:waveId
11. PATCH /api/outbound/waves/:waveId/cancel
12. GET /api/outbound/pick-tasks/:taskId
13. PATCH /api/outbound/pick-tasks/:taskId

### Strategy (`/api/strategy`)

1. GET /api/strategy/rulesets
2. POST /api/strategy/rulesets
3. GET /api/strategy/rulesets/:rulesetId
4. PATCH /api/strategy/rulesets/:rulesetId
5. POST /api/strategy/putaway-rank
6. POST /api/strategy/pick-path
7. POST /api/strategy/simulate

### Membership (`/api/membership`)

1. GET /api/membership/members
2. POST /api/membership/members
3. GET /api/membership/members/:memberId
4. PATCH /api/membership/members/:memberId
5. DELETE /api/membership/members/:memberId
6. GET /api/membership/members/:memberId/enrollments
7. POST /api/membership/members/:memberId/enrollments
8. GET /api/membership/packages
9. POST /api/membership/packages
10. GET /api/membership/packages/:packageId
11. PATCH /api/membership/packages/:packageId
12. GET /api/membership/payments
13. POST /api/membership/payments
14. GET /api/membership/payments/:paymentId
15. PATCH /api/membership/payments/:paymentId/status
16. DELETE /api/membership/payments/:paymentId

### CMS (`/api/cms`)

1. GET /api/cms/articles
2. POST /api/cms/articles
3. GET /api/cms/articles/:articleId
4. PATCH /api/cms/articles/:articleId
5. POST /api/cms/articles/:articleId/submit-review
6. POST /api/cms/articles/:articleId/approve
7. POST /api/cms/articles/:articleId/reject
8. POST /api/cms/articles/:articleId/publish
9. POST /api/cms/articles/:articleId/schedule
10. POST /api/cms/articles/:articleId/withdraw
11. POST /api/cms/articles/:articleId/interactions
12. GET /api/cms/categories
13. POST /api/cms/categories
14. GET /api/cms/categories/:categoryId
15. PATCH /api/cms/categories/:categoryId
16. GET /api/cms/tags
17. POST /api/cms/tags
18. GET /api/cms/tags/trending
19. GET /api/cms/tags/cloud
20. POST /api/cms/tags/merge
21. POST /api/cms/tags/bulk-migrate
22. GET /api/cms/tags/:tagId
23. POST /api/cms/tags/:tagId/aliases

### Admin (`/api/admin`)

1. GET /api/admin/diagnostics
2. POST /api/admin/backup
3. GET /api/admin/backup
4. GET /api/admin/backup/:snapshotId
5. POST /api/admin/backup/:snapshotId/restore
6. GET /api/admin/retention/report
7. POST /api/admin/retention/purge-billing
8. POST /api/admin/retention/purge-operational
9. GET /api/admin/parameters
10. POST /api/admin/parameters
11. GET /api/admin/parameters/:key
12. PUT /api/admin/parameters/:key
13. DELETE /api/admin/parameters/:key
14. GET /api/admin/ip-allowlist
15. POST /api/admin/ip-allowlist
16. PATCH /api/admin/ip-allowlist/:entryId
17. DELETE /api/admin/ip-allowlist/:entryId
18. GET /api/admin/key-versions
19. POST /api/admin/key-versions/rotate

### Infra

1. GET /health

## API Test Mapping Table

Classification rule used:

- API test is counted covered only when `app.inject({ method, url })` hits the exact endpoint pattern.
- Test type for API suites: `true no-mock HTTP` unless mocks/stubs found in API test execution path.

All endpoints below are covered with `app.inject` and no mocking detected in `repo/backend/api_tests/*.ts`.

| Endpoint                                                   | Covered | Test type         | Test files                                                                                    | Evidence                                                                                                                        |
| ---------------------------------------------------------- | ------- | ----------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| POST /api/auth/login                                       | yes     | true no-mock HTTP | auth.test.ts, auth.depth.test.ts, contract.test.ts                                            | `app.inject` with `/api/auth/login` in `repo/backend/api_tests/auth.test.ts:82`, `repo/backend/api_tests/auth.depth.test.ts:22` |
| POST /api/auth/logout                                      | yes     | true no-mock HTTP | auth.test.ts                                                                                  | `repo/backend/api_tests/auth.test.ts:42`                                                                                        |
| POST /api/auth/rotate-password                             | yes     | true no-mock HTTP | auth.test.ts, auth.depth.test.ts                                                              | `repo/backend/api_tests/auth.test.ts:52`, `repo/backend/api_tests/auth.depth.test.ts:54`                                        |
| GET /api/auth/me                                           | yes     | true no-mock HTTP | auth.test.ts, auth.depth.test.ts, contract.test.ts                                            | `repo/backend/api_tests/auth.test.ts:32`, `repo/backend/api_tests/auth.depth.test.ts:32`                                        |
| POST /api/auth/users                                       | yes     | true no-mock HTTP | auth.test.ts                                                                                  | `repo/backend/api_tests/auth.test.ts:61`                                                                                        |
| PUT /api/auth/users/:userId/roles                          | yes     | true no-mock HTTP | auth.test.ts                                                                                  | `repo/backend/api_tests/auth.test.ts:193`                                                                                       |
| GET /api/warehouse/facilities                              | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts, contract.test.ts                                  | `repo/backend/api_tests/warehouse.test.ts:41`, `repo/backend/api_tests/warehouse.depth.test.ts:423`                             |
| POST /api/warehouse/facilities                             | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts, validation-envelope.test.ts                       | `repo/backend/api_tests/warehouse.test.ts:51`, `repo/backend/api_tests/warehouse.depth.test.ts:21`                              |
| GET /api/warehouse/facilities/:facilityId                  | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:173`                                                                            |
| PATCH /api/warehouse/facilities/:facilityId                | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:182`                                                                            |
| DELETE /api/warehouse/facilities/:facilityId               | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:219`                                                                            |
| GET /api/warehouse/facilities/:facilityId/zones            | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:199`                                                                            |
| POST /api/warehouse/facilities/:facilityId/zones           | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:35`                                                                             |
| GET /api/warehouse/facilities/:facilityId/zones/:zoneId    | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:209`                                                                            |
| GET /api/warehouse/locations                               | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:61`, `repo/backend/api_tests/warehouse.depth.test.ts:433`                             |
| POST /api/warehouse/locations                              | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:145`, `repo/backend/api_tests/warehouse.depth.test.ts:50`                             |
| GET /api/warehouse/locations/:locationId                   | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:243`                                                                            |
| PATCH /api/warehouse/locations/:locationId                 | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:253`                                                                            |
| GET /api/warehouse/skus                                    | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:69`, `repo/backend/api_tests/warehouse.depth.test.ts:443`                             |
| POST /api/warehouse/skus                                   | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:181`, `repo/backend/api_tests/warehouse.depth.test.ts:70`                             |
| GET /api/warehouse/skus/:skuId                             | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:272`                                                                            |
| PATCH /api/warehouse/skus/:skuId                           | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:281`                                                                            |
| GET /api/warehouse/inventory-lots                          | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:77`, `repo/backend/api_tests/warehouse.depth.test.ts:453`                             |
| POST /api/warehouse/inventory-lots                         | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:205`, `repo/backend/api_tests/warehouse.depth.test.ts:87`                             |
| GET /api/warehouse/inventory-lots/:lotId                   | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:308`                                                                            |
| PATCH /api/warehouse/inventory-lots/:lotId                 | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:318`                                                                            |
| GET /api/warehouse/appointments                            | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:85`, `repo/backend/api_tests/warehouse.depth.test.ts:463`                             |
| POST /api/warehouse/appointments                           | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:93`, `repo/backend/api_tests/warehouse.depth.test.ts:140`                             |
| GET /api/warehouse/appointments/:appointmentId             | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:352`                                                                            |
| POST /api/warehouse/appointments/:appointmentId/confirm    | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:360`                                                                            |
| POST /api/warehouse/appointments/:appointmentId/cancel     | yes     | true no-mock HTTP | warehouse.depth.test.ts                                                                       | `repo/backend/api_tests/warehouse.depth.test.ts:383`                                                                            |
| POST /api/warehouse/appointments/:appointmentId/reschedule | yes     | true no-mock HTTP | warehouse.test.ts, warehouse.depth.test.ts                                                    | `repo/backend/api_tests/warehouse.test.ts:336`, `repo/backend/api_tests/warehouse.depth.test.ts:154`                            |
| GET /api/outbound/orders                                   | yes     | true no-mock HTTP | outbound.test.ts, outbound.depth.test.ts                                                      | `repo/backend/api_tests/outbound.test.ts:28`, `repo/backend/api_tests/outbound.depth.test.ts:266`                               |
| POST /api/outbound/orders                                  | yes     | true no-mock HTTP | outbound.test.ts, outbound.depth.test.ts, strategy.depth.test.ts, validation-envelope.test.ts | `repo/backend/api_tests/outbound.test.ts:38`, `repo/backend/api_tests/outbound.depth.test.ts:43`                                |
| GET /api/outbound/orders/:orderId                          | yes     | true no-mock HTTP | outbound.depth.test.ts                                                                        | `repo/backend/api_tests/outbound.depth.test.ts:62`                                                                              |
| PATCH /api/outbound/orders/:orderId/approve-partial        | yes     | true no-mock HTTP | outbound.depth.test.ts                                                                        | `repo/backend/api_tests/outbound.depth.test.ts:191`                                                                             |
| POST /api/outbound/orders/:orderId/exceptions              | yes     | true no-mock HTTP | outbound.test.ts, outbound.depth.test.ts                                                      | `repo/backend/api_tests/outbound.test.ts:167`, `repo/backend/api_tests/outbound.depth.test.ts:227`                              |
| POST /api/outbound/orders/:orderId/pack-verify             | yes     | true no-mock HTTP | outbound.test.ts, outbound.depth.test.ts                                                      | `repo/backend/api_tests/outbound.test.ts:70`, `repo/backend/api_tests/outbound.depth.test.ts:159`                               |
| POST /api/outbound/orders/:orderId/handoff                 | yes     | true no-mock HTTP | outbound.test.ts, outbound.depth.test.ts                                                      | `repo/backend/api_tests/outbound.test.ts:187`, `repo/backend/api_tests/outbound.depth.test.ts:203`                              |
| GET /api/outbound/waves                                    | yes     | true no-mock HTTP | outbound.test.ts, outbound.depth.test.ts                                                      | `repo/backend/api_tests/outbound.test.ts:45`, `repo/backend/api_tests/outbound.depth.test.ts:276`                               |
| POST /api/outbound/waves                                   | yes     | true no-mock HTTP | outbound.test.ts, outbound.depth.test.ts, strategy.depth.test.ts                              | `repo/backend/api_tests/outbound.test.ts:52`, `repo/backend/api_tests/outbound.depth.test.ts:75`                                |
| GET /api/outbound/waves/:waveId                            | yes     | true no-mock HTTP | outbound.depth.test.ts                                                                        | `repo/backend/api_tests/outbound.depth.test.ts:125`                                                                             |
| PATCH /api/outbound/waves/:waveId/cancel                   | yes     | true no-mock HTTP | outbound.depth.test.ts                                                                        | `repo/backend/api_tests/outbound.depth.test.ts:136`                                                                             |
| GET /api/outbound/pick-tasks/:taskId                       | yes     | true no-mock HTTP | outbound.test.ts                                                                              | `repo/backend/api_tests/outbound.test.ts:77`                                                                                    |
| PATCH /api/outbound/pick-tasks/:taskId                     | yes     | true no-mock HTTP | outbound.test.ts                                                                              | `repo/backend/api_tests/outbound.test.ts:61`, `repo/backend/api_tests/outbound.test.ts:227`                                     |
| GET /api/strategy/rulesets                                 | yes     | true no-mock HTTP | strategy.test.ts, strategy.depth.test.ts                                                      | `repo/backend/api_tests/strategy.test.ts:28`, `repo/backend/api_tests/strategy.depth.test.ts:61`                                |
| POST /api/strategy/rulesets                                | yes     | true no-mock HTTP | strategy.test.ts, strategy.depth.test.ts, validation-envelope.test.ts                         | `repo/backend/api_tests/strategy.test.ts:38`, `repo/backend/api_tests/strategy.depth.test.ts:76`                                |
| GET /api/strategy/rulesets/:rulesetId                      | yes     | true no-mock HTTP | strategy.depth.test.ts                                                                        | `repo/backend/api_tests/strategy.depth.test.ts:92`                                                                              |
| PATCH /api/strategy/rulesets/:rulesetId                    | yes     | true no-mock HTTP | strategy.test.ts, strategy.depth.test.ts                                                      | `repo/backend/api_tests/strategy.test.ts:164`, `repo/backend/api_tests/strategy.depth.test.ts:102`                              |
| POST /api/strategy/putaway-rank                            | yes     | true no-mock HTTP | strategy.test.ts, strategy.depth.test.ts                                                      | `repo/backend/api_tests/strategy.test.ts:47`, `repo/backend/api_tests/strategy.depth.test.ts:116`                               |
| POST /api/strategy/pick-path                               | yes     | true no-mock HTTP | strategy.test.ts, strategy.depth.test.ts                                                      | `repo/backend/api_tests/strategy.test.ts:56`, `repo/backend/api_tests/strategy.depth.test.ts:179`                               |
| POST /api/strategy/simulate                                | yes     | true no-mock HTTP | strategy.test.ts, strategy.depth.test.ts                                                      | `repo/backend/api_tests/strategy.test.ts:65`, `repo/backend/api_tests/strategy.depth.test.ts:212`                               |
| GET /api/membership/members                                | yes     | true no-mock HTTP | membership.test.ts, membership.depth.test.ts                                                  | `repo/backend/api_tests/membership.test.ts:28`, `repo/backend/api_tests/membership.depth.test.ts:76`                            |
| POST /api/membership/members                               | yes     | true no-mock HTTP | membership.test.ts, membership.depth.test.ts                                                  | `repo/backend/api_tests/membership.test.ts:38`, `repo/backend/api_tests/membership.depth.test.ts:22`                            |
| GET /api/membership/members/:memberId                      | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:150`                                                                           |
| PATCH /api/membership/members/:memberId                    | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:160`                                                                           |
| DELETE /api/membership/members/:memberId                   | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:199`                                                                           |
| GET /api/membership/members/:memberId/enrollments          | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:188`                                                                           |
| POST /api/membership/members/:memberId/enrollments         | yes     | true no-mock HTTP | membership.test.ts, membership.depth.test.ts                                                  | `repo/backend/api_tests/membership.test.ts:175`, `repo/backend/api_tests/membership.depth.test.ts:177`                          |
| GET /api/membership/packages                               | yes     | true no-mock HTTP | membership.test.ts                                                                            | `repo/backend/api_tests/membership.test.ts:45`                                                                                  |
| POST /api/membership/packages                              | yes     | true no-mock HTTP | membership.test.ts, membership.depth.test.ts                                                  | `repo/backend/api_tests/membership.test.ts:95`, `repo/backend/api_tests/membership.depth.test.ts:42`                            |
| GET /api/membership/packages/:packageId                    | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:220`                                                                           |
| PATCH /api/membership/packages/:packageId                  | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:230`                                                                           |
| GET /api/membership/payments                               | yes     | true no-mock HTTP | membership.test.ts                                                                            | `repo/backend/api_tests/membership.test.ts:59`                                                                                  |
| POST /api/membership/payments                              | yes     | true no-mock HTTP | membership.test.ts, membership.depth.test.ts                                                  | `repo/backend/api_tests/membership.test.ts:52`, `repo/backend/api_tests/membership.depth.test.ts:112`                           |
| GET /api/membership/payments/:paymentId                    | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:127`                                                                           |
| PATCH /api/membership/payments/:paymentId/status           | yes     | true no-mock HTTP | membership.test.ts                                                                            | `repo/backend/api_tests/membership.test.ts:155`                                                                                 |
| DELETE /api/membership/payments/:paymentId                 | yes     | true no-mock HTTP | membership.depth.test.ts                                                                      | `repo/backend/api_tests/membership.depth.test.ts:331`                                                                           |
| GET /api/cms/articles                                      | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:28`, `repo/backend/api_tests/cms.depth.test.ts:425`                                         |
| POST /api/cms/articles                                     | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:38`, `repo/backend/api_tests/cms.depth.test.ts:31`                                          |
| GET /api/cms/articles/:articleId                           | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:196`                                                                                  |
| PATCH /api/cms/articles/:articleId                         | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:121`, `repo/backend/api_tests/cms.depth.test.ts:234`                                  |
| POST /api/cms/articles/:articleId/submit-review            | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:80`                                                                                   |
| POST /api/cms/articles/:articleId/approve                  | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:88`                                                                                   |
| POST /api/cms/articles/:articleId/reject                   | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:258`                                                                                  |
| POST /api/cms/articles/:articleId/publish                  | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:104`, `repo/backend/api_tests/cms.depth.test.ts:283`                                  |
| POST /api/cms/articles/:articleId/schedule                 | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:194`, `repo/backend/api_tests/cms.depth.test.ts:172`                                        |
| POST /api/cms/articles/:articleId/withdraw                 | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:291`                                                                                  |
| POST /api/cms/articles/:articleId/interactions             | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:215`, `repo/backend/api_tests/cms.depth.test.ts:335`                                        |
| GET /api/cms/categories                                    | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:68`, `repo/backend/api_tests/cms.depth.test.ts:435`                                         |
| POST /api/cms/categories                                   | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:124`, `repo/backend/api_tests/cms.depth.test.ts:48`                                         |
| GET /api/cms/categories/:categoryId                        | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:207`                                                                                  |
| PATCH /api/cms/categories/:categoryId                      | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:215`                                                                                  |
| GET /api/cms/tags                                          | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:45`, `repo/backend/api_tests/cms.depth.test.ts:445`                                         |
| POST /api/cms/tags                                         | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:52`, `repo/backend/api_tests/cms.depth.test.ts:62`                                          |
| GET /api/cms/tags/trending                                 | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:352`                                                                                  |
| GET /api/cms/tags/cloud                                    | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:363`                                                                                  |
| POST /api/cms/tags/merge                                   | yes     | true no-mock HTTP | cms.test.ts                                                                                   | `repo/backend/api_tests/cms.test.ts:61`, `repo/backend/api_tests/cms.test.ts:154`                                               |
| POST /api/cms/tags/bulk-migrate                            | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:184`, `repo/backend/api_tests/cms.depth.test.ts:392`                                        |
| GET /api/cms/tags/:tagId                                   | yes     | true no-mock HTTP | cms.depth.test.ts                                                                             | `repo/backend/api_tests/cms.depth.test.ts:226`                                                                                  |
| POST /api/cms/tags/:tagId/aliases                          | yes     | true no-mock HTTP | cms.test.ts, cms.depth.test.ts                                                                | `repo/backend/api_tests/cms.test.ts:174`, `repo/backend/api_tests/cms.depth.test.ts:383`                                        |
| GET /api/admin/diagnostics                                 | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:30`, `repo/backend/api_tests/admin.depth.test.ts:108`                                     |
| POST /api/admin/backup                                     | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:38`, `repo/backend/api_tests/admin.depth.test.ts:35`                                      |
| GET /api/admin/backup                                      | yes     | true no-mock HTTP | admin.test.ts                                                                                 | `repo/backend/api_tests/admin.test.ts:43`                                                                                       |
| GET /api/admin/backup/:snapshotId                          | yes     | true no-mock HTTP | admin.depth.test.ts                                                                           | `repo/backend/api_tests/admin.depth.test.ts:46`                                                                                 |
| POST /api/admin/backup/:snapshotId/restore                 | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:50`, `repo/backend/api_tests/admin.depth.test.ts:58`                                      |
| GET /api/admin/retention/report                            | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:57`, `repo/backend/api_tests/admin.depth.test.ts:265`                                     |
| POST /api/admin/retention/purge-billing                    | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:64`, `repo/backend/api_tests/admin.depth.test.ts:279`                                     |
| POST /api/admin/retention/purge-operational                | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:73`, `repo/backend/api_tests/admin.depth.test.ts:292`                                     |
| GET /api/admin/parameters                                  | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:80`, `repo/backend/api_tests/admin.depth.test.ts:130`                                     |
| POST /api/admin/parameters                                 | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts, validation-envelope.test.ts                               | `repo/backend/api_tests/admin.test.ts:87`, `repo/backend/api_tests/admin.depth.test.ts:157`                                     |
| GET /api/admin/parameters/:key                             | yes     | true no-mock HTTP | admin.depth.test.ts                                                                           | `repo/backend/api_tests/admin.depth.test.ts:166`                                                                                |
| PUT /api/admin/parameters/:key                             | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:163`, `repo/backend/api_tests/admin.depth.test.ts:175`                                    |
| DELETE /api/admin/parameters/:key                          | yes     | true no-mock HTTP | admin.depth.test.ts                                                                           | `repo/backend/api_tests/admin.depth.test.ts:185`                                                                                |
| GET /api/admin/ip-allowlist                                | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:94`, `repo/backend/api_tests/admin.depth.test.ts:233`                                     |
| POST /api/admin/ip-allowlist                               | yes     | true no-mock HTTP | admin.test.ts, admin.depth.test.ts                                                            | `repo/backend/api_tests/admin.test.ts:101`, `repo/backend/api_tests/admin.depth.test.ts:95`                                     |
| PATCH /api/admin/ip-allowlist/:entryId                     | yes     | true no-mock HTTP | admin.depth.test.ts                                                                           | `repo/backend/api_tests/admin.depth.test.ts:220`                                                                                |
| DELETE /api/admin/ip-allowlist/:entryId                    | yes     | true no-mock HTTP | admin.depth.test.ts                                                                           | `repo/backend/api_tests/admin.depth.test.ts:243`                                                                                |
| GET /api/admin/key-versions                                | yes     | true no-mock HTTP | admin.test.ts                                                                                 | `repo/backend/api_tests/admin.test.ts:108`                                                                                      |
| POST /api/admin/key-versions/rotate                        | yes     | true no-mock HTTP | admin.test.ts                                                                                 | `repo/backend/api_tests/admin.test.ts:115`                                                                                      |
| GET /health                                                | yes     | true no-mock HTTP | health.test.ts, contract.test.ts                                                              | `repo/backend/api_tests/health.test.ts:37`, `repo/backend/api_tests/contract.test.ts:31`                                        |

## API Test Classification

### 1) True No-Mock HTTP

- Files: all API tests under `repo/backend/api_tests/*.ts`.
- Evidence:
  - Real app bootstrap with `buildApp(...)` in API suites (example: `repo/backend/api_tests/auth.test.ts:2,23`).
  - Real HTTP layer via `app.inject(...)` throughout API tests.
  - No `vi.mock`, `jest.mock`, `sinon.stub`, `vi.fn` mocking constructs in API tests (static grep across `repo/backend/api_tests/*.ts` returned none).

### 2) HTTP with Mocking

- None detected in API test suite.

### 3) Non-HTTP (unit/integration without HTTP)

- All tests under `repo/backend/unit_tests/**` (direct function/service/repository/security testing, no HTTP request transport).

## Mock Detection Rules: Findings

### API tests

- No explicit mock/stub API test constructs found.

### Unit tests (mocking present, expected for unit scope)

- Mocked Prisma repository operations via `vi.fn().mockResolvedValue(...)`:
  - `repo/backend/unit_tests/repositories/outbound.repository.test.ts:13`
  - `repo/backend/unit_tests/repositories/membership.repository.test.ts:15`
  - `repo/backend/unit_tests/repositories/warehouse.repository.test.ts:14`
  - `repo/backend/unit_tests/repositories/strategy.repository.test.ts:12`
- Mocked scheduler dependencies/loggers via `vi.fn`:
  - `repo/backend/unit_tests/services/appointment.scheduler.test.ts:15`
  - `repo/backend/unit_tests/services/cms.scheduler.test.ts:14`
- Mocked logger object behavior:
  - `repo/backend/unit_tests/logging/logger.test.ts:14`

Interpretation: these are **unit-test-local doubles**, not API transport/path mocks.

## Coverage Summary

- Total endpoints: **111**
- Endpoints with HTTP tests: **111**
- Endpoints with TRUE no-mock HTTP tests: **111**
- HTTP coverage: **100.0%**
- True API coverage: **100.0%**

## Unit Test Analysis

### Backend Unit Tests

- Unit test files found: 41 files in `repo/backend/unit_tests/**`.
- Modules covered (evidence):
  - Services/schedulers: `repo/backend/unit_tests/services/admin.service.test.ts`, `repo/backend/unit_tests/services/membership.service.test.ts`, `repo/backend/unit_tests/services/outbound.service.test.ts`, `repo/backend/unit_tests/services/strategy.service.test.ts`, `repo/backend/unit_tests/services/cms.service.test.ts`, `repo/backend/unit_tests/services/warehouse.service.unit.test.ts`, `repo/backend/unit_tests/services/appointment.scheduler.test.ts`, `repo/backend/unit_tests/services/cms.scheduler.test.ts`
  - Repositories: `repo/backend/unit_tests/repositories/*.test.ts`
  - Auth/security/middleware primitives: `repo/backend/unit_tests/security/*.test.ts`, `repo/backend/unit_tests/plugins/auth.plugin.test.ts`, `repo/backend/unit_tests/plugins/security.plugin.test.ts`
  - Controllers/routes: validated primarily through true no-mock API tests in `repo/backend/api_tests/*.ts`; no direct controller-isolated unit suites detected.
  - Domain logic/invariants: `repo/backend/unit_tests/invariants.test.ts`, `repo/backend/unit_tests/strategy/scoring.test.ts`, `repo/backend/unit_tests/warehouse/*.test.ts`, `repo/backend/unit_tests/membership/*.test.ts`, `repo/backend/unit_tests/cms/*.test.ts`
  - Admin utility rules: `repo/backend/unit_tests/admin/*.test.ts`

Important backend modules not explicitly unit-tested (by direct file-level evidence):

- Route modules (no direct unit tests): `repo/backend/src/routes/*.ts`
- Core app assembly path: `repo/backend/src/app.ts`
- Plugin with direct unit coverage still not evident: `repo/backend/src/plugins/prisma.plugin.ts`

### Frontend Unit Tests (STRICT)

- Frontend codebase presence: **none detected** (repository has backend-only structure).
- Frontend test files: **NONE**
- Frontend frameworks/tools for tests: **NONE**
- Frontend components/modules covered: **NONE**
- Important frontend components/modules not tested: **N/A (no frontend code detected)**

Mandatory verdict:

- Frontend unit tests: **MISSING**
- Critical-gap rule check for `fullstack|web`: **Not triggered**, because inferred project type is backend-only.

### Cross-Layer Observation

- Backend and frontend layers do not both exist in the inspected repository; cross-layer balance check not applicable.

## API Observability Check

- Strengths:
  - Endpoint/method visibility is explicit via `app.inject({ method, url })` in all API suites.
  - Request bodies and headers are usually explicit (examples: auth/outbound/depth suites).
  - Response assertions include status, envelope shape, and domain fields in many tests.
- Weak points:
  - Some baseline tests focus mostly on status/error code for auth/validation failures and provide limited deep payload verification compared with depth suites.

Observability verdict: **adequate/strong overall**, with minor shallow assertions in some baseline tests.

## Test Quality and Sufficiency

- Success paths: present across all domains (notably depth suites).
- Failure/validation/auth/permission cases: present broadly (auth, warehouse, outbound, strategy, membership, cms, admin, validation-envelope).
- Edge cases/integration boundaries: present in idempotency, state transitions, retention, scheduling, encryption and role checks.
- Assertion quality: mostly meaningful, not superficial-only.
- Over-mocking risk in API tests: not observed.
- `run_tests.sh` check:
  - Docker-based workflow: **PASS** (`docker compose build/run`, containerized migrations/tests only in `repo/run_tests.sh`).
  - Local dependency requirement: **not required by test script**.

## End-to-End Expectations

- For backend-only type, FE↔BE end-to-end requirement is not applicable.

## Tests Check

- API test strategy: strong route-level coverage with no-mock HTTP injection.
- Unit strategy: broad across services, repositories, security primitives, plugins, and domain logic; primary remaining isolation gap is route/app assembly and `prisma` plugin paths.

## Test Coverage Score (0-100)

- **95 / 100**

## Score Rationale

- - Full endpoint HTTP coverage (100%).
- - All endpoint coverage appears true no-mock at API layer.
- - Broad negative-path and RBAC coverage in API suites.
- - Direct unit suites now exist for major service modules (admin, membership, outbound, strategy, cms, warehouse).
- - Some baseline API assertions are shallow relative to depth coverage.
- - Route registration/controller wiring and app assembly rely mostly on API coverage instead of isolated unit tests.

## Key Gaps

1. Route modules and app assembly are not covered by direct unit tests (`repo/backend/src/routes/*.ts`, `repo/backend/src/app.ts`).
2. Direct plugin unit test coverage is incomplete for `repo/backend/src/plugins/prisma.plugin.ts`.
3. Some baseline API tests emphasize status-level assertions more than deep payload invariants.

## Confidence and Assumptions

- Confidence: **high** for endpoint inventory and HTTP coverage mapping.
- Assumptions:
  - Static pattern matching of `app.inject` captures endpoint intent accurately.
  - Dynamic URL templates in tests represent corresponding parameterized route coverage.
  - No hidden generated routes outside inspected files.

---

# README Audit

## README Location Check

- Required path `repo/README.md`: **present**.

## Hard Gate Evaluation

### Formatting

- Status: **PASS**
- Evidence: structured markdown with headings/tables/code blocks (`repo/README.md`).

### Startup Instructions (Backend/Fullstack must include `docker-compose up`)

- Status: **PASS**
- Evidence:
  - Explicit legacy command form is present: `docker-compose up --build -d` (`repo/README.md:163`).
  - Modern plugin form is also present: `docker compose up --build -d backend` (`repo/README.md:166`).

### Access Method

- Status: **PASS**
- Evidence: explicit URL/port: `http://0.0.0.0:3000` (`repo/README.md:181`).

### Verification Method

- Status: **PASS**
- Evidence:
  - Explicit executable curl verification flow is provided (`repo/README.md:187-199`).
  - Explicit Postman step-by-step verification flow is provided (`repo/README.md:201-204`).

### Environment Rules (No runtime/manual installs outside Docker)

- Status: **PASS**
- Evidence:
  - Docker-first and host-install prohibition are explicit (`repo/README.md:69-72`, `repo/README.md:76-78`).
  - README does not instruct runtime/manual host package installation; install verbs are used only in prohibition context.

### Demo Credentials (Auth exists => provide username/password + ALL roles)

- Status: **PASS**
- Evidence:
  - Auth is explicit and role model is documented.
  - Full role credential matrix is present with username/password for all seven roles (`repo/README.md:210-218`).

## Engineering Quality

- Tech stack clarity: strong.
- Architecture explanation: strong.
- Testing instructions: strong and Docker-first (`repo/run_tests.sh`, README test section).
- Security/roles explanation: strong conceptual detail.
- Workflows/presentation quality: strong.
- Compliance result: hard gates satisfied.

## High Priority Issues

1. None.

## Medium Priority Issues

1. README remains dense; an operator quick-path section could reduce onboarding time.

## Low Priority Issues

1. Minor duplication between Quick Start and Docker sections can be consolidated.

## Hard Gate Failures

1. None.

## README Verdict

- **PASS**

---

## Final Verdicts

- Test Coverage Audit Verdict: **PASS with improvement recommendations**
- README Audit Verdict: **PASS**
