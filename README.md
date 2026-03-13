# G.A.P. Portal

Group Assignment Portal - A role-based access control system for managing student groups and assignments.

## Features

- 🔐 **JWT Authentication** - Secure login/logout with token-based authentication
- 👥 **User Management** - Create, update, and manage users with different roles
- 📁 **Group Management** - Create and manage student groups/teams
- 🎭 **Role-Based Access Control (RBAC)** - Three-tier role system (Admin, Team Manager, User)
- 🚀 **Kubernetes Ready** - Full K8s manifests for production deployment
- 🐳 **Docker Support** - Local development with Docker Compose
- 🧪 **Comprehensive Testing** - Full test suite with backend unit tests, frontend component tests, and E2E workflow tests
- 🔄 **CI/CD Pipeline** - Automated linting, formatting, testing, and build validation

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
- **Runtime:** Node.js 20+
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

## Setup Instructions

### Prerequisites
- **Node.js 20 or higher** (use `nvm` to manage versions if needed)
- **npm 9+** (comes with Node.js 20)
- **Docker & Docker Compose** (for local development)
- **PostgreSQL 15** (if not using Docker)

### Installation Steps
**Always use `npm ci` instead of `npm install` to ensure consistent dependency versions:**

```bash
# Clone the repository
git clone https://github.com/alwynpan/gap-app.git
cd gap-app
# Install dependencies for all packages individually:
cd backend && npm ci
cd ../frontend && npm ci  
cd ../tests && npm ci
```

### Environment Variables
Copy the example environment file and configure as needed:

```bash
# Backend environment
cp backend/.env.example backend/.env
```

**Required Environment Variables:**

#### Backend (.env)
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | Secret key for JWT signing | your-super-secret-jwt-key-change-in-production | ✅ Yes |
| `JWT_EXPIRES_IN` | Token expiration time | `24h` | No |
| `DB_HOST` | PostgreSQL host | `postgres` | No |
| `DB_PORT` | PostgreSQL port | `5432` | No |
| `DB_NAME` | Database name | `gap_db` | No |
| `DB_USER` | Database user | `gap_user` | No |
| `DB_PASSWORD` | Database password | change_this_password_in_production | ✅ Yes |
| `ADMIN_USERNAME` | Initial admin username | `admin` | No |
| `ADMIN_PASSWORD` | Initial admin password | change_this_in_production | ✅ Yes |
| `REGISTRATION_ENABLED` | Enable user registration | `true` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Server port | `3001` | No |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3000` | No |

#### Frontend (.env.local)
Create `frontend/.env.local` if you need to override the default API URL:
```env
VITE_API_URL=http://localhost:3001
```

### Database Migration Instructions
Run database migrations to create tables and seed initial admin user:

```bash
# Using Docker Compose (recommended)
docker-compose up -d postgres
docker-compose exec backend npm run migrate

# Manual setup
cd backend
npm run migrate
```

⚠️ **Important:** Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in your `.env` file **before** running migrations!

### Docker Compose Setup
```bash
# Start all services
docker-compose up -d

# Run database migrations (if not auto-run)
docker-compose exec backend npm run migrate

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# API Docs: http://localhost:3001/api

# Stop services
docker-compose down
```

### Kubernetes Deployment
See [Kubernetes Deployment](#kubernetes-deployment) section below.

## Development Workflow

### Pre-commit Hooks (Husky)
The project uses **Husky** with **lint-staged** to automatically:
- Format code with Prettier
- Fix ESLint issues
- Prevent commits with lint errors

**Hooks are automatically installed when you run `npm ci`.**

To manually trigger pre-commit hooks:
```bash
# Run lint-staged on staged files
npx lint-staged
```

### Linting Commands
```bash
# Backend linting
cd backend
npm run lint          # Check for lint errors
npm run lint:fix      # Auto-fix fixable issues

# Frontend linting  
cd frontend
npm run lint          # Check for lint errors
npm run lint:fix      # Auto-fix fixable issues
```

### Code Formatting (Prettier)
```bash
# Backend formatting
cd backend
npm run format:check  # Check formatting
npm run format:write  # Apply formatting

