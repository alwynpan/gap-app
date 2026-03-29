const Group = require('../models/Group');
const User = require('../models/User');
const Config = require('../models/Config');
const {
  parseBody,
  createGroupSchema,
  updateGroupSchema,
  validateUUID,
  importGroupMappingRowSchema,
} = require('../utils/schemas');

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
        if (!validateUUID(groupId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
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
        const { data: body, error: validationError } = parseBody(createGroupSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const { name, enabled, maxMembers } = body;

        // Check if group name already exists
        const existingGroups = await Group.findAll();
        const existingGroup = existingGroups.find((g) => g.name.toLowerCase() === name.toLowerCase());
        if (existingGroup) {
          return reply.code(409).send({ error: 'Group name already exists' });
        }

        const newGroup = await Group.create(name, enabled !== false, maxMembers ?? null);

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
        if (!validateUUID(groupId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        const { data: body, error: validationError } = parseBody(updateGroupSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const { name, enabled, maxMembers } = body;

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        // Validate maxMembers if provided
        if (maxMembers !== undefined && maxMembers !== null) {
          // Check current member count doesn't exceed new limit
          const memberCount = await Group.getMemberCount(groupId);
          if (memberCount > maxMembers) {
            return reply
              .code(400)
              .send({ error: `Group already has ${memberCount} members, cannot set limit to ${maxMembers}` });
          }
        }

        const updates = { name, enabled };
        if (maxMembers !== undefined) {
          updates.maxMembers = maxMembers;
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
        if (!validateUUID(groupId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }

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
        if (!validateUUID(groupId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        const userId = request.user.id;

        // Check system-level group join lock for normal users
        const locked = await Config.get('group_join_locked');
        if (locked === 'true') {
          const userRole = request.user.role;
          if (userRole !== 'admin' && userRole !== 'assignment_manager') {
            return reply
              .code(403)
              .send({ error: 'Group joining is currently locked. Please contact the teaching staff.' });
          }
        }

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        if (!group.enabled) {
          return reply.code(400).send({ error: 'Cannot join a disabled group' });
        }

        // Check user is not already in a group
        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }
        if (user.group_id) {
          return reply.code(400).send({ error: 'You are already in a group. Leave your current group first.' });
        }

        // Optimistic capacity pre-check (fast path) — the transactional lock inside
        // assignUserToGroup prevents race conditions for near-simultaneous requests
        if (group.max_members !== null && group.member_count >= group.max_members) {
          return reply.code(409).send({ error: 'Group is full' });
        }

        // Assign user to group inside a transaction with row-level lock to prevent race conditions (H2)
        await Group.assignUserToGroup(userId, groupId);

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
        if (!validateUUID(groupId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        const userId = request.user.id;

        // Check system-level group join lock for normal users
        const locked = await Config.get('group_join_locked');
        if (locked === 'true') {
          const userRole = request.user.role;
          if (userRole !== 'admin' && userRole !== 'assignment_manager') {
            return reply
              .code(403)
              .send({ error: 'Group joining is currently locked. Please contact the teaching staff.' });
          }
        }

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        // Check user is actually in this group
        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }
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
  // Import user-group mappings from CSV (admin/AM only)
  fastify.post(
    '/groups/import-mappings',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.requireAssignmentManager(request, reply);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (request, reply) => {
      try {
        const { rows } = request.body || {};

        if (!Array.isArray(rows) || rows.length === 0) {
          return reply.code(400).send({ error: 'No mappings to import' });
        }

        let imported = 0;
        const skipped = [];
        const errors = [];

        for (const rawRow of rows) {
          if (rawRow.action === 'skip') {
            skipped.push({ email: rawRow.email, groupName: rawRow.groupName, reason: rawRow.skipReason || 'Skipped' });
            continue;
          }

          const parseResult = importGroupMappingRowSchema.safeParse(rawRow);
          if (!parseResult.success) {
            errors.push({
              email: rawRow.email || '?',
              groupName: rawRow.groupName || '?',
              error: parseResult.error.issues[0]?.message || 'Validation failed',
            });
            continue;
          }

          const { email, groupName } = parseResult.data;

          try {
            const user = await User.findByEmail(email);
            if (!user) {
              skipped.push({ email, groupName, reason: 'User not found' });
              continue;
            }

            if (user.role_name === 'admin' || user.role_name === 'assignment_manager') {
              skipped.push({
                email,
                groupName,
                reason: 'Admins and Assignment Managers cannot be assigned to a group',
              });
              continue;
            }

            const group = await Group.findByName(groupName);
            if (!group) {
              skipped.push({ email, groupName, reason: 'Group not found' });
              continue;
            }

            await Group.assignUserToGroup(user.id, group.id);
            imported++;
          } catch (rowErr) {
            const reason = rowErr.statusCode === 409 ? 'Group is full' : rowErr.message;
            errors.push({ email, groupName: rawRow.groupName, error: reason });
          }
        }

        return reply.send({ imported, skipped, errors });
      } catch (error) {
        console.error('Import group mappings error:', error);
        return reply.code(500).send({ error: 'Failed to import mappings' });
      }
    }
  );

  // Export user-group mappings to CSV (admin/AM only)
  fastify.get(
    '/groups/export-mappings',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.requireAssignmentManager(request, reply);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (request, reply) => {
      try {
        const rows = await Group.getExportMappings();
        const mappings = rows.map((r) => ({ email: r.email, groupName: r.group_name }));
        return reply.send({ mappings });
      } catch (error) {
        console.error('Export group mappings error:', error);
        return reply.code(500).send({ error: 'Failed to export mappings' });
      }
    }
  );
}

module.exports = groupsRoutes;
