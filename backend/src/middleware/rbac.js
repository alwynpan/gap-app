const fp = require('fastify-plugin');
const Assignment = require('../models/Assignment');

async function rbacPlugin(fastify, _options) {
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

  // Scoped check: admin always passes; an assignment_manager passes only for
  // assignments they manage (assignment_managers table). Everyone else is 403.
  fastify.decorate('assertManagesAssignment', async (request, reply, assignmentId) => {
    if (!request.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }

    if (request.user.role === 'admin') {
      return true;
    }

    if (request.user.role === 'assignment_manager' && (await Assignment.isManager(request.user.id, assignmentId))) {
      return true;
    }

    reply.code(403).send({ error: 'Forbidden: You do not manage this assignment' });
    return false;
  });
}

module.exports = fp(rbacPlugin);