# Frontend formatting
cd frontend
npm run format:check  # Check formatting  
npm run format:write  # Apply formatting
```

### Testing Commands
The project includes comprehensive test suites for both backend and frontend with E2E tests.

```bash
# Backend testing (with coverage)
cd backend
npm test                    # Run tests
npm test -- --coverage      # Run with coverage report

# Frontend testing
cd frontend
npm test                    # Run frontend tests with coverage

# End-to-end testing
cd tests
npm test                    # Run E2E tests
npm run test:coverage       # Run E2E tests with coverage
npm run test:watch          # Watch mode for development

# Test file locations:
# - Backend unit tests: backend/tests/
# - E2E tests: tests/e2e/
```

### Build Commands
```bash
# Backend build
cd backend
npm run build

# Frontend build  
cd frontend
npm run build
```

### CI/CD Pipeline
The project uses **GitHub Actions** for automated CI/CD with the following workflow:

1. **Lint Stage**: Runs ESLint on both backend and frontend
2. **Test Stage**: Runs Jest tests for backend, frontend, and E2E
3. **Format Stage**: Validates Prettier formatting
4. **Build Stage**: Verifies successful builds

**Pipeline triggers:**
- On every push to `main`
- On every pull request to `main`

**Requirements for merge:**
- All lint checks pass
- All tests pass successfully
- Code formatting is correct
- Build succeeds

## API Documentation

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user

### Users (Admin/Team Manager)
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

### Authentication Flow
1. User registers or logs in via `/auth/register` or `/auth/login`
2. Server returns JWT token in response
3. Client stores token and includes in `Authorization: Bearer <token>` header
4. All protected routes validate the token and user permissions

### Error Codes
- `401 Unauthorized` - Invalid or missing authentication token
- `403 Forbidden` - Insufficient permissions for requested action
- `400 Bad Request` - Invalid request data
- `404 Not Found` - Resource not found
- `409 Conflict` - Username or email already exists
- `500 Internal Server Error` - Server error

### API Request/Response Examples

#### User Registration
**Request:**
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "securePassword123!",
    "email": "newuser@example.com"
  }'
```

**Success Response (201 Created):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "user_123",
    "username": "newuser",
    "email": "newuser@example.com",
    "studentId": null,
    "groupId": null,
    "groupName": null,
    "role": "user",
    "studentId": null,
    "groupId": null,
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Username already exists",
  "code": "USERNAME_EXISTS"
}
```

#### User Login
**Request:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-admin-password"
  }'
```

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_admin",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "createdAt": "2026-03-13T12:00:00Z"
  }
}
```

#### Get Current User (Authenticated)
**Request:**
```bash
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (200 OK):**
```json
{
  "id": "user_admin",
  "username": "admin",
  "email": "admin@example.com",
  "role": "admin",
  "createdAt": "2026-03-13T12:00:00Z"
}
```

#### Create New User (Admin Only)
**Request:**
```bash
curl -X POST http://localhost:3001/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "username": "teammanager",
    "password": "managerPass123!",
    "email": "manager@example.com",
    "role": "team_manager"
  }'
```

**Success Response (201 Created):**
```json
{
  "id": "user_456",
  "username": "teammanager",
  "email": "manager@example.com",
  "role": "team_manager",
  "createdAt": "2026-03-13T12:05:00Z"
}
```

## Testing

### Coverage Requirements
- **Backend**: Comprehensive test coverage for all business logic and API routes
- **Frontend**: Complete component and integration test suite with coverage reporting
- **E2E**: Comprehensive workflow testing covering critical user journeys

### How to Run Tests
```bash
# Run all backend tests with coverage
cd backend
npm test

# Run specific test file
cd backend  
npm test -- users.test.js

# Run E2E tests
cd tests
npm test

# View coverage report
# After running tests, check backend/coverage/index.html
```

### Test File Locations
- **Backend Unit Tests**: `backend/tests/`
- **E2E Tests**: `tests/e2e/`
- **Test Configuration**: `backend/jest.config.js`, `tests/package.json`

