# G.A.P. Production Deployment

Docker Compose deployment using Traefik as a reverse proxy with automatic Let's Encrypt SSL.

## Architecture

```
Internet
   │
   ▼
Traefik (ports 80/443)
   ├── /api, /health  ──►  Backend (Node.js :3001)
   └── /*             ──►  Frontend (nginx :8080)
                               │
                               └── static assets served directly
PostgreSQL ◄── db-backup (scheduled dumps to /backups/)
```

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A server with a public IP address
- A domain name with an A record pointing to the server's IP
- Ports 80 and 443 open in the server firewall

## Setup

**1. Clone and navigate to the deployment directory:**

```bash
git clone <repo-url>
cd gap-app/deployment/docker
```

**2. Copy the environment template and fill in required values:**

```bash
cp .env.example .env
```

Edit `.env` — at minimum, set:

- `DOMAIN`
- `LETSENCRYPT_EMAIL`
- `DB_PASSWORD`
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

**3. Build images and start services:**

```bash
docker compose up -d --build
```

Traefik will automatically provision a Let's Encrypt certificate on first startup. This may take a minute or two.

**4. Verify everything is running:**

```bash
docker compose ps
docker compose logs traefik
```

## Environment Variables

| Variable               | Required | Default             | Description                                                                                      |
| ---------------------- | :------: | ------------------- | ------------------------------------------------------------------------------------------------ |
| `DOMAIN`               |   Yes    | —                   | FQDN for the app (e.g. `gap.example.com`). DNS must point to this server.                        |
| `LETSENCRYPT_EMAIL`    |   Yes    | —                   | Email for Let's Encrypt registration and expiry notices.                                         |
| `DB_PASSWORD`          |   Yes    | —                   | Password for the PostgreSQL `gap_user` account.                                                  |
| `JWT_SECRET`           |   Yes    | —                   | Secret key for JWT signing. Use a long random string (min 32 chars).                             |
| `ADMIN_USERNAME`       |   Yes    | —                   | Username for the initial admin account (seeded on first migration only).                         |
| `ADMIN_PASSWORD`       |   Yes    | —                   | Password for the initial admin account (seeded on first migration only).                         |
| `JWT_EXPIRES_IN`       |    No    | `24h`               | JWT token expiry. Uses ms format (e.g. `24h`, `7d`).                                             |
| `REGISTRATION_ENABLED` |    No    | `false`             | Allow public self-registration. Recommended to keep `false` in production.                       |
| `SMTP_HOST`            |    No    | _(empty)_           | SMTP hostname. Leave blank to disable email — links are logged to the backend container instead. |
| `SMTP_PORT`            |    No    | `587`               | SMTP server port.                                                                                |
| `SMTP_SECURE`          |    No    | `false`             | Use TLS (SMTPS). Set to `false` for STARTTLS on port 587.                                        |
| `SMTP_USER`            |    No    | _(empty)_           | SMTP authentication username.                                                                    |
| `SMTP_PASS`            |    No    | _(empty)_           | SMTP authentication password.                                                                    |
| `SMTP_FROM`            |    No    | `no-reply@<DOMAIN>` | Sender address for outgoing emails.                                                              |
| `BACKUP_FREQ`          |    No    | `1440`              | Backup frequency in minutes (default: every 24 hours).                                           |
| `BACKUP_BEGIN`         |    No    | `0300`              | Time to run the first backup in HHMM format (default: 3:00 AM).                                  |
| `BACKUP_CLEANUP_TIME`  |    No    | `10080`             | Delete backups older than this many minutes (default: 7 days).                                   |

## Database Backups

Backups are stored in `/backups/` on the host. By default, a full PostgreSQL dump runs daily at 3:00 AM and backups are
retained for 7 days.

**Restore from backup:**

```bash
# List available backups
ls /backups/

# Restore a specific backup
gunzip -c /backups/<backup-file>.sql.gz | \
  docker compose exec -T postgres \
  psql -U gap_user -d gap_db
```

## Common Operations

**View logs:**

```bash
docker compose logs -f              # All services
docker compose logs -f backend      # Backend only
docker compose logs -f traefik      # Traefik / SSL issues
```

**Restart a service:**

```bash
docker compose restart backend
```

**Update to a new version:**

```bash
git pull
docker compose up -d --build
```

**Stop all services:**

```bash
docker compose down
```

**Stop and remove all data (destructive):**

```bash
docker compose down -v
```

## SSL Certificates

Certificates are automatically provisioned by Traefik via Let's Encrypt HTTP-01 challenge and stored in the
`letsencrypt` Docker volume. Renewal happens automatically before expiry — no manual action is needed.

> **Note:** Let's Encrypt has rate limits on certificate issuance. If you need to test the setup, temporarily add
> `--certificatesresolvers.letsencrypt.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory` to the
> Traefik command args to use the staging environment.
