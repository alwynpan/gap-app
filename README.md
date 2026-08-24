# G.A.P. Portal

Group Assignment Portal — a role-based access control system for managing student groups and assignments.

## Features

- **Subject → Assignment → Group hierarchy** — Subjects contain assignments, assignments contain groups; users enrol in
  subjects and hold at most one group per assignment
- **JWT Authentication** — Secure login/logout with token-based auth; account setup and password reset via email
- **User Management** — Create, update, enable/disable, bulk-delete, and CSV-import users into a target subject;
  per-subject membership suspension without touching the account
- **Group Management** — Create, edit, bulk-create, enable/disable per-assignment groups with optional member caps
- **Role-Based Access Control (RBAC)** — Three-tier role system (Admin, Assignment Manager, User) with per-assignment
  manager scoping
- **Group Assignment** — Assign subject members to groups manually, via UI, or via per-assignment CSV import/export of
  mappings
- **Group Join/Leave** — Users can self-join/leave one group per assignment when the join lock is off
- **Safe destructive deletes** — Two-step typed confirmation when deleting subjects or assignments (cascades to groups
  and memberships, never user accounts)
- **Email Notifications** — Account setup and password-reset emails (optional SMTP; when disabled only the masked
  recipient is logged, since the body carries a one-time token — set `LOG_EMAIL_BODIES=true` outside production to log
  bodies too)
- **Per-assignment join lock** — Admins, and each assignment's own manager, can freeze self-service group joining for
  that assignment; staff can still place members while it is locked
- **Docker Support** — Dev environment with Docker Compose; production deployment with Traefik + Let's Encrypt

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend    │────▶│  PostgreSQL │
│ React+Vite  │     │   Fastify    │     │   Database  │
│  Port 3000  │     │   Port 3001  │     │   Port 5432 │
└─────────────┘     └──────────────┘     └─────────────┘
```

All API routes are prefixed with `/api`. The production setup adds Traefik in front, terminating TLS and routing `/api`
and `/health` to the backend, everything else to the frontend nginx.

The data model is hierarchical: **subjects** contain **assignments**, and each assignment has its own **groups**. Users
enrol in subjects (`user_subjects`), group membership is per assignment (`user_groups`, at most one group per user per
assignment), and assignment managers are scoped to the assignments they manage (`assignment_managers`). A user can only
be placed in a group of a subject they are enrolled in — enforced for all callers, including admins.

## Tech Stack

### Backend

- **Runtime:** Node.js 20
- **Framework:** Fastify
- **Database:** PostgreSQL 15 (dev) / 16 (production)
- **Authentication:** JWT (`@fastify/jwt`)
- **Password Hashing:** bcrypt (`bcryptjs`)
- **Email:** Nodemailer (optional — disabled when `SMTP_HOST` is blank)

### Frontend

- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router v6
- **HTTP Client:** Axios

## Quick Start — Local Development

### Prerequisites

- Docker Engine 24+ and Docker Compose v2

### 1. Clone the repo

```bash
git clone <repo-url>
cd gap-app
```

### 2. Configure environment

Copy the example env file and edit it. The Docker dev stack requires this file to exist:

```bash
cp .env.example .env
```

`docker-compose.dev.yaml` has no fallback values for the three secrets below — a known default would let anyone forge an
admin token — so set them or Compose refuses to start:

```bash
DB_PASSWORD=a-local-db-password
JWT_SECRET=my-jwt-secret
ADMIN_PASSWORD=my-secure-password

# Optional SMTP — leave SMTP_HOST blank to disable email. Bodies carry a one-time
# token, so logging them is opt-in and ignored when NODE_ENV=production.
LOG_EMAIL_BODIES=false
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=secret
SMTP_FROM=no-reply@example.com
APP_URL=http://localhost:3000
```

If you skip this step, `docker compose up` will fail — both because `docker-compose.dev.yaml` references `.env` via
`env_file` and because the three secrets above are required with no default.

The dev stack publishes Postgres and both servers on `127.0.0.1` only, so a shared or remotely reachable machine does
not expose them to the network.

### 3. Start all services

```bash
docker compose up -d
```

Migrations run automatically on backend startup (Docker stacks only). The first run seeds the `admin` account.

> **Git revision in the UI:** The frontend displays the current git hash for build traceability. The dev stack mounts
> `.git` read-only into the frontend container so Vite resolves the hash automatically via `git`. After each new commit,
> restart the frontend container to pick up the updated hash:
>
> ```bash
> docker compose -f docker-compose.dev.yaml restart frontend
> ```

| Service      | URL                          |
| ------------ | ---------------------------- |
| Frontend     | http://localhost:3000        |
| Backend API  | http://localhost:3001/api    |
| Health check | http://localhost:3001/health |

### Useful dev commands

```bash
docker compose logs -f backend     # Watch backend logs
docker compose logs -f frontend    # Watch frontend logs
docker compose down                # Stop all services
docker compose down -v             # Stop and wipe database
```

### Manual setup (without Docker)

```bash
# Install dependencies
npm run install:all