## Deployment

### Docker Build Instructions
```bash
# Build backend image
cd backend
docker build -t gap-backend:latest .

# Build frontend image  
cd frontend
docker build -t gap-frontend:latest .

# Or use docker-compose for multi-service build
docker-compose build
```

### Kubernetes Deployment

#### Prerequisites
- Kubernetes cluster (v1.25+)
- kubectl configured
- Traefik ingress controller
- local-path storage provisioner

#### Deploy to Kubernetes
```bash
# Create namespace
kubectl apply -f k8s/gap-namespace.yaml

# Create secrets (replace with secure values)
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
```

#### Environment-specific Configs
- **Development**: Use `.env` files with Docker Compose
- **Production**: Use Kubernetes secrets and config maps
- **Staging**: Separate namespace with staging-specific configs

#### Health Check Endpoints
- **Backend**: `GET /health` (returns 200 OK)
- **Kubernetes**: Liveness and readiness probes configured in deployment manifests

## Security

### Environment Variables for Secrets
- **Never commit secrets** to version control
- Use `.env` files locally (add to `.gitignore`)
- Use Kubernetes secrets in production
- Rotate secrets regularly

### Rate Limiting
- Backend includes rate limiting middleware
- **Registration**: 3 requests per minute per IP (prevents spam)
- **Login**: 5 requests per minute per IP (prevents brute-force attacks)
- **Other routes**: No rate limiting by default
- Configurable via Fastify rate-limit plugin

### Authentication/Authorization
- JWT tokens with configurable expiration
- Role-based access control (RBAC)
- Password hashing with bcrypt
- Secure cookie handling
- CORS protection

### Security Best Practices
- Change default admin credentials immediately
- Use strong JWT secrets in production (32+ characters)
- Enable HTTPS in production
- Set appropriate CORS origins
- Keep dependencies updated (run `npm audit`)
- Use Kubernetes network policies
- Implement proper logging and monitoring

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
│   ├── tests/                 # Backend unit tests
│   ├── package.json
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
│   └── tailwind.config.js
├── k8s/
│   ├── gap-namespace.yaml
│   ├── postgres-deployment.yaml
│   ├── postgres-service.yaml
│   ├── gap-backend-deployment.yaml
│   ├── gap-frontend-deployment.yaml
│   ├── gap-service.yaml
│   └── gap-ingress.yaml
├── tests/                     # E2E tests
│   └── e2e/
│       ├── auth.spec.js
│       ├── registration.spec.js
│       └── rbac.spec.js
├── .github/
│   └── workflows/
│       └── ci.yml            # CI pipeline configuration
├── .husky/                   # Pre-commit hooks
├── docker-compose.yml
└── README.md
```

## Role System

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all features, user management, group management |
| **Team Manager** | View all users, assign users to groups |
| **User** | View own profile, view groups |

## Default Credentials

After running migrations, the admin username and password are set via environment variables:
- **Username:** `admin` (or set `ADMIN_USERNAME` before migration)
- **Password:** Set via `ADMIN_PASSWORD` environment variable before migration
- **Role:** Admin

🚨 **CRITICAL SECURITY WARNING** 🚨
- **NEVER use default credentials in production environments**
- **ALWAYS change `ADMIN_USERNAME` and `ADMIN_PASSWORD` before running migrations**
- **Use strong, randomly generated passwords (16+ characters with mixed case, numbers, and symbols)**
- **Store credentials securely using Kubernetes secrets or environment-specific secret management**
- **Rotate credentials immediately after initial setup**

⚠️ **Failure to change default credentials will result in unauthorized access to your entire system!**

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
npm ci
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

### CI Pipeline Failures
- **Lint errors**: Run `npm run lint:fix` locally before committing
- **Test failures**: Fix failing tests and add missing test cases
- **Formatting issues**: Run `npm run format:write` before committing
- **Build failures**: Ensure all dependencies are properly declared

## License

MIT

## Support

For issues and questions, please open an issue on the repository.