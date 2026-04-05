const Group = require('../models/Group');
const User = require('../models/User');
const Config = require('../models/Config');
const {
  sanitize,
  parseBody,
  createGroupSchema,
  updateGroupSchema,
  validateUUID,
  importGroupMappingRowSchema,
  bulkCreateGroupItemSchema,
  BULK_CREATE_MAX,
} = require('../utils/schemas');

const _parsedImportMax = parseInt(process.env.MAX_IMPORT_SIZE || '2000', 10);
const MAX_IMPORT_MAPPINGS = Number.isNaN(_parsedImportMax) ? 2000 : _parsedImportMax;

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
        const existingGroup = await Group.findByName(name);
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

  // Bulk create groups (admin only)
  fastify.post(
    '/groups/bulk',
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
        const body = request.body;

        if (!Array.isArray(body)) {
          return reply.code(400).send({ error: 'Request body must be a non-empty array' });
        }

        if (body.length === 0) {
          return reply.code(400).send({ error: 'Request body must be a non-empty array' });
        }

        if (body.length > BULK_CREATE_MAX) {
          return reply.code(400).send({ error: `Batch size exceeds maximum of ${BULK_CREATE_MAX} groups per request` });
        }

        // Validate each item and collect parsed results
        const parsed = [];
        for (let i = 0; i < body.length; i++) {
          // eslint-disable-next-line security/detect-object-injection
          const result = bulkCreateGroupItemSchema.safeParse(body[i]);
          if (!result.success) {
            const msg = result.error.issues[0]?.message || 'Validation failed';
            return reply.code(400).send({ error: `items[${i}]: ${msg}` });
          }
          parsed.push({
            name: result.data.name,
            enabled: result.data.enabled !== false,
            maxMembers: result.data.maxMembers ?? null,
          });
        }

        // Reject duplicate names within the batch (case-insensitive)
        const lowerNames = parsed.map((g) => g.name.toLowerCase());
        const uniqueNames = new Set(lowerNames);
        if (uniqueNames.size !== parsed.length) {
          return reply.code(400).send({ error: 'Duplicate group names within the batch are not allowed' });
        }

        const groups = await Group.bulkCreate(parsed);

        return reply.code(201).send({
          message: 'Groups created successfully',
          groups,
        });
      } catch (error) {
        console.error('Bulk create groups error:', error);
        if (error.code === '23505') {
          return reply.code(409).send({ error: 'One or more group names already exist' });
        }
        return reply.code(500).send({ error: 'Failed to create groups' });
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

  // Bulk delete groups (admin only)
  fastify.delete(
    '/groups/bulk',
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
        const { ids } = request.body || {};

        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000) {
          return reply.code(400).send({ error: 'ids must be a non-empty array of up to 2000 items' });
        }

        const invalidIds = ids.filter((id) => !validateUUID(id));
        if (invalidIds.length > 0) {
          return reply.code(400).send({ error: 'One or more IDs have an invalid format' });
        }

        const deleted = await Group.bulkDelete(ids);
        return reply.send({ message: 'Groups deleted successfully', deleted });
      } catch (error) {
        console.error('Bulk delete groups error:', error);
        return reply.code(500).send({ error: 'Failed to delete groups' });
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
        if (!user.enabled) {
          return reply.code(403).send({ error: 'Account is disabled' });
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
        if (!user.enabled) {
          return reply.code(403).send({ error: 'Account is disabled' });
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

        if (rows.length > MAX_IMPORT_MAPPINGS) {
          return reply.code(400).send({ error: `Import exceeds maximum of ${MAX_IMPORT_MAPPINGS} rows` });
        }

        let imported = 0;
        const skipped = [];
        const errors = [];

        for (const rawRow of rows) {
          if (rawRow.action === 'skip') {
            const email = typeof rawRow.email === 'string' ? sanitize(rawRow.email).slice(0, 255) : '?';
            const groupName = typeof rawRow.groupName === 'string' ? sanitize(rawRow.groupName).slice(0, 100) : '?';
            const rawReason = typeof rawRow.skipReason === 'string' ? rawRow.skipReason : '';
            const reason = sanitize(rawReason).slice(0, 500) || 'Skipped';
            skipped.push({ email, groupName, reason });
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
            const reason = rowErr.statusCode === 409 ? 'Group is full' : 'Failed to process row';
            console.error('Import mapping row error:', rowErr);
            errors.push({ email, groupName, error: reason });
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
