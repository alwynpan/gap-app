'use strict';

const Config = require('../models/Config');
const { parseBody, updateConfigSchema } = require('../utils/schemas');

const ALLOWED_KEYS = ['group_join_locked'];

async function configRoutes(fastify, _options) {
  // Get group-join-locked status (authenticated users)
  fastify.get(
    '/config/group-join-locked',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (_request, reply) => {
      try {
        const value = await Config.get('group_join_locked');
        return reply.send({ locked: value === 'true' });
      } catch (error) {
        console.error('Get config error:', error);
        return reply.code(500).send({ error: 'Failed to retrieve config' });
      }
    }
  );

  // Get all config values (admin/AM only)
  fastify.get(
    '/config',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.checkRole(request, reply, ['admin', 'assignment_manager']);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (_request, reply) => {
      try {
        const rows = await Config.getAll();
        return reply.send({ config: rows });
      } catch (error) {
        console.error('Get all config error:', error);
        return reply.code(500).send({ error: 'Failed to retrieve config' });
      }
    }
  );

  // Update a config value (admin/AM only)
  fastify.put(
    '/config/:key',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.checkRole(request, reply, ['admin', 'assignment_manager']);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (request, reply) => {
      try {
        const { key } = request.params;

        if (!ALLOWED_KEYS.includes(key)) {
          return reply.code(400).send({ error: `Invalid config key: ${key}` });
        }

        const { data: body, error: validationError } = parseBody(updateConfigSchema, request.body || {});
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const updated = await Config.set(key, body.value);
        return reply.send({ message: 'Config updated successfully', config: updated });
      } catch (error) {
        console.error('Update config error:', error);
        return reply.code(500).send({ error: 'Failed to update config' });
      }
    }
  );
}

module.exports = configRoutes;
