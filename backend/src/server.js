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
    '/api',
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
            register: 'POST /auth/register',
            login: 'POST /auth/login',
            logout: 'POST /auth/logout',
            me: 'GET /auth/me',
          },
          users: {
            list: 'GET /users (admin/assignment_manager)',
            get: 'GET /users/:id',
            create: 'POST /users (admin/assignment_manager)',
            update: 'PUT /users/:id (admin, or self)',
            updateGroup: 'PUT /users/:id/group (admin/assignment_manager)',
            delete: 'DELETE /users/:id (admin)',
          },
          groups: {
            list: 'GET /groups',
            enabled: 'GET /groups/enabled',
            get: 'GET /groups/:id',
            create: 'POST /groups (admin)',
            update: 'PUT /groups/:id (admin)',
            delete: 'DELETE /groups/:id (admin)',
          },
        },
      };
    }
  );

  // Register routes
  await fastify.register(authRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(groupsRoutes);

  return fastify;
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

// Handle graceful shutdown
let _serverInstance = null;

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (_serverInstance) {
    await _serverInstance.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (_serverInstance) {
    await _serverInstance.close();
  }
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  start();
}

module.exports = { buildServer, start };
