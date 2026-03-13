const bcrypt = require('bcrypt');

async function rbacPlugin(fastify, _options) {
  // Decorate fastify with RBAC helpers
  fastify.decorate('checkRole', async (request, reply, requiredRoles) => {
    if (!request.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }

    // Check if user's role is in the allowed roles list (Issue #48)
    if (!requiredRoles.includes(request.user.role)) {
      reply.code(403).send({ error: 'Forbidden: Insufficient permissions' });
      return false;
    }

    return true;
  });

  // Helper to check if user is admin
  fastify.decorate('requireAdmin', async (request, reply) => {
    return fastify.checkRole(request, reply, ['admin']);
  });

  // Helper to check if user is team_manager or admin
  fastify.decorate('requireTeamManager', async (request, reply) => {
    return fastify.checkRole(request, reply, ['team_manager', 'admin']);
  });

  // Password hashing helper
  fastify.decorate('hashPassword', async (password) => {
    return await bcrypt.hash(password, 10);
  });

  // Password verification helper
  fastify.decorate('verifyPassword', async (password, hash) => {
    return await bcrypt.compare(password, hash);
  });
}

module.exports = rbacPlugin;
