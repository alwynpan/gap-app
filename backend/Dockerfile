FROM node:24-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace config and package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter gap-backend --prod

# Copy backend source
COPY backend/ backend/

# Create a standalone deployable directory with only production deps
RUN pnpm deploy --filter gap-backend --prod /deploy

# Production stage
FROM node:24-slim

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodeuser

WORKDIR /app

COPY --from=builder --chown=nodeuser:nodejs /deploy .

USER nodeuser

EXPOSE 3001

# Health check — use node since wget/curl are not available in slim image
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
