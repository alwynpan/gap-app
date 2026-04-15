# Build stage
FROM node:24-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace config and package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY frontend/package.json frontend/

# Install all dependencies (vite is a devDependency needed for building)
RUN pnpm install --frozen-lockfile --filter gap-frontend

# Copy frontend source
COPY frontend/ frontend/

# GIT_HASH injected by CI/CD via --build-arg; defaults to 'unknown'
ARG GIT_HASH=unknown
ENV GIT_HASH=${GIT_HASH}

# Build application
WORKDIR /app/frontend
RUN pnpm exec vite build

# Production stage
FROM cgr.dev/chainguard/nginx:latest

USER root

# Copy nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

USER nginx

# Copy built assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 8080
