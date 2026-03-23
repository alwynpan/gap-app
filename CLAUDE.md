# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

G.A.P. (Group Assignment Portal) - A role-based access control system for managing student groups and assignments.
Monorepo with three packages: backend, frontend, and e2e tests.

## Common Commands

### Install dependencies

```bash
npm run install:all          # Install both backend and frontend deps
cd tests && npm install      # Install e2e test deps separately
```

### Development

```bash
docker-compose up -d                        # Start all services (migrations run automatically)
cd backend && npm run dev                   # Backend dev server (port 3001) - manual setup
cd frontend && npm run dev                  # Frontend dev server (port 3000) - manual setup
```

### Database Migrations

```bash
cd backend && npm run migrate        # Create tables if needed, apply pending migrations (safe for existing data)
cd backend && npm run migrate:up     # Same as above (alias)
cd backend && npm run migrate:reset  # Full reset: DROP all tables, recreate schema, run all migrations (requires confirmation in production)
```

Incremental migrations live in `backend/src/db/migrations/` as numbered SQL files (e.g.
`001_rename_team_manager_to_assignment_manager.sql`). New schema changes should always be added as a new migration file.

### Testing

```bash
npm test                                    # Run backend unit tests (from root)
cd backend && npx jest --coverage           # Backend tests with coverage
cd backend && npx jest tests/unit/auth.test.js  # Single backend test file
cd frontend && npx jest --coverage          # Frontend tests with coverage
cd frontend && npx jest tests/unit/pages/Login.test.jsx  # Single frontend test
cd tests && npm test                        # E2E tests (requires running services)
cd tests && npm test -- auth.spec.js        # Single e2e test file
```

### Linting & Formatting

```bash
npm run lint                # Lint both backend and frontend
npm run format:check        # Check formatting for both
cd backend && npm run lint:fix      # Auto-fix backend lint issues
cd frontend && npm run lint:fix     # Auto-fix frontend lint issues
```

## Architecture

### Backend (Fastify, CommonJS)

- `backend/src/server.js` — App entry point, exports `buildServer()` for testing
- `backend/src/middleware/auth.js` — Fastify plugin: registers `@fastify/jwt`, provides `verifyToken` decorator
- `backend/src/middleware/rbac.js` — Fastify plugin: `checkRole` checks if user's role is in the allowed list (admin
  always passes); also provides `requireAdmin` and `requireAssignmentManager` helpers
- `backend/src/models/` — Data access layer (User, Group, Role) using raw SQL via `pg` pool
- `backend/src/routes/` — Route handlers registered as Fastify plugins (auth, users, groups)
- `backend/src/config/` — Environment config and database pool setup
- `backend/Dockerfile` — Production image; `backend/Dockerfile.dev` — Dev image (includes nodemon)

### Docker Compose

- Uses `Dockerfile.dev` for both backend and frontend (dev servers with hot reload)
- Backend container runs `npm run migrate && npm run dev` on startup
- Source code is volume-mounted for live reloading
- Production Dockerfiles (`Dockerfile`) are separate: backend runs `node src/server.js`, frontend builds static assets
  and serves via nginx

### Frontend (React 18 + Vite, ESM)

- `frontend/src/context/AuthContext.jsx` — Global auth state (JWT token, user info, login/logout)
- `frontend/src/components/ProtectedRoute.jsx` — Route guard that checks auth and role
- `frontend/src/pages/` — Page components (Login, Register, Dashboard, Users, Groups)
- Uses `@` path alias mapped to `src/` (configured in vite and jest)

### Three-Tier Role System

- **Admin** — Full CRUD on users and groups
- **Assignment Manager** — View users, assign users to groups
- **User** — View own profile and groups

### Testing Setup

- Backend unit tests: Jest with `node` environment, mocks in `backend/tests/setup.js`
- Frontend unit tests: Jest with `jsdom` + React Testing Library, Babel transform (not Vite)
- E2E tests: Jest with ESM (`--experimental-vm-modules`), hits live API via axios
- Coverage thresholds: 80% branches, 85% functions/lines/statements (both backend and frontend)

### Pre-commit Hooks

Husky runs `lint-staged` on commit, which applies Prettier and ESLint fixes to staged files. ESLint uses
`--max-warnings 0` so any warning fails the lint.

### Key Environment Variables

- `JWT_SECRET` — Required, no default
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — PostgreSQL connection
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — Set before running migrations
- `VITE_API_URL` — Frontend API base URL (default: `http://localhost:3001`)
