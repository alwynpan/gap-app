# Integration Tests

Comprehensive integration tests for the G.A.P. backend API. Tests use [Testcontainers](https://testcontainers.com/) to
spin up a real PostgreSQL container so they never touch the local dev database and can run cleanly in CI/CD.

## Running

```bash
# From the backend directory
npm run test:integration              # Run all integration tests
npm run test:integration:coverage     # Run with coverage report
```

> **Note:** Requires Docker to be running. The first run pulls `postgres:16-alpine` (~75 MB).

## Architecture

```
backend/
├── jest.integration.config.js              # Separate Jest config (no mocks, maxWorkers=1)
└── tests/integration/
    ├── setup/
    │   ├── globalSetup.js                  # Start PG container, run migrations, seed admin
    │   ├── globalTeardown.js               # Stop PG container, remove temp config file
    │   └── setupEnv.js                     # Set process.env from container config (runs before modules load)
    ├── helpers/
    │   ├── server.js                       # buildTestServer() / closeTestServer() helpers
    │   └── db.js                           # cleanDatabase(), createUser(), createGroup(), loginAs(), getPool()
    ├── auth.test.js
    ├── users.test.js
    ├── groups.test.js
    └── config.test.js
```

### Key design decisions

- **One container per Jest run** — started in `globalSetup`, shared across all 4 test files, stopped in
  `globalTeardown`. Faster than per-file containers.
- **Test isolation** — each `beforeEach` calls `cleanDatabase()` which truncates `users` (except admin), `groups`,
  `config`, and `password_reset_tokens`. Roles and the admin user are preserved.
- **No `.env` changes needed** — `setupEnv.js` sets `DB_*` env vars from the container's connection info before any
  modules load.
- **`NODE_ENV=development`** — required so the server's `isDev=true` branch applies, giving relaxed rate limits (5 000
  req/min) suitable for integration tests.

---

## Test Coverage

### `auth.test.js` — 22 tests

