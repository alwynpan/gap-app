FROM node:24-slim

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodeuser

WORKDIR /app

# Install dependencies
COPY --chown=nodeuser:nodejs package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY --chown=nodeuser:nodejs . .

USER nodeuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start application
CMD ["node", "src/server.js"]