# Backend
cd backend
cp .env.example .env   # then edit .env
npm run migrate
npm run dev            # http://localhost:3001

# Frontend (new terminal)
cd frontend
npm run dev            # http://localhost:3000
```

## Default Credentials

After migrations, the built-in admin account is seeded automatically:

| Field    | Value                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Username | `admin` (hardcoded in migrations — `ADMIN_USERNAME` env var is not read) |
| Password | Value of `ADMIN_PASSWORD` env var                                        |
| Role     | Admin                                                                    |

> **Set a strong `ADMIN_PASSWORD` before running migrations in production.**

## Production Deployment (Docker Compose + Traefik)

The production stack lives in `deployment/docker/`. It adds:

- **Traefik** reverse proxy with automatic Let's Encrypt TLS
- **PostgreSQL 16**
- **Scheduled database backups** (daily dumps to `/backups/` on the host)

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A server with a public IP
- A domain with an A record pointing to that IP
- Ports 80 and 443 open in the firewall

### Deploy

```bash
git clone <repo-url>
cd gap-app/deployment/docker

cp .env.example .env
# Edit .env — fill in at minimum:
#   DOMAIN, LETSENCRYPT_EMAIL, DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD

docker compose pull
docker compose up -d
```

The production stack runs images published by CI; it does not build from source.

Traefik provisions a Let's Encrypt certificate on first startup (allow 1–2 minutes).

```bash
docker compose ps              # Verify all services are running
docker compose logs traefik    # Check TLS provisioning
```

### Production environment variables

| Variable               | Required | Default             | Description                                                                              |
| ---------------------- | :------: | ------------------- | ---------------------------------------------------------------------------------------- |
| `DOMAIN`               |   Yes    | —                   | FQDN (e.g. `gap.example.com`)                                                            |
| `LETSENCRYPT_EMAIL`    |   Yes    | —                   | Email for Let's Encrypt registration                                                     |
| `DB_PASSWORD`          |   Yes    | —                   | PostgreSQL password                                                                      |
| `JWT_SECRET`           |   Yes    | —                   | JWT signing secret (min 32 chars)                                                        |
| `ADMIN_PASSWORD`       |   Yes    | —                   | Initial admin password (seeded on first migration only)                                  |
| `JWT_EXPIRES_IN`       |    No    | `24h`               | Token expiry                                                                             |
| `REGISTRATION_ENABLED` |    No    | `false`             | Allow public self-registration                                                           |
| `SMTP_HOST`            |  Yes\*   | _(empty)_           | SMTP host. Required in production: with it blank no email is sent and no link is logged  |
| `SMTP_PORT`            |    No    | `587`               | SMTP port                                                                                |
| `SMTP_SECURE`          |    No    | `false`             | `true` for SMTPS; `false` for STARTTLS on port 587                                       |
| `SMTP_USER`            |    No    | _(empty)_           | SMTP auth username                                                                       |
| `SMTP_PASS`            |    No    | _(empty)_           | SMTP auth password                                                                       |
| `SMTP_FROM`            |    No    | `no-reply@<DOMAIN>` | Sender address                                                                           |
| `BACKUP_FREQ`          |    No    | `1440`              | Backup interval in minutes (default: every 24 h)                                         |
| `BACKUP_BEGIN`         |    No    | `0300`              | First backup time, HHMM (default: 3:00 AM)                                               |
| `BACKUP_CLEANUP_TIME`  |    No    | `10080`             | Delete backups older than N minutes (default: 7 days)                                    |
| `LOG_LEVEL`            |    No    | _(unset)_           | Set to `silent` to suppress non-fatal backend logs (fatal errors always write to stderr) |

\* `SMTP_HOST` is technically optional, but account setup and password-reset links are delivered only by email. Bodies
carry one-time tokens and are never written to the logs when `NODE_ENV=production`, so leaving it blank means no user
can complete account setup.

### Database backups

```bash
# List backups
ls /backups/

