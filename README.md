# G.A.P. Portal

Group Assignment Portal — a role-based access control system for managing student groups and assignments.

## Features

- **JWT Authentication** — Secure login/logout with token-based auth; account setup and password reset via email
- **User Management** — Create, update, enable/disable, bulk-delete, and CSV-import users
- **Group Management** — Create, edit, bulk-create, enable/disable groups with optional member caps
- **Role-Based Access Control (RBAC)** — Three-tier role system (Admin, Assignment Manager, User)
- **Group Assignment** — Assign users to groups manually, via UI, or via CSV import/export
- **Group Join/Leave** — Users can self-join/leave groups when the join lock is off
- **Email Notifications** — Account setup and password-reset emails (optional SMTP; links logged to console when
  disabled)
- **System Config** — Admins/AMs can lock/unlock group joining system-wide
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

At minimum, you may want to set:

```bash
ADMIN_PASSWORD=my-secure-password
JWT_SECRET=my-jwt-secret

# Optional SMTP — leave SMTP_HOST blank to disable email (links logged to console instead)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=secret
SMTP_FROM=no-reply@example.com
APP_URL=http://localhost:3000
```

If you skip this step, `docker compose up` will fail because `docker-compose.dev.yaml` references `.env` via `env_file`.

### 3. Start all services

```bash
docker compose up -d
```

Migrations run automatically on backend startup (Docker stacks only). The first run seeds the `admin` account.

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

docker compose up -d --build
```

Traefik provisions a Let's Encrypt certificate on first startup (allow 1–2 minutes).

```bash
docker compose ps              # Verify all services are running
docker compose logs traefik    # Check TLS provisioning
```

### Production environment variables

| Variable               | Required | Default             | Description                                             |
| ---------------------- | :------: | ------------------- | ------------------------------------------------------- |
| `DOMAIN`               |   Yes    | —                   | FQDN (e.g. `gap.example.com`)                           |
| `LETSENCRYPT_EMAIL`    |   Yes    | —                   | Email for Let's Encrypt registration                    |
| `DB_PASSWORD`          |   Yes    | —                   | PostgreSQL password                                     |
| `JWT_SECRET`           |   Yes    | —                   | JWT signing secret (min 32 chars)                       |
| `ADMIN_PASSWORD`       |   Yes    | —                   | Initial admin password (seeded on first migration only) |
| `JWT_EXPIRES_IN`       |    No    | `24h`               | Token expiry                                            |
| `REGISTRATION_ENABLED` |    No    | `false`             | Allow public self-registration                          |
| `SMTP_HOST`            |    No    | _(empty)_           | SMTP host; leave blank to log email links to console    |
| `SMTP_PORT`            |    No    | `587`               | SMTP port                                               |
| `SMTP_SECURE`          |    No    | `false`             | `true` for SMTPS; `false` for STARTTLS on port 587      |
| `SMTP_USER`            |    No    | _(empty)_           | SMTP auth username                                      |
| `SMTP_PASS`            |    No    | _(empty)_           | SMTP auth password                                      |
| `SMTP_FROM`            |    No    | `no-reply@<DOMAIN>` | Sender address                                          |
| `BACKUP_FREQ`          |    No    | `1440`              | Backup interval in minutes (default: every 24 h)        |
| `BACKUP_BEGIN`         |    No    | `0300`              | First backup time, HHMM (default: 3:00 AM)              |
| `BACKUP_CLEANUP_TIME`  |    No    | `10080`             | Delete backups older than N minutes (default: 7 days)   |

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
git pull && docker compose up -d --build         # Update to new version
docker compose down                              # Stop
docker compose down -v                           # Stop and wipe all data
```

## Database Migrations

```bash
cd backend
npm run migrate        # Apply pending migrations (safe for existing data)
npm run migrate:up     # Alias for migrate
npm run migrate:reset  # Full reset — drops all tables (requires confirmation in production)
```

Incremental migrations live in `backend/src/db/migrations/` as numbered SQL files. Always add schema changes as a new
migration file — never edit existing ones.

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

| Role                   | Capabilities                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Admin**              | Full access: manage users, groups, config; assign users to groups; bulk operations  |
| **Assignment Manager** | View/create/edit users; assign users to groups; import/export mappings; lock config |
| **User**               | View own profile and groups; self-join/leave groups (when join lock is off)         |

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
│   │   ├── models/          # User, Group, Role, Config, PasswordResetToken
│   │   ├── routes/          # auth, users, groups, config
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
│   │   ├── pages/           # Login, Register, Dashboard, Users, Groups, ImportGroupMappings
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

If `SMTP_HOST` is not configured (development only), email links are printed to the backend logs:

```bash
docker compose logs backend | grep "http"
```

## Further Reading

- [API Reference](docs/api-reference.md) — all endpoints, methods, and access requirements
- [User Guide](docs/user-guide.md) — detailed feature usage instructions by role

## License

MIT
