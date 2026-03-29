# Build stage
FROM node:24-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM cgr.dev/chainguard/nginx:latest

USER root

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER nginx

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080
