const bcrypt = require('bcryptjs');

async function rbacPlugin(fastify, options) {
  // Role hierarchy: admin > team_manager > user
  const roleHierarchy = {
    admin: 3,
    team_manager: 2,
    user: 1,
  };

  // Decorate fastify with RBAC helpers
  fastify.decorate('checkRole', async (request, reply, requiredRoles) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const userRoleLevel = roleHierarchy[request.user.role] || 0;
    const requiredLevel = Math.max(
      ...requiredRoles.map((role) => roleHierarchy[role] || 0)
    );

    if (userRoleLevel < requiredLevel) {
      return reply.code(403).send({ error: 'Forbidden: Insufficient permissions' });
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
    return await bcrypt.hash(password);
  });

  // Password verification helper
  fastify.decorate('verifyPassword', async (password, hash) => {
    return await bcrypt.compare(password, hash);
  });
}

module.exports = rbacPlugin;
