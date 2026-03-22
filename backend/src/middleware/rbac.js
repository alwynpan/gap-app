const fp = require('fastify-plugin');

async function rbacPlugin(fastify, _options) {
  // Register bcrypt plugin
  await fastify.register(require('fastify-bcrypt'));

  // Decorate fastify with RBAC helpers
  fastify.decorate('checkRole', async (request, reply, requiredRoles) => {
    if (!request.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }

    const userRole = request.user.role;
    // Admin always has access; otherwise check if user's role is in the allowed list
    if (userRole !== 'admin' && !requiredRoles.includes(userRole)) {
      reply.code(403).send({ error: 'Forbidden: Insufficient permissions' });
      return false;
    }

    return true;
  });

  // Helper to check if user is admin
  fastify.decorate('requireAdmin', async (request, reply) => {
    return fastify.checkRole(request, reply, ['admin']);
  });

  // Helper to check if user is assignment_manager or admin
  fastify.decorate('requireAssignmentManager', async (request, reply) => {
    return fastify.checkRole(request, reply, ['assignment_manager', 'admin']);
  });

  // Password hashing helper
  fastify.decorate('hashPassword', async (password) => {
    return await fastify.bcrypt.hash(password);
  });

  // Password verification helper
  fastify.decorate('verifyPassword', async (password, hash) => {
    return await fastify.bcrypt.compare(password, hash);
  });
}

module.exports = fp(rbacPlugin);
