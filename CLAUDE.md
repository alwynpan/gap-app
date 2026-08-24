# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

G.A.P. (Group Assignment Portal) is a role-based access control system for managing student groups and assignments. This
is a pnpm workspace monorepo with three packages: backend, frontend, and e2e tests.

## Common Commands

### Install dependencies

```bash
pnpm install                 # Install all workspace dependencies from root
```

### Development

```bash
docker compose -f docker-compose.dev.yaml up -d   # Start all services (migrations run automatically)
pnpm --filter gap-backend dev                      # Backend dev server (port 3001) - manual setup
pnpm --filter gap-frontend dev                     # Frontend dev server (port 3000) - manual setup
```

### Database Migrations

```bash
pnpm --filter gap-backend migrate        # Create tables if needed, apply pending migrations (safe for existing data)
pnpm --filter gap-backend migrate:up     # Same as above (alias)
pnpm --filter gap-backend migrate:reset  # Full reset: DROP all tables, recreate schema, run all migrations (requires confirmation in production)
```

Incremental migrations live in `backend/src/db/migrations/` as numbered SQL files (e.g.
`001_rename_team_manager_to_assignment_manager.sql`). New schema changes should always be added as a new migration file.

### Testing

```bash
pnpm run test                                          # Run backend + frontend unit tests (from root)
pnpm --filter gap-backend test                         # Backend tests with coverage
pnpm --filter gap-backend exec jest tests/unit/auth.test.js  # Single backend test file
pnpm --filter gap-frontend test                        # Frontend tests with coverage
pnpm --filter gap-frontend exec jest tests/unit/pages/Login.test.jsx  # Single frontend test
pnpm run test:integration                              # Backend integration tests (Testcontainers)
pnpm run test:e2e                                      # E2E tests (requires running services)
```

### Linting & Formatting

```bash
pnpm run lint                # Lint both backend and frontend
pnpm run format:check        # Check formatting for both
pnpm --filter gap-backend lint:fix      # Auto-fix backend lint issues
pnpm --filter gap-frontend lint:fix     # Auto-fix frontend lint issues
```

## Architecture

### Monorepo Structure (pnpm workspaces)

- Root `package.json` holds shared devDependencies (eslint, prettier, husky, lint-staged, plugins)
- Each package has only its own unique dependencies
- Single `pnpm-lock.yaml` at root; no per-package lockfiles
- `pnpm --filter <package-name>` to run scripts in specific packages

### Backend (Fastify, CommonJS)

- `backend/src/server.js` — App entry point, exports `buildServer()` for testing. Its global `preHandler` treats the JWT
  as identity only: it reloads the user on every request, rejects missing/disabled/inactive accounts
  (`request.user = null` → 401), and overrides `request.user.role` with the database role, so disable/demote/delete take
  effect at once instead of at token expiry.
- `backend/src/middleware/auth.js` — Fastify plugin: registers `@fastify/jwt`, provides `verifyToken` decorator
- `backend/src/middleware/rbac.js` — Fastify plugin: `checkRole` checks if user's role is in the allowed list (admin
  always passes); also provides `requireAdmin` and `requireAssignmentManager` helpers
- `backend/src/models/` — Data access layer (User, Subject, Assignment, Group, UserGroup, Role) using raw SQL via `pg`
  pool
- `backend/src/routes/` — Route handlers registered as Fastify plugins (auth, users, subjects, assignments, groups)
- Data hierarchy: subjects → assignments → groups. Users enrol in subjects (`user_subjects` m2m); group membership is
  per assignment (`user_groups`, at most one group per user per assignment); AM scoping via `assignment_managers` m2m.
  Group placement requires membership of the parent subject — enforced in `UserGroup.assignUserToGroup` for all callers,
  including admins.
- `backend/src/config/` — Environment config and database pool setup
- `backend/Dockerfile` — Production image (pnpm deploy multi-stage); `backend/Dockerfile.dev` — Dev image

### Docker Compose

- Uses `Dockerfile.dev` for both backend and frontend (dev servers with hot reload)
- Build context is repo root (needed for pnpm workspace files)
- Backend container runs `pnpm --filter gap-backend run migrate && pnpm --filter gap-backend run dev` on startup
- Source code is volume-mounted for live reloading
- Production Dockerfiles use `pnpm deploy --prod` to create standalone images without pnpm

### Frontend (React 18 + Vite, ESM)

- `frontend/src/context/AuthContext.jsx` — Global auth state (JWT token, user info, login/logout)
- `frontend/src/components/ProtectedRoute.jsx` — Route guard that checks auth and role
- `frontend/src/components/Modal.jsx` — Accessible dialog wrapper (role/aria-modal, initial focus, focus trap, Escape,
  focus restore) that every modal is built on