# Restore
gunzip -c /backups/<file>.sql.gz | \
  docker compose exec -T postgres psql -U gap_user -d gap_db
```

### Common production operations

```bash
docker compose logs -f backend                   # Tail backend logs
docker compose restart backend                   # Restart a service
git pull                                         # Only for deployment-file changes
docker compose pull && docker compose up -d      # Update to new images
docker compose down                              # Stop
docker compose down -v                           # Stop and wipe all data
```

## Database Migrations

```bash
cd backend
npm run migrate        # Create tables if needed, apply pending migrations
npm run migrate:up     # Alias for migrate
npm run migrate:reset  # Full reset — drops all tables (requires confirmation in production)
```

Incremental migrations live in `backend/src/db/migrations/` as numbered SQL files. Always add schema changes as a new
migration file — never edit existing ones.

> ⚠️ **Destructive upgrade to the subject/assignment hierarchy.** Migration `013_subject_assignment_hierarchy.sql` moves
> the database from the old flat groups model to the Subject → Assignment → Group hierarchy using a **clean-reset
> strategy**: it **drops the legacy `groups` table (including all group memberships) and removes the `users.group_id`
> column**. User accounts are preserved by `migrate`, which is the recommended path when the accounts must survive: it
> converges a legacy database (including a pre-UUID one) to the new schema, keeping users, roles and password-reset
> tokens, and destroying only group data. One precondition: migrations 012 and 015 add case-insensitive unique indexes
> on `users.username` and `users.email`, and stop with an explanatory error if the legacy data holds names or addresses
> that differ only by case (`Alice` and `alice`). Merge or rename those rows and rerun. `migrate:reset` is **not** an
> upgrade path — it drops every table including `users`, so all accounts are lost and must be re-created or restored
> from a backup. **Back up your database before upgrading.** Databases created from the current schema are unaffected.

Migration `014_user_subjects_enabled.sql` adds the per-subject suspension flag (`user_subjects.enabled`) and is
non-destructive — all existing memberships default to enabled.

## Testing

### Backend unit tests

```bash
npm test                                        # Run all unit tests (backend + frontend, from project root)
cd backend && npx jest --coverage               # Backend only, with coverage report
cd backend && npx jest tests/unit/auth.test.js  # Single file
```

### Frontend unit tests

```bash
cd frontend && npx jest --coverage
cd frontend && npx jest tests/unit/pages/Login.test.jsx
```

### E2E tests (requires running services)

```bash
cd tests && npm install
npm test                           # All e2e tests
npm test -- auth.spec.js           # Single file
```

Coverage thresholds: **80% branches**, **85% functions/lines/statements** (backend and frontend).

### Linting & formatting

```bash
npm run lint              # Lint both backend and frontend
npm run format:check      # Check formatting
cd backend && npm run lint:fix    # Auto-fix backend
cd frontend && npm run lint:fix   # Auto-fix frontend
```

Pre-commit hooks (Husky + lint-staged) automatically apply Prettier and ESLint on staged files. ESLint runs with
`--max-warnings 0`.

## Role System

| Role                   | Capabilities                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**              | Full access: manage subjects, assignments, groups, and users; lock group joining per assignment; enrol users in subjects; suspend/re-enable subject memberships; assign users to groups; bulk operations; the global Users page is Admin-only |
| **Assignment Manager** | Scoped to managed assignments: create/edit/delete groups and assign subject members to groups; manages members (create, suspend/enable, setup emails) inside subjects where they manage an assignment, via the subject page                   |
| **User**               | View own profile and enrolled subjects; self-join/leave one group per assignment (when join lock is off)                                                                                                                                      |

## Environment Variables Reference

### Backend

| Variable               | Description                                          | Default                                |
| ---------------------- | ---------------------------------------------------- | -------------------------------------- |
| `JWT_SECRET`           | JWT signing secret (required)                        | —                                      |
| `JWT_EXPIRES_IN`       | Token expiry                                         | `24h`                                  |
| `DB_HOST`              | PostgreSQL host                                      | `localhost`                            |
| `DB_PORT`              | PostgreSQL port                                      | `5432`                                 |
| `DB_NAME`              | Database name                                        | `gap_db`                               |
| `DB_USER`              | Database user                                        | `gap_user`                             |
| `DB_PASSWORD`          | Database password (required)                         | —                                      |
| `ADMIN_PASSWORD`       | Initial admin password (required at first migration) | —                                      |
| `REGISTRATION_ENABLED` | Allow public registration                            | `false` (dev Docker sets it to `true`) |
| `PORT`                 | Server port                                          | `3001`                                 |
| `CORS_ORIGIN`          | Allowed CORS origin                                  | `http://localhost:3000`                |
| `SMTP_HOST`            | SMTP hostname (blank = disable email)                | _(empty)_                              |
| `SMTP_PORT`            | SMTP port                                            | `587`                                  |
| `SMTP_SECURE`          | Use TLS (SMTPS)                                      | `false`                                |
| `SMTP_USER`            | SMTP username                                        | _(empty)_                              |
| `SMTP_PASS`            | SMTP password                                        | _(empty)_                              |
| `SMTP_FROM`            | Sender address                                       | `no-reply@gap-app.local`               |
| `APP_URL`              | Frontend public URL (used in email links)            | `http://localhost:3000`                |

