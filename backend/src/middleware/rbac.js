const bcrypt = require('bcrypt');

async function rbacPlugin(fastify, _options) {
  // Role hierarchy: admin > team_manager > user
  const roleHierarchy = {
    admin: 3,
    team_manager: 2,
    user: 1,
  };

  // Decorate fastify with RBAC helpers
  fastify.decorate('checkRole', async (request, reply, requiredRoles) => {
    if (!request.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }

    // Fix #48: Check if user's role is IN the allowed roles array (not Math.max)
    // This allows any of the specified roles, not just the highest-ranking one
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
