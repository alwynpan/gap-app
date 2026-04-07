# End-to-End Testing

## Overview

The `tests/` directory contains Playwright end-to-end tests for the G.A.P. Portal. Tests run against a real backend
(Fastify) and a real PostgreSQL database spun up by Testcontainers, with the frontend served by Vite preview. No mocks,
no stubs.

## Stack

| Layer            | Technology                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| Test runner      | [@playwright/test](https://playwright.dev/)                              |
| Database         | PostgreSQL via [@testcontainers/postgresql](https://testcontainers.com/) |
| Frontend serving | `vite preview` (static build)                                            |
| Browser          | Chromium (headless)                                                      |

## Running Tests

```bash
# From repo root (requires: npm run install:all && cd tests && npm install)
npm run test:e2e          # headless
npm run test:e2e:headed   # headed (non-headless) mode
npm run test:e2e:report   # open last Playwright HTML report
npm run test:e2e:allure   # run tests → generate → open Allure report

# From the tests/ directory directly
npx playwright test
npx playwright test auth.spec.js     # single file
npx playwright test --debug          # debug mode with Playwright Inspector

# Allure (separate steps)
npx allure generate -o allure-report
npx allure open allure-report
```

## How It Works

### Global Setup (`tests/global-setup.js`)

Before any test runs, global setup:

1. **Starts a PostgreSQL Testcontainer** — an isolated, ephemeral Postgres database (no local Postgres required)
2. **Runs schema + migrations** — identical to production, reading from `backend/src/db/schema.js` and
   `backend/src/db/migrations/`
3. **Seeds the admin user** — with a known test password (`AdminPass123!`)
4. **Starts the Fastify backend** on port `3099` using the test database
5. **Builds the frontend** with `VITE_API_URL=http://localhost:3099/api`
6. **Serves the frontend** with `vite preview` on port `4173`
7. **Writes a state file** to `$TMPDIR/gap-e2e-state.json` so helpers can connect to the test database

### Global Teardown (`tests/global-teardown.js`)

After all tests finish, global teardown stops the vite preview process, closes the Fastify server, and stops the
Testcontainer.

### Workers

Tests run with **`workers: 1`** (sequential) because all tests share one database. Running in parallel would cause
`cleanDatabase()` calls from one test to interfere with another.

## Test Structure

```
tests/
├── playwright.config.js       # Playwright configuration
├── global-setup.js            # Start DB, backend, and frontend
├── global-teardown.js         # Stop all services
├── package.json               # Playwright + Testcontainers dependencies
├── helpers/
│   ├── auth.js                # loginAs(), loginAsAdmin(), logout(), enableGroupJoinLock()
│   └── db.js                  # cleanDatabase(), createUser(), createGroup(), assignUserToGroup(), createPasswordResetToken()
└── e2e/
    ├── auth.spec.js                  # Login, logout, unauthenticated access
    ├── access-control.spec.js        # Role-based route access
    ├── admin.spec.js                 # Admin CRUD: users and groups (incl. error paths)
    ├── assignment-manager.spec.js    # AM capabilities and restrictions
    ├── user.spec.js                  # Regular user: dashboard, group join/leave
    ├── dashboard-advanced.spec.js    # Feeling Lucky, group join lock effect
    ├── forgot-password.spec.js       # ForgotPassword and SetPassword flows
    ├── groups-advanced.spec.js       # Bulk create, enable/disable, limit, import/export CSV
    ├── settings.spec.js              # Group join lock toggle
    ├── users-advanced.spec.js        # Enable/disable users, edit name, delete constraints
    ├── change-password.spec.js       # Change password modal (success and error paths)
    ├── bulk-operations.spec.js       # Bulk delete users/groups, send setup emails
    ├── import-users.spec.js          # Import users via CSV wizard
    └── join-constraints.spec.js      # Group join constraints (full group, already in group, no groups)
```

## Helpers

### `tests/helpers/auth.js`

```js
loginAs(page, username, password); // Navigate to /login, fill form, wait for /dashboard
loginAsAdmin(page); // loginAs('admin', 'AdminPass123!')
logout(page); // Open user menu, click Logout, wait for /login
enableGroupJoinLock(page); // Login as admin, navigate to /settings, enable lock, wait for toggle to confirm
```

### `tests/helpers/db.js`

```js
cleanDatabase()                              // DELETE all groups, non-admin users, config
createUser({ username, email, ... })         // Insert user directly (bypasses email flow)
createGroup({ name, enabled, ... })          // Insert group directly
assignUserToGroup(username, groupId)         // Set group_id on user row
createPasswordResetToken(email, opts)        // Insert hashed reset token; returns raw token for URLs
closePool()                                  // Close the DB connection pool
```

These helpers bypass the UI for setup/teardown, making tests faster and more reliable.

## Conventions

- **`beforeEach` always calls `cleanDatabase()`** — guarantees a clean slate between tests
- **Selector preference** — use `aria-label` CSS selectors (`button[aria-label="Edit Group"]`) over broad `getByRole`
  when rows have `role="button"` that would create false matches
- **`getByText` with `exact: true`** when the text appears in multiple places (e.g. usernames in nav, headers, and table
  cells)
- **`getByRole('heading', { name: '...' })`** for modal titles — tooltip `<span>` elements with `opacity: 0` are still
  visible to Playwright and cause strict mode violations with plain `getByText`
- **`exact: true` on buttons** when the button label appears as a substring of other accessible names (e.g.
  `{ name: 'Join', exact: true }` to avoid matching the username in the header)
- **Logout before switching users** — `PublicRoute` redirects authenticated users from `/login` to `/dashboard`; call
  `logout(page)` before logging in as a different user in the same test

---

## Test Coverage

### `auth.spec.js` — Authentication

Tests the login and logout flows and verifies that unauthenticated users cannot access protected pages.

**Login**

| Test                                              | What it verifies                                    |
| ------------------------------------------------- | --------------------------------------------------- |
| redirects to dashboard on valid admin credentials | Admin can log in and lands on `/dashboard`          |
| redirects to dashboard on valid user credentials  | Regular user can log in and lands on `/dashboard`   |
| shows error on wrong password                     | Login form displays an error for incorrect password |
| shows error on non-existent user                  | Login form displays an error for unknown username   |
| stays on login page after failed attempt          | Failed login does not navigate away from `/login`   |

**Logout**

| Test                                 | What it verifies                                      |
| ------------------------------------ | ----------------------------------------------------- |
| redirects to login page after logout | Clicking Logout via the user menu returns to `/login` |

**Unauthenticated access**

| Test                           | What it verifies                                    |
| ------------------------------ | --------------------------------------------------- |
| redirects /dashboard to /login | Unauthenticated visit to `/dashboard` is redirected |
| redirects /users to /login     | Unauthenticated visit to `/users` is redirected     |
| redirects /groups to /login    | Unauthenticated visit to `/groups` is redirected    |

---

### `access-control.spec.js` — Role-Based Route Access

Tests that each role can only reach pages they are authorized to see.

**Regular user**

| Test                                              | What it verifies                                 |
| ------------------------------------------------- | ------------------------------------------------ |
| cannot access /users — redirected to dashboard    | Users are blocked from the user-management page  |
| cannot access /groups — redirected to dashboard   | Users are blocked from the group-management page |
| cannot access /settings — redirected to dashboard | Users are blocked from the settings page         |

**Assignment manager**

| Test                                            | What it verifies                      |
| ----------------------------------------------- | ------------------------------------- |
| can access /users                               | AMs can view the users list           |
| cannot access /groups — redirected to dashboard | AMs are blocked from group management |

**Admin**

| Test               | What it verifies               |
| ------------------ | ------------------------------ |
| can access /users  | Admin can view the users list  |
| can access /groups | Admin can view the groups list |

> Note: admin route access is also covered more thoroughly in `admin.spec.js`.

---

### `admin.spec.js` — Admin CRUD

Tests the core create / edit / delete operations that only admins can perform, including error paths for duplicate data.

**User management**

| Test                             | What it verifies                                                            |
| -------------------------------- | --------------------------------------------------------------------------- |
| can create a new user via the UI | Create User form works end-to-end; new user appears in the list             |
| can edit a user profile          | Edit User modal updates first name and the change is reflected in the table |
| can delete a user                | Delete User confirmation removes the user from the list                     |

**Group management**

| Test                   | What it verifies                                                           |
| ---------------------- | -------------------------------------------------------------------------- |
| can create a new group | Create Group form works end-to-end; new group appears in the list          |
| can edit a group name  | Edit Group modal updates the name and the change is reflected in the table |
| can delete a group     | Delete Group confirmation removes the group from the list                  |

**Create User — error paths**

| Test                               | What it verifies                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| shows error for duplicate username | Submitting a Create User form with an already-taken username shows "Username or email already in use" inline error |
| shows error for duplicate email    | Submitting a Create User form with an already-taken email shows "Username or email already in use" inline error    |

---

### `assignment-manager.spec.js` — Assignment Manager Capabilities

Tests what an Assignment Manager can and cannot do.

| Test                                            | What it verifies                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| can navigate to /users page                     | AM sees the Manage Users page                                                                          |
| cannot see the Create User button               | Create User is hidden from AMs                                                                         |
| cannot see the Delete User button               | Delete User is hidden from AMs                                                                         |
| cannot access /groups — redirected to dashboard | Group management is blocked for AMs                                                                    |
| can assign a user to a group                    | AM can open the Assign Group modal, select a group, and save; the group name appears in the user's row |

---

### `user.spec.js` — Regular User Dashboard

Tests what a regular user can do on their dashboard.

| Test                                            | What it verifies                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| sees dashboard with profile information         | Dashboard shows the user's username and role                                         |
| sees "My Group" section when not in a group     | When no groups exist, the "No available groups to join" message is shown             |
| can join a group from the dashboard             | User can click Join for an available group and their profile reflects the assignment |
| cannot access /users — redirected to dashboard  | Route guard blocks the users page                                                    |
| cannot access /groups — redirected to dashboard | Route guard blocks the groups page                                                   |
| can leave a group after joining                 | Leave Group button is visible once in a group; clicking it clears the assignment     |

---

### `dashboard-advanced.spec.js` — Feeling Lucky & Join Lock

Tests the Feeling Lucky random-assignment feature and the effect of the group join lock on the dashboard.

| Test                                                                        | What it verifies                                                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| user sees "Feeling Lucky" button when groups are available                  | Button appears when there is at least one available group                                                              |
| clicking "Feeling Lucky" assigns user to a group                            | After clicking, the user lands in a group ("You are in:" section is shown)                                             |
| user can join a specific group from the list                                | Clicking the Join button for a specific group succeeds                                                                 |
| when group join lock is enabled, user sees locked message instead of groups | Once admin enables the lock, unassigned users see "Group joining is locked"; Feeling Lucky and Join buttons are hidden |
| locked user in a group sees locked message and no Leave Group button        | Users already in a group also see the locked message; Leave Group is hidden to prevent churn during a lock             |

---

### `forgot-password.spec.js` — Password Reset Flow

Tests the two-page password reset flow: submitting an email request and then using a token link to set a new password.

**Forgot Password**

| Test                                                                    | What it verifies                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| shows the reset password form                                           | `/forgot-password` renders the email input and Send Reset Link button                              |
| shows success message after submitting a valid email                    | Submitting a registered email shows a generic success message                                      |
| shows success message even for unknown email (avoids email enumeration) | Submitting an unregistered email also shows the same generic success message — no user enumeration |
| back to login link navigates to /login                                  | The "Back to login" link works                                                                     |

**Set Password**

| Test                                                         | What it verifies                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| shows Invalid Link when no token is provided                 | Visiting `/set-password` without a token shows an error state                       |
| shows the set password form when a valid token is in the URL | A valid token in the query string renders the password form                         |
| sets password successfully and redirects to login            | Submitting matching passwords resets the password and redirects to `/login`         |
| shows error when passwords do not match                      | Client-side validation catches mismatched passwords before submission               |
| shows error for invalid token                                | Submitting a valid-looking but non-existent token returns an error from the backend |

---

### `settings.spec.js` — Group Join Lock Toggle

Tests admin access to the Settings page and the group join lock toggle.

| Test                                                                 | What it verifies                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| admin can navigate to settings from dashboard                        | Settings link in the nav works; page heading is visible                                                             |
| settings page shows Group Settings with lock toggle                  | The "Lock group joining" section and "Enable group join lock" button render correctly                               |
| admin can enable the group join lock                                 | Clicking Enable updates the setting, shows a success toast, and flips the button label to "Disable group join lock" |
| admin can disable the group join lock after enabling it              | After enabling, clicking Disable restores the button label to "Enable group join lock"                              |
| when group join lock is enabled, user dashboard shows locked message | End-to-end: admin enables lock → user logs in → user sees "Group joining is locked" on dashboard                    |

---

### `groups-advanced.spec.js` — Advanced Group Admin Features

Tests bulk group creation, enable/disable toggle, member limits, CSV export, and CSV import.

**Bulk Create**

| Test                                                         | What it verifies                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| bulk create groups with prefix and count                     | Filling prefix "BulkGroup" and count 3 creates BulkGroup1, BulkGroup2, BulkGroup3 (1-digit padding for n < 10) |
| bulk create with member limit sets max_members on all groups | Setting a limit of 5 in the bulk-create form applies to every created group (shown as "0 / 5" in the table)    |

**Enable / Disable**

| Test                                 | What it verifies                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| admin can disable an enabled group   | The Disable Group button disables the group; the button switches to Enable Group   |
| admin can re-enable a disabled group | The Enable Group button re-enables the group; the button switches to Disable Group |

**Member Limit**

| Test                                               | What it verifies                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| admin can set a member limit on a group            | Set Member Limit modal saves the limit; the table shows "0 / 10"     |
| admin can remove a member limit (set to unlimited) | Clearing the limit input saves successfully; the table shows "0 / ∞" |

**Export**

| Test                                           | What it verifies                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| export mappings button triggers a CSV download | Clicking Export Mappings initiates a file download with a filename matching `group-mappings*.csv` |

**Import (CSV wizard)**

| Test                                                             | What it verifies                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| import group mappings wizard: upload CSV, preview, and import    | Uploading a valid CSV advances to the Preview step showing the row as "Ready"; clicking Import → Confirm completes the import and shows "Import Complete" |
| import group mappings shows "Group not found" for unknown groups | A CSV row referencing a non-existent group shows "Group not found" in the preview                                                                         |

---

### `users-advanced.spec.js` — User Enable/Disable, Name Editing, and Delete Constraints

Tests admin management of user status and display name via the Edit User modal, and delete-related constraints.

**Enable / Disable via Edit Modal**

| Test                                        | What it verifies                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| admin can disable a user via the edit modal | Unchecking Enabled in the edit modal and saving changes the user's row to show "Inactive"                |
| admin can re-enable a disabled user         | Checking Enabled in the edit modal and saving changes the user's row to show "Active"                    |
| admin can edit user first and last name     | Updating First Name and Last Name in the edit modal and saving reflects "New Updated" in the Name column |

**Delete User — constraints**

| Test                                       | What it verifies                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| deleting a user removes them from the list | Single-user delete via the row delete button removes the user from the table     |
| admin row does not have a delete button    | The admin user's row has no Delete User button (admins cannot delete themselves) |

---

### `change-password.spec.js` — Change Password

Tests the Change Password modal accessible from the user menu.

| Test                                        | What it verifies                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| user can change their password successfully | Submitting the correct current password and matching new passwords shows a success message; re-login with the new password succeeds |
| shows error for wrong current password      | Submitting an incorrect current password shows "Current password is incorrect"                                                      |
| shows error when new passwords do not match | Submitting mismatched new/confirm passwords shows "New passwords do not match" (client-side, before any API call)                   |

---

### `bulk-operations.spec.js` — Bulk Operations

Tests bulk actions in the Users and Groups tables.

**Bulk Operations — Users**

| Test                                               | What it verifies                                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin can bulk delete multiple users               | Selecting two users and clicking Delete (2) → confirming removes both from the list                                                                                              |
| Delete button only appears when users are selected | The bulk Delete button is absent before any selection and appears after checking a row                                                                                           |
| admin can send setup emails to pending users       | Creating a pending user (without the send-email checkbox) causes a "Send Setup Emails (1)" button to appear; clicking it → confirming sends the emails and shows a success toast |

**Bulk Operations — Groups**

| Test                                  | What it verifies                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| admin can bulk delete multiple groups | Selecting two groups and clicking Delete (2) → confirming removes both from the list |

---

### `import-users.spec.js` — Import Users (CSV)

Tests the multi-step Import Users wizard.

| Test                                                        | What it verifies                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| upload CSV and import new users successfully                | Uploading a valid CSV advances through Map Columns → Preview (row shown as "New") → Import → Result ("Import Complete", "1 imported") |
| preview shows conflict for duplicate username               | A CSV row with an existing username shows "Existing – skip" badge and the summary shows "1 conflict"                                  |
| preview shows invalid for rows with missing required fields | A CSV row with a blank email shows a "Missing:" badge and "1 invalid" summary; the Import button is disabled                          |

---

### `join-constraints.spec.js` — Group Join Constraints

Tests the client-side filtering and UI states related to group capacity and membership.

| Test                                                          | What it verifies                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| user cannot see a full group in the join list                 | A group at max capacity is filtered out client-side; it never appears with a Join button; "No available groups to join" is shown |
| user already in a group sees Leave button and no Join buttons | A user assigned to a group sees the "You are in:" panel with Leave Group; no Join buttons are rendered                           |
| Feeling Lucky shows error when no groups are available        | When no groups exist, clicking Feeling Lucky shows "No available group to join" inline error                                     |

---

## Test Count Summary

| Spec file                    |  Tests |
| ---------------------------- | -----: |
| `auth.spec.js`               |      9 |
| `access-control.spec.js`     |      7 |
| `admin.spec.js`              |      8 |
| `assignment-manager.spec.js` |      5 |
| `user.spec.js`               |      6 |
| `dashboard-advanced.spec.js` |      5 |
| `forgot-password.spec.js`    |      9 |
| `settings.spec.js`           |      5 |
| `groups-advanced.spec.js`    |      9 |
| `users-advanced.spec.js`     |      5 |
| `change-password.spec.js`    |      3 |
| `bulk-operations.spec.js`    |      4 |
| `import-users.spec.js`       |      3 |
| `join-constraints.spec.js`   |      3 |
| **Total**                    | **81** |

---

## Allure Report

[Allure](https://allurereport.org/) generates an interactive HTML report with test history, steps, timeline, and
attachments.

```bash
# After running tests (allure-results/ is written automatically)
cd tests
npx allure generate -o allure-report
npx allure open allure-report
```

The report shows:

- **Suites** — tests organised by spec file and `describe()` block
- **Timeline** — execution order and duration of each test
- **Behaviours** — same tree, grouped by feature
- **Graphs** — pass/fail breakdown by suite

In CI the `allure-framework/allure-action` publishes the report as a PR comment with a live summary table and creates a
GitHub Check — no artifact download needed.

## Artifacts

On test failure, Playwright captures:

- Screenshots: `tests/artifacts/<test-name>/test-failed-1.png`
- Videos: `tests/artifacts/<test-name>/video.webm`
- Traces: `tests/artifacts/<test-name>/trace.zip`

View a trace:

```bash
npx playwright show-trace tests/artifacts/<test-name>/trace.zip
```

These directories are git-ignored (`tests/artifacts/`, `tests/playwright-report/`, `tests/test-results/`).

## Out-of-Scope Flows

**Registration** (`/register`) is intentionally not covered. The registration feature is disabled in most deployments
(controlled by a `registrationEnabled` config flag) and is off by default in the test environment. Tests for it would
require enabling the flag per-test and would not reflect the standard deployment posture.

## CI

E2E tests run in the `test-e2e` job in `.github/workflows/ci.yml` on every push and pull request. The job uses
`ubuntu-latest` which has Docker (required for Testcontainers).

## Prerequisites

```bash
# Install test dependencies
cd tests && npm install

# Install Playwright browsers (one-time)
npx playwright install chromium

# Services must NOT be running locally — e2e starts its own via Testcontainers and Vite
```