### Frontend

| Variable       | Description          | Default                 |
| -------------- | -------------------- | ----------------------- |
| `VITE_API_URL` | Backend API base URL | `http://localhost:3001` |

## Project Structure

```
gap-app/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment config and DB pool
│   │   ├── db/
│   │   │   ├── migrations/  # Numbered SQL migration files
│   │   │   ├── migrate.js   # Migration runner
│   │   │   └── pool.js      # Shared pg pool
│   │   ├── middleware/
│   │   │   ├── auth.js      # JWT plugin + verifyToken decorator
│   │   │   └── rbac.js      # checkRole, requireAdmin, requireAssignmentManager
│   │   ├── models/          # User, Subject, Assignment, Group, UserGroup, Role, PasswordResetToken
│   │   ├── routes/          # auth, users, subjects, assignments, groups
│   │   ├── services/
│   │   │   └── email.js     # Nodemailer email service
│   │   └── server.js        # App entry point
│   ├── tests/unit/
│   ├── Dockerfile           # Production image
│   └── Dockerfile.dev       # Dev image (nodemon)
├── frontend/
│   ├── src/
│   │   ├── components/      # Header, ProtectedRoute, CsvDropzone, etc.
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/           # Login, Register, Dashboard, Users, Subjects, SubjectDetail, Groups, ImportUsers, ImportGroupMappings, Settings
│   │   └── utils/           # csv, formatting, schemas
│   ├── tests/unit/
│   ├── Dockerfile           # Production (multi-stage: build + nginx)
│   └── Dockerfile.dev       # Dev (Vite dev server)
├── tests/
│   └── e2e/                 # auth, users, groups, rbac, registration specs
├── deployment/
│   └── docker/              # Production Docker Compose + Traefik
│       ├── docker-compose.yaml
│       └── .env.example
├── docs/
│   ├── api-reference.md     # All API endpoints with access requirements
│   └── user-guide.md        # Feature-level usage instructions
├── docker-compose.dev.yaml  # Local development stack
└── README.md
```

## Security

- Change the default admin password immediately after first deployment
- Use a long random string (32+ chars) for `JWT_SECRET`
- Enable HTTPS in production (handled automatically by the Traefik stack)
- Set `REGISTRATION_ENABLED=false` in production unless public registration is needed
- Rate limiting: 100 req/min global (production); stricter per-endpoint limits on auth routes
- All passwords are bcrypt-hashed; password hashes are never returned in API responses
- Parameterised SQL queries throughout

## Troubleshooting

### Database connection issues

```bash
docker compose ps postgres
docker compose logs postgres
docker compose exec backend npm run migrate
```

### Frontend build issues

```bash
cd frontend && rm -rf node_modules dist && npm install && npm run build
```

### Email links not arriving

> **Note:** In production, SMTP must be configured — without it, account setup and password reset emails will not be
> sent.

If `SMTP_HOST` is not configured, nothing is sent and the request reports the non-delivery — it is never counted as
success. The email body carries a one-time token, so it is only logged when you explicitly opt in with
`LOG_EMAIL_BODIES=true` (ignored in production):

```bash
docker compose logs backend | grep "http"
```

## Further Reading

- [API Reference](docs/api-reference.md) — all endpoints, methods, and access requirements
- [User Guide](docs/user-guide.md) — detailed feature usage instructions by role

## License

MIT
