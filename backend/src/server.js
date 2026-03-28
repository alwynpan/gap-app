const Fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const config = require('./config/index');

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const groupsRoutes = require('./routes/groups');

// Import plugins
const authPlugin = require('./middleware/auth');
const rbacPlugin = require('./middleware/rbac');

async function buildServer() {
  const fastify = Fastify({
    logger: config.app.nodeEnv !== 'production',
  });

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

  return fastify;
}

// Handle graceful shutdown
let _serverInstance = null;

async function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  try {
    if (_serverInstance) {
      await _serverInstance.close();
    }
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
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

    console.log(`🚀 G.A.P. Backend server running at http://${config.app.host}:${config.app.port}`);
    console.log(`📝 Environment: ${config.app.nodeEnv}`);
    console.log(`🔐 Registration: ${config.app.registrationEnabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((err) => {
      console.error('Error during graceful shutdown on SIGTERM:', err);
      process.exit(1);
    });
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((err) => {
      console.error('Error during graceful shutdown on SIGINT:', err);
      process.exit(1);
    });
  });
  start();
}

module.exports = { buildServer, start };
