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

# Health check — use node since wget/curl are not available in slim image
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start application
CMD ["node", "src/server.js"]
