# G.A.P. Portal

Group Assignment Portal - A role-based access control system for managing student groups and assignments.

## Features

- 🔐 **JWT Authentication** - Secure login/logout with token-based authentication
- 👥 **User Management** - Create, update, and manage users with different roles
- 📁 **Group Management** - Create and manage student groups/teams
- 🎭 **Role-Based Access Control (RBAC)** - Three-tier role system (Admin, Assignment Manager, User)
- 🚀 **Kubernetes Ready** - Full K8s manifests for production deployment
- 🐳 **Docker Support** - Local development with Docker Compose

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend    │────▶│  PostgreSQL │
│ React+Vite  │     │   Fastify    │     │   Database  │
│  Port 3000  │     │   Port 3001  │     │   Port 5432 │
└─────────────┘     └──────────────┘     └─────────────┘
```

## Tech Stack

### Backend
- **Runtime:** Node.js 20
- **Framework:** Fastify
- **Database:** PostgreSQL 15
- **Authentication:** JWT (@fastify/jwt)
- **Password Hashing:** bcrypt (@fastify/bcrypt)

### Frontend
- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router v6
- **HTTP Client:** Axios

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Orchestration:** Kubernetes
- **Ingress:** Traefik

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (if not using Docker)

### Option 1: Docker Compose (Recommended)

```bash
# Start all services (migrations run automatically on backend startup)
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# API Docs: http://localhost:3001/api
```

To override default credentials, create a `.env` file in the project root:

```bash
ADMIN_PASSWORD=my-secure-password
JWT_SECRET=my-jwt-secret
```

Useful commands:

```bash
docker-compose logs -f backend    # Watch backend logs
docker-compose logs -f frontend   # Watch frontend logs
docker-compose down               # Stop all services
docker-compose down -v            # Stop and wipe database data
```

### Option 2: Manual Setup

```bash
# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run migrate
npm run dev

# Frontend setup (in new terminal)
cd frontend
npm install
npm run dev
```

## Default Credentials

After running migrations, the admin username and password are set via environment variables:
- **Username:** `admin` (or set `ADMIN_USERNAME` before migration)
- **Password:** Set via `ADMIN_PASSWORD` environment variable before migration
- **Role:** Admin

⚠️ **Set secure values for `ADMIN_USERNAME` and `ADMIN_PASSWORD` before running migrations in production!**

To set admin credentials:
```bash
# In your .env file or environment
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=your-secure-password

# Then run migrations
npm run migrate
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user

### Users (Admin/Assignment Manager)
- `GET /users` - List all users
- `GET /users/:id` - Get user by ID
- `POST /users` - Create user (Admin only)
- `PUT /users/:id` - Update user (Admin only)
- `PUT /users/:id/group` - Assign user to group
- `DELETE /users/:id` - Delete user (Admin only)

### Groups
- `GET /groups` - List all groups
- `GET /groups/enabled` - List enabled groups
- `GET /groups/:id` - Get group with members
- `POST /groups` - Create group (Admin only)
- `PUT /groups/:id` - Update group (Admin only)
- `DELETE /groups/:id` - Delete group (Admin only)

## Role System

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all features, user management, group management |
| **Assignment Manager** | View all users, assign users to groups |
| **User** | View own profile, view groups |

## Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (v1.25+)
- kubectl configured
- Traefik ingress controller
- local-path storage provisioner

### Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/gap-namespace.yaml

# Create secrets
kubectl create secret generic gap-secrets \
  -n gap-portal \
  --from-literal=db-password='your-secure-password' \
  --from-literal=jwt-secret='your-jwt-secret'

# Deploy PostgreSQL
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/postgres-service.yaml

# Wait for PostgreSQL to be ready
kubectl wait --for=condition=available deployment/postgres -n gap-portal --timeout=300s

# Run migrations
kubectl run migrate --rm -it --image=gap-backend:latest --namespace=gap-portal -- npm run migrate

# Deploy backend
kubectl apply -f k8s/gap-backend-deployment.yaml

# Deploy frontend
kubectl apply -f k8s/gap-frontend-deployment.yaml

# Deploy service and ingress
kubectl apply -f k8s/gap-service.yaml
kubectl apply -f k8s/gap-ingress.yaml

# Access the application
# kubectl port-forward svc/gap-frontend 8080:80 -n gap-portal
# Or access via gap.local (configure /etc/hosts)
```

### Add to /etc/hosts
```
127.0.0.1 gap.local
```

## Testing

### Backend Unit Tests
```bash
cd backend
npm test                              # Run with coverage
npx jest tests/unit/auth.test.js      # Run a single test file
```

### Frontend Unit Tests
```bash
cd frontend
npm test                              # Run with coverage
npx jest tests/unit/pages/Login.test.jsx  # Run a single test file
```

### E2E Tests (requires running services)
```bash
cd tests
npm install
npm test                    # Run all e2e tests
npm test -- auth.spec.js    # Run a single e2e test file
npm run test:coverage       # Run with coverage
```

## Configuration

### Environment Variables

#### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT signing | (required) |
| `JWT_EXPIRES_IN` | Token expiration time | `24h` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `gap_db` |
| `DB_USER` | Database user | `gap_user` |
| `DB_PASSWORD` | Database password | (required) |
| `ADMIN_USERNAME` | Initial admin username | `admin` |
| `ADMIN_PASSWORD` | Initial admin password (required for migration) | (required) |
| `REGISTRATION_ENABLED` | Enable user registration | `true` |
| `PORT` | Server port | `3001` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |

#### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3001` |

## Project Structure

```
gap-portal/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   └── index.js
│   │   ├── db/
│   │   │   └── migrate.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── rbac.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Group.js
│   │   │   └── Role.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   └── groups.js
│   │   └── server.js
│   ├── package.json
│   ├── Dockerfile              # Production (node, npm ci --only=production)
│   ├── Dockerfile.dev          # Development (includes nodemon)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ProtectedRoute.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Users.jsx
│   │   │   └── Groups.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── Dockerfile              # Production (multi-stage: build + nginx)
│   ├── Dockerfile.dev          # Development (Vite dev server)
│   └── tailwind.config.js
├── k8s/
│   ├── gap-namespace.yaml
│   ├── postgres-deployment.yaml
│   ├── postgres-service.yaml
│   ├── gap-backend-deployment.yaml
│   ├── gap-frontend-deployment.yaml
│   ├── gap-service.yaml
│   └── gap-ingress.yaml
├── tests/
│   └── e2e/
│       ├── auth.spec.js
│       ├── registration.spec.js
│       └── rbac.spec.js
├── docker-compose.yml
└── README.md
```

## Security Considerations

- Change default admin password immediately
- Use strong JWT secrets in production
- Enable HTTPS in production
- Set appropriate CORS origins
- Keep dependencies updated
- Use Kubernetes secrets for sensitive data
- Rate limiting is enabled (100 req/min global, stricter on auth endpoints)

## Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Test connection
docker-compose exec backend npm run migrate
```

### Frontend Build Issues
```bash
# Clear cache and rebuild
cd frontend
rm -rf node_modules dist
npm install
npm run build
```

### Kubernetes Deployment Issues
```bash
# Check pod status
kubectl get pods -n gap-portal

# View logs
kubectl logs -f deployment/gap-backend -n gap-portal

# Check events
kubectl get events -n gap-portal --sort-by='.lastTimestamp'
```

## License

MIT

## Support

For issues and questions, please open an issue on the repository.