| Endpoint                         | Scenario                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/auth/login`           | ✅ Valid admin credentials → 200 + token                                     |
|                                  | ✅ Wrong password → 401                                                      |
|                                  | ✅ Unknown username → 401                                                    |
|                                  | ✅ Missing username field → 400                                              |
|                                  | ✅ Disabled user → 401                                                       |
|                                  | ✅ Pending user (no password set) → 401                                      |
| `POST /api/auth/register`        | ✅ Creates pending user when registration enabled → 201                      |
|                                  | ✅ Duplicate username → 409                                                  |
|                                  | ✅ Duplicate email → 409                                                     |
|                                  | ✅ Attempt to register as admin → 403                                        |
|                                  | ✅ Missing required fields → 400                                             |
| `POST /api/auth/logout`          | ✅ Always 200 (stateless JWT)                                                |
| `GET /api/auth/me`               | ✅ Valid token → 200, user in response                                       |
|                                  | ✅ No token → 401                                                            |
|                                  | ✅ Invalid token → 401                                                       |
|                                  | ✅ `password_hash` not exposed                                               |
| `GET /api/auth/config`           | ✅ Returns `registrationEnabled` flag                                        |
| `POST /api/auth/forgot-password` | ✅ Unknown email → 200 (no enumeration)                                      |
|                                  | ✅ Known email → 200 (creates token)                                         |
|                                  | ✅ Invalid email format → 400                                                |
| `POST /api/auth/set-password`    | ✅ Invalid token → 400                                                       |
|                                  | ✅ Missing fields → 400                                                      |
|                                  | ✅ End-to-end: register → create setup token → set-password → login succeeds |

---

### `users.test.js` — 53 tests

| Endpoint                      | Scenario                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| `GET /api/users`              | ✅ Admin can list users                                              |
|                               | ✅ Assignment manager can list users                                 |
|                               | ✅ Regular user → 403                                                |
|                               | ✅ No token → 401                                                    |
|                               | ✅ Filter by `role=admin`                                            |
|                               | ✅ Invalid role filter → 400                                         |
|                               | ✅ Filter by `status=active`                                         |
|                               | ✅ Invalid status filter → 400                                       |
|                               | ✅ Combined filters (`role=user&status=active`)                      |
| `GET /api/users/:id`          | ✅ Admin gets any user                                               |
|                               | ✅ User gets own profile                                             |
|                               | ✅ User cannot get another user → 403                                |
|                               | ✅ Non-existent user → 404                                           |
|                               | ✅ Invalid UUID → 400                                                |
|                               | ✅ `password_hash` not exposed                                       |
| `POST /api/users`             | ✅ Admin creates user (pending status)                               |
|                               | ✅ Admin creates assignment_manager                                  |
|                               | ✅ Assignment manager cannot create admin → 403                      |
|                               | ✅ Regular user cannot create users → 403                            |
|                               | ✅ Duplicate username → 409                                          |
|                               | ✅ Duplicate email → 409                                             |
|                               | ✅ Non-existent group → 404                                          |
|                               | ✅ Group at capacity → 400                                           |
| `PUT /api/users/:id`          | ✅ Admin updates email                                               |
|                               | ✅ Admin disables user                                               |
|                               | ✅ Cannot disable built-in admin → 400                               |
|                               | ✅ Assignment manager cannot edit admin → 403                        |
|                               | ✅ Username change prevented → 400                                   |
| `PUT /api/users/:id/group`    | ✅ Admin assigns user to group                                       |
|                               | ✅ Admin removes user from group (null)                              |
|                               | ✅ Missing groupId in body → 400                                     |
|                               | ✅ Regular user → 403                                                |
| `PUT /api/users/:id/password` | ✅ User changes own password                                         |
|                               | ✅ Wrong current password → 401                                      |
|                               | ✅ New password too short → 400                                      |
|                               | ✅ Cannot change another user's password → 403                       |
| `DELETE /api/users/:id`       | ✅ Admin deletes user                                                |
|                               | ✅ Non-existent user → 404                                           |
|                               | ✅ Cannot delete own account → 400                                   |
|                               | ✅ Regular user → 403                                                |
| `DELETE /api/users/bulk`      | ✅ Admin bulk deletes                                                |
|                               | ✅ Empty ids → 400                                                   |
|                               | ✅ Invalid UUIDs → 400                                               |
|                               | ✅ Own ID in list → 400                                              |
| `POST /api/users/import`      | ✅ Admin imports new users                                           |
|                               | ✅ Skip existing (conflictAction=skip)                               |
|                               | ✅ Overwrite existing (conflictAction=overwrite)                     |
|                               | ✅ Cannot overwrite admin account                                    |
|                               | ✅ Assignment manager can import users                               |
|                               | ✅ AM importing with overwrite skips admin/AM accounts → error entry |
|                               | ✅ Empty users array → 400                                           |
|                               | ✅ Regular user → 403                                                |

---

### `groups.test.js` — 46 tests

| Endpoint                           | Scenario                                    |
| ---------------------------------- | ------------------------------------------- |
| `GET /api/groups`                  | ✅ Authenticated user can list groups       |
|                                    | ✅ No token → 401                           |
| `GET /api/groups/enabled`          | ✅ Returns only enabled groups              |
| `GET /api/groups/:id`              | ✅ Returns group with member list           |
|                                    | ✅ Non-existent → 404                       |
|                                    | ✅ Invalid UUID → 400                       |
| `POST /api/groups`                 | ✅ Admin creates group                      |
|                                    | ✅ Admin creates group with maxMembers      |
|                                    | ✅ Admin creates disabled group             |
|                                    | ✅ Duplicate name → 409                     |
|                                    | ✅ Assignment manager → 403                 |
|                                    | ✅ Missing name → 400                       |
| `POST /api/groups/bulk`            | ✅ Admin bulk creates groups                |
|                                    | ✅ Empty array → 400                        |
|                                    | ✅ Duplicate names within batch → 400       |
|                                    | ✅ Name conflicts with existing group → 409 |
|                                    | ✅ Regular user → 403                       |
| `PUT /api/groups/:id`              | ✅ Admin updates group name                 |
|                                    | ✅ Admin disables group                     |
|                                    | ✅ maxMembers below current count → 400     |
|                                    | ✅ Non-existent → 404                       |
|                                    | ✅ Assignment manager → 403                 |
| `DELETE /api/groups/:id`           | ✅ Admin deletes group                      |
|                                    | ✅ Non-existent → 404                       |
|                                    | ✅ Regular user → 403                       |
| `DELETE /api/groups/bulk`          | ✅ Admin bulk deletes groups                |
|                                    | ✅ Empty ids → 400                          |
|                                    | ✅ Invalid UUIDs → 400                      |
| `POST /api/groups/:id/join`        | ✅ User joins enabled group                 |
|                                    | ✅ Disabled group → 400                     |
|                                    | ✅ Already in a group → 400                 |
|                                    | ✅ Group at capacity → 409                  |
|                                    | ✅ Non-existent group → 404                 |
|                                    | ✅ No token → 401                           |
| `POST /api/groups/:id/leave`       | ✅ User leaves group                        |
|                                    | ✅ Not a member → 400                       |
| `POST /api/groups/import-mappings` | ✅ Admin imports user-group mappings        |
|                                    | ✅ User not found → skipped                 |
|                                    | ✅ Group not found → skipped                |
|                                    | ✅ Admin user in mapping → skipped          |
|                                    | ✅ Empty rows → 400                         |
|                                    | ✅ Regular user → 403                       |
| `GET /api/groups/export-mappings`  | ✅ Admin exports mappings                   |
|                                    | ✅ Assignment manager can export            |
|                                    | ✅ Empty mappings → `{ mappings: [] }`      |
|                                    | ✅ Regular user → 403                       |

---

### `config.test.js` — 18 tests

| Endpoint                            | Scenario                                               |
| ----------------------------------- | ------------------------------------------------------ |
| `GET /api/config/group-join-locked` | ✅ Authenticated user reads lock status                |
|                                     | ✅ Defaults to `false` when no config row exists       |
|                                     | ✅ No token → 401                                      |
| `GET /api/config`                   | ✅ Admin can read all config                           |
|                                     | ✅ Assignment manager can read all config              |
|                                     | ✅ Regular user → 403                                  |
|                                     | ✅ No token → 401                                      |
| `PUT /api/config/:key`              | ✅ Admin sets group_join_locked=true                   |
|                                     | ✅ Admin sets group_join_locked=false                  |
|                                     | ✅ Config change reflected in GET immediately          |
|                                     | ✅ Unknown key → 400                                   |
|                                     | ✅ Missing value → 400                                 |
|                                     | ✅ Assignment manager can update config                |
|                                     | ✅ Regular user → 403                                  |
|                                     | ✅ No token → 401                                      |
| `group_join_locked` enforcement     | ✅ Regular user blocked from joining when locked → 403 |
|                                     | ✅ Assignment manager bypasses lock when joining → 200 |
|                                     | ✅ Admin bypasses lock when joining → 200              |

---

## Updating This Document

**Whenever integration tests are added, removed, or modified**, update this document in the same PR/commit:

1. Add/remove rows from the relevant table.
2. Update the test count in the section heading.
3. Update the total in the [Running](#running) section if the overall count changes.

The per-section test counts (22 / 53 / 46 / 18 = **139 total**) must always match
`jest --config jest.integration.config.js` output.