- `frontend/src/utils/api.js` — Axios instance; `registerSessionExpiryHandler` lets AuthProvider clear auth state on a
  401 from any authenticated request
- `frontend/src/pages/` — Page components (Login, Register, Dashboard, Users, Subjects, SubjectDetail, Groups)
- Routes: `/subjects`, `/subjects/:subjectId`, `/subjects/:subjectId/assignments/:assignmentId` (groups); `/groups`
  redirects to `/subjects`
- Uses `@` path alias mapped to `src/` (configured in vite and jest)

### Three-Tier Role System

- **Admin** — Full CRUD on subjects, assignments, groups, and users; enrols users in subjects. `GET /users` (and the
  frontend `/users` + `/users/import` routes) are admin-only.
- **Assignment Manager** — Scoped via `assignment_managers`: create/update/delete groups and assign subject members to
  groups only in managed assignments; manages members per subject (create, suspend/enable, setup emails) only for
  subjects containing an assignment they manage — same scope applies to `PUT /users/:id`; setting `enabled` there is
  admin-only
- **User** — View own profile/subjects; self join/leave one group per assignment within enrolled subjects (the parent
  assignment's join lock applies)

Assignment managers may only edit users whose role is `user`; editing a peer manager is refused (it would let them
capture that peer's password reset). `GET /users/:id` applies the same managed-subject scope as `PUT /users/:id`. Bulk
import with `conflictAction: 'overwrite'` may only overwrite accounts already inside the caller's managed subjects
before the request, so the import's own enrolment cannot manufacture authorization. Immediate group placement on
`POST /users` requires managing that exact assignment, not merely one in the same subject.

Per-subject suspension (`user_subjects.enabled`, migration 014, `PUT /subjects/:id/users/:userId`): suspending deletes
the member's group memberships within that subject (not restored on re-enable); suspended members are hidden from their
own session (`/auth/me`) and treated as non-members by all scope checks, but staff still see them in
`GET /subjects/:id/users` with `membership_enabled: false`.

Group joining is locked per assignment (`assignments.join_locked`, migration 017, `PUT /assignments/:id/join-lock`) —
admin or that assignment's manager only. This replaced a global `config` row that any assignment manager could flip; the
`config` routes and model were removed with it. The lock exemption is assignment-scoped: an AM who does not manage that
assignment obeys it like a student. Self-service join/leave re-reads the lock inside the write transaction
(`enforcePolicy`), so a lock committed mid-request still applies.

`POST /subjects/:id/users` never re-enables a suspended membership — re-enabling is a deliberate action — so it returns
a breakdown (`added` / `alreadyEnrolled` / `suspended`) and a message naming the suspended count rather than a bare
success.

Concurrency: `UserGroup.assignUserToGroup` locks `users` (FOR KEY SHARE, matching the order a user deletion takes), then
the `user_subjects` row, then the `groups` row, and only then counts members in a _separate_ statement. Counting inside
the locking SELECT reads the pre-lock snapshot, so two concurrent joins both saw stale capacity and exceeded
`max_members`. `Subject.setMemberEnabled`/`removeUser` and `Group.updateWithCapacityCheck` take the same locks in the
same order.

Identity is case-insensitive for both username (migration 012) and email (migration 015), with `LOWER()` unique indexes
and lowercasing at the Zod boundary. Migration 016 adds the same for subject/assignment/group names, which the models
already compared case-insensitively.

Deleting subjects/assignments uses two-step typed confirmation in the UI; cascades assignments → groups → memberships,
never user accounts. The built-in `admin` account cannot be disabled, demoted, or deleted, and `User.deleteMany` refuses
under an advisory lock to remove the last enabled admin. Migration 013 destructively drops legacy flat groups and
`users.group_id` (user accounts preserved).

### Testing Setup

- Backend unit tests: Jest with `node` environment, mocks in `backend/tests/setup.js`
- Frontend unit tests: Jest with `jsdom` + React Testing Library, Babel transform (not Vite)
- E2E tests: Playwright with Testcontainers, hits live API
- Coverage thresholds: 80% branches, 85% functions/lines/statements (both backend and frontend)

### Pre-commit Hooks

Husky runs `lint-staged` on commit (via `pnpm exec lint-staged`), which applies Prettier and ESLint fixes to staged
files. ESLint uses `--max-warnings 0` so any warning fails the lint.

### Key Environment Variables

- `JWT_SECRET` — Required, no default
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — PostgreSQL connection
- `ADMIN_PASSWORD` — Set before running migrations (admin username is hardcoded as `admin`)
- `VITE_API_URL` — Frontend API base URL (default: `http://localhost:3001`)
