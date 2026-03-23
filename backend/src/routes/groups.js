const Group = require('../models/Group');
const User = require('../models/User');

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
        const groupId = request.params.id;
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
            maxMembers: group.max_members,
            memberCount: group.member_count,
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
        const { name, enabled, maxMembers } = request.body;

        if (!name) {
          return reply.code(400).send({ error: 'Group name is required' });
        }

        if (maxMembers !== undefined && maxMembers !== null) {
          const parsed = parseInt(maxMembers, 10);
          if (isNaN(parsed) || parsed < 1) {
            return reply.code(400).send({ error: 'Max members must be a positive integer' });
          }
        }

        // Check if group name already exists
        const existingGroups = await Group.findAll();
        const existingGroup = existingGroups.find((g) => g.name.toLowerCase() === name.toLowerCase());
        if (existingGroup) {
          return reply.code(409).send({ error: 'Group name already exists' });
        }

        const parsedMax = maxMembers !== null && maxMembers !== undefined ? parseInt(maxMembers, 10) : null;
        const newGroup = await Group.create(name, enabled !== false, parsedMax);

        return reply.code(201).send({
          message: 'Group created successfully',
          group: {
            id: newGroup.id,
            name: newGroup.name,
            enabled: newGroup.enabled,
            maxMembers: newGroup.max_members,
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
        const groupId = request.params.id;
        const { name, enabled, maxMembers } = request.body;

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        // Validate maxMembers if provided
        if (maxMembers !== undefined && maxMembers !== null) {
          const parsed = parseInt(maxMembers, 10);
          if (isNaN(parsed) || parsed < 1) {
            return reply.code(400).send({ error: 'Max members must be a positive integer' });
          }
          // Check current member count doesn't exceed new limit
          const memberCount = await Group.getMemberCount(groupId);
          if (memberCount > parsed) {
            return reply
              .code(400)
              .send({ error: `Group already has ${memberCount} members, cannot set limit to ${parsed}` });
          }
        }

        const updates = { name, enabled };
        if (maxMembers !== undefined) {
          updates.maxMembers = maxMembers !== null && maxMembers !== undefined ? parseInt(maxMembers, 10) : null;
        }

        const updatedGroup = await Group.update(groupId, updates);

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
        const groupId = request.params.id;

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

  // Join a group (any authenticated user)
  fastify.post(
    '/groups/:id/join',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const groupId = request.params.id;
        const userId = request.user.id;

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        if (!group.enabled) {
          return reply.code(400).send({ error: 'Cannot join a disabled group' });
        }

        // Check user is not already in a group
        const user = await User.findById(userId);
        if (user.group_id) {
          return reply.code(400).send({ error: 'You are already in a group. Leave your current group first.' });
        }

        // Check group capacity
        if (group.max_members !== null && group.member_count >= group.max_members) {
          return reply.code(409).send({ error: 'Group is full' });
        }

        await User.updateGroup(userId, groupId);

        return reply.send({ message: 'Successfully joined group', groupId, groupName: group.name });
      } catch (error) {
        console.error('Join group error:', error);
        return reply.code(500).send({ error: 'Failed to join group' });
      }
    }
  );

  // Leave a group (any authenticated user)
  fastify.post(
    '/groups/:id/leave',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const groupId = request.params.id;
        const userId = request.user.id;

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        // Check user is actually in this group
        const user = await User.findById(userId);
        if (user.group_id !== groupId) {
          return reply.code(400).send({ error: 'You are not a member of this group' });
        }

        await User.updateGroup(userId, null);

        return reply.send({ message: 'Successfully left group' });
      } catch (error) {
        console.error('Leave group error:', error);
        return reply.code(500).send({ error: 'Failed to leave group' });
      }
    }
  );
}

module.exports = groupsRoutes;
