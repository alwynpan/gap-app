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

- `backend/src/server.js` — App entry point, exports `buildServer()` for testing
- `backend/src/middleware/auth.js` — Fastify plugin: registers `@fastify/jwt`, provides `verifyToken` decorator
- `backend/src/middleware/rbac.js` — Fastify plugin: `checkRole` checks if user's role is in the allowed list (admin
  always passes); also provides `requireAdmin` and `requireAssignmentManager` helpers
- `backend/src/models/` — Data access layer (User, Subject, Assignment, Group, UserGroup, Role) using raw SQL via `pg`
  pool
- `backend/src/routes/` — Route handlers registered as Fastify plugins (auth, users, subjects, assignments, groups,
  config)
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
- `frontend/src/pages/` — Page components (Login, Register, Dashboard, Users, Subjects, SubjectDetail, Groups)
- Routes: `/subjects`, `/subjects/:subjectId`, `/subjects/:subjectId/assignments/:assignmentId` (groups); `/groups`
  redirects to `/subjects`
- Uses `@` path alias mapped to `src/` (configured in vite and jest)

### Three-Tier Role System

- **Admin** — Full CRUD on subjects, assignments, groups, and users; enrols users in subjects
- **Assignment Manager** — Scoped via `assignment_managers`: create/update/delete groups and assign subject members to
  groups only in managed assignments; sees/imports users only for subjects where they manage an assignment
- **User** — View own profile/subjects; self join/leave one group per assignment within enrolled subjects (global join
  lock applies)

Deleting subjects/assignments uses two-step typed confirmation in the UI; cascades assignments → groups → memberships,
never user accounts. Migration 013 destructively drops legacy flat groups and `users.group_id` (user accounts
preserved).

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
