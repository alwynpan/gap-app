const Group = require('../models/Group');

async function groupsRoutes(fastify, _options) {
  // Get all groups (authenticated users)
  fastify.get(
    '/groups',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const groups = await Group.findAll();
        return reply.send({ groups });
      } catch (error) {
        console.error('Get groups error:', error);
        return reply.code(500).send({ error: 'Failed to retrieve groups' });
      }
    }
  );

  // Get enabled groups only (for user assignment dropdowns)
  fastify.get(
    '/groups/enabled',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const groups = await Group.findEnabled();
        return reply.send({ groups });
      } catch (error) {
        console.error('Get enabled groups error:', error);
        return reply.code(500).send({ error: 'Failed to retrieve groups' });
      }
    }
  );

  // Get group by ID
  fastify.get(
    '/groups/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const groupId = parseInt(request.params.id, 10);
        const group = await Group.findById(groupId);

        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        // Get group members
        const members = await Group.getMembers(groupId);

        return reply.send({
          group: {
            id: group.id,
            name: group.name,
            enabled: group.enabled,
            createdAt: group.created_at,
            updatedAt: group.updated_at,
          },
          members,
        });
      } catch (error) {
        console.error('Get group error:', error);
        return reply.code(500).send({ error: 'Failed to retrieve group' });
      }
    }
  );

  // Create new group (admin only)
  fastify.post(
    '/groups',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.requireAdmin(request, reply);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (request, reply) => {
      try {
        const { name, enabled } = request.body;

        if (!name) {
          return reply.code(400).send({ error: 'Group name is required' });
        }

        // Check if group name already exists
        const existingGroups = await Group.findAll();
        const existingGroup = existingGroups.find((g) => g.name.toLowerCase() === name.toLowerCase());
        if (existingGroup) {
          return reply.code(409).send({ error: 'Group name already exists' });
        }

        const newGroup = await Group.create(name, enabled !== false);

        return reply.code(201).send({
          message: 'Group created successfully',
          group: {
            id: newGroup.id,
            name: newGroup.name,
            enabled: newGroup.enabled,
          },
        });
      } catch (error) {
        console.error('Create group error:', error);
        return reply.code(500).send({ error: 'Failed to create group' });
      }
    }
  );

  // Update group (admin only)
  fastify.put(
    '/groups/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.requireAdmin(request, reply);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (request, reply) => {
      try {
        const groupId = parseInt(request.params.id, 10);
        const { name, enabled } = request.body;

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        const updatedGroup = await Group.update(groupId, { name, enabled });

        return reply.send({
          message: 'Group updated successfully',
          group: updatedGroup,
        });
      } catch (error) {
        console.error('Update group error:', error);
        return reply.code(500).send({ error: 'Failed to update group' });
      }
    }
  );

  // Delete group (admin only)
  fastify.delete(
    '/groups/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.requireAdmin(request, reply);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (request, reply) => {
      try {
        const groupId = parseInt(request.params.id, 10);

        const deletedGroup = await Group.delete(groupId);

        if (!deletedGroup) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        return reply.send({ message: 'Group deleted successfully' });
      } catch (error) {
        console.error('Delete group error:', error);
        return reply.code(500).send({ error: 'Failed to delete group' });
      }
    }
  );
}

module.exports = groupsRoutes;
