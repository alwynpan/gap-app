const Fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const config = require('./config/index');
const { logger } = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const groupsRoutes = require('./routes/groups');
const configRoutes = require('./routes/config');

// Import plugins
const authPlugin = require('./middleware/auth');
const rbacPlugin = require('./middleware/rbac');

async function buildServer({ logger: disableLogger } = {}) {
  // We manage logging ourselves via hooks; disable Fastify's built-in Pino logger.
  // Pass logger:false in tests (via buildTestServer) to suppress all log output.
  const enableLogging = disableLogger !== false && config.app.nodeEnv !== 'test';

  const fastify = Fastify({ logger: false });

  // Register security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable for API
  });

  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  const isDev = config.app.nodeEnv === 'development';
  // Register rate limiting (enables per-route rateLimit config)
  // Stricter limit by default (production-safe); relaxed only in dev for e2e tests
  await fastify.register(rateLimit, {
    max: isDev ? 5000 : 100,
    timeWindow: '1 minute',
  });

  // Register authentication and RBAC plugins
  await fastify.register(authPlugin);
  await fastify.register(rbacPlugin);

  // JWT decorator for token verification
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: err.message });
      throw err;
    }
  });

  // Access logging — record start time on every request
  fastify.addHook('onRequest', async (request) => {
    request._startTime = Date.now();
  });

  // Access logging — emit a structured line after each response is sent
  fastify.addHook('onResponse', async (request, reply) => {
    if (!enableLogging) {
      return;
    }
    const duration = Date.now() - (request._startTime || Date.now());
    const ip = (request.headers['x-forwarded-for'] || '').split(',')[0].trim() || request.ip || 'unknown';
    const status = reply.statusCode;
    const meta = { ip, duration: `${duration}ms` };
    if (request.user?.id) {
      meta.userId = request.user.id;
    }
    if (request.user?.role) {
      meta.role = request.user.role;
    }
    const safeUrl = request.url.replace(/[\r\n\x1b]/g, ''); // eslint-disable-line no-control-regex
    const line = `${request.method} ${safeUrl} ${status}`;
    if (status >= 500) {
      logger.error(line, meta);
    } else if (status >= 400) {
      logger.warn(line, meta);
    } else {
      logger.info(line, meta);
    }
  });

  // PreHandler to attach user to request
  fastify.addHook('preHandler', async (request, _reply) => {
    if (request.headers.authorization) {
      try {
        const token = request.headers.authorization.replace('Bearer ', '');
        const decoded = await fastify.verifyToken(token);
        request.user = decoded;
      } catch (_err) {
        // Token invalid, but don't fail - let route-specific auth handle it
        request.user = null;
      }
    }
  });

  // Health check endpoint
  fastify.get('/health', async (_request, _reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API Info endpoint (authenticated only — avoids leaking endpoint structure)
  fastify.get(
    '/api/info',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (_request, _reply) => {
      return {
        name: 'G.A.P. Portal API',
        version: '1.0.0',
        endpoints: {
          auth: {
            register: 'POST /api/auth/register',
            login: 'POST /api/auth/login',
            logout: 'POST /api/auth/logout',
            me: 'GET /api/auth/me',
          },
          users: {
            list: 'GET /api/users (admin/assignment_manager)',
            get: 'GET /api/users/:id',
            create: 'POST /api/users (admin/assignment_manager)',
            update: 'PUT /api/users/:id (admin, or self)',
            updateGroup: 'PUT /api/users/:id/group (admin/assignment_manager)',
            delete: 'DELETE /api/users/:id (admin)',
          },
          groups: {
            list: 'GET /api/groups',
            enabled: 'GET /api/groups/enabled',
            get: 'GET /api/groups/:id',
            create: 'POST /api/groups (admin)',
            update: 'PUT /api/groups/:id (admin)',
            delete: 'DELETE /api/groups/:id (admin)',
          },
        },
      };
    }
  );

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api' });
  await fastify.register(usersRoutes, { prefix: '/api' });
  await fastify.register(groupsRoutes, { prefix: '/api' });
  await fastify.register(configRoutes, { prefix: '/api' });

  return fastify;
}

// Handle graceful shutdown
let _serverInstance = null;

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  try {
    if (_serverInstance) {
      await _serverInstance.close();
    }
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { err: err.message });
    process.exit(1);
  }
}

// Start server
async function start() {
  try {
    const fastify = await buildServer();
    _serverInstance = fastify;

    await fastify.listen({
      port: config.app.port,
      host: config.app.host,
    });

    logger.info(`G.A.P. Backend server running at http://${config.app.host}:${config.app.port}`);
    logger.info(`Environment: ${config.app.nodeEnv}`);
    logger.info(`Registration: ${config.app.registrationEnabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    logger.error('Failed to start server', { err: err.message });
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((err) => {
      logger.error('Error during graceful shutdown on SIGTERM', { err: err.message });
      process.exit(1);
    });
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((err) => {
      logger.error('Error during graceful shutdown on SIGINT', { err: err.message });
      process.exit(1);
    });
  });
  start();
}

module.exports = { buildServer, start };
