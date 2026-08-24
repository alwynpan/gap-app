const Group = require('../models/Group');
const UserGroup = require('../models/UserGroup');
const Assignment = require('../models/Assignment');
const Subject = require('../models/Subject');
const {
  parseBody,
  createGroupSchema,
  updateGroupSchema,
  bulkCreateGroupsSchema,
  validateUUID,
} = require('../utils/schemas');
const { logger } = require('../utils/logger');

const MAX_BULK_DELETE = 2000;

/**
 * Whether the caller is exempt from an assignment's join lock.
 *
 * Scoped, not role-wide: an AM who does not manage THIS assignment is an
 * ordinary participant here and must obey its lock, exactly like a student.
 */
async function isLockExempt(request, assignmentId) {
  const { role, id: userId } = request.user;
  if (role === 'admin') {
    return true;
  }
  return role === 'assignment_manager' && Assignment.isManager(userId, assignmentId);
}

/**
 * Reject a non-exempt caller when the assignment is locked.
 *
 * This is a fast path for a clear error message; the model re-checks the lock
 * inside the write transaction, which is what actually closes the race.
 *
 * @returns {Promise<boolean>} false when the caller has been rejected.
 */
async function assertJoinUnlocked(request, reply, assignmentId, exempt) {
  if (exempt) {
    return true;
  }
  const assignment = await Assignment.findById(assignmentId);
  if (assignment?.join_locked) {
    reply
      .code(403)
      .send({ error: 'Group joining is currently locked for this assignment. Please contact the teaching staff.' });
    return false;
  }
  return true;
}

async function groupsRoutes(fastify, _options) {
  // Get group by ID (admin, subject members, or managing assignment managers)
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

        // Scope: admin, subject member, or assignment manager of the parent assignment
        const user = request.user;
        let allowed = user.role === 'admin';
        if (!allowed) {
          allowed = await Subject.isMember(group.subject_id, user.id);
        }
        if (!allowed && user.role === 'assignment_manager') {
          allowed = await Assignment.isManager(user.id, group.assignment_id);
        }
        if (!allowed) {
          return reply.code(403).send({ error: 'Forbidden: You do not have access to this group' });
        }

        // Get group members
        const members = await UserGroup.getMembers(groupId);

        return reply.send({
          group: {
            id: group.id,
            name: group.name,
            enabled: group.enabled,
            maxMembers: group.max_members,
            memberCount: group.member_count,
            assignmentId: group.assignment_id,
            assignmentName: group.assignment_name,
            subjectId: group.subject_id,
            subjectName: group.subject_name,
            createdAt: group.created_at,
            updatedAt: group.updated_at,
          },
          members,
        });
      } catch (error) {
        logger.error('Get group error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve group' });
      }
    }
  );

  // Create new group (admin or managing assignment manager)
  fastify.post(
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
        const { data: body, error: validationError } = parseBody(createGroupSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const { assignmentId, name, enabled, maxMembers } = body;

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await fastify.assertManagesAssignment(request, reply, assignmentId);
        if (!allowed) {
          return reply;
        }

        // Check if group name already exists within the assignment
        const existingGroup = await Group.findByName(assignmentId, name);
        if (existingGroup) {
          return reply.code(409).send({ error: 'Group name already exists' });
        }

        const newGroup = await Group.create(assignmentId, name, enabled !== false, maxMembers ?? null);

        return reply.code(201).send({
          message: 'Group created successfully',
          group: {
            id: newGroup.id,
            name: newGroup.name,
            enabled: newGroup.enabled,
            maxMembers: newGroup.max_members,
            assignmentId: newGroup.assignment_id,
          },
        });
      } catch (error) {
        // Migration 016 enforces case-insensitive names, so a concurrent create
        // loses the race here rather than at the application precheck.
        if (error.code === '23505') {
          return reply.code(409).send({ error: 'Group name already exists' });
        }
        logger.error('Create group error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to create group' });
      }
    }
  );

  // Bulk create groups (admin or managing assignment manager)
  fastify.post(
    '/groups/bulk',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const { data: body, error: validationError } = parseBody(bulkCreateGroupsSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const { assignmentId, groups: items } = body;

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await fastify.assertManagesAssignment(request, reply, assignmentId);
        if (!allowed) {
          return reply;
        }

        const parsed = items.map((item) => ({
          name: item.name,
          enabled: item.enabled !== false,
          maxMembers: item.maxMembers ?? null,
        }));

        // Reject duplicate names within the batch (case-insensitive)
        const lowerNames = parsed.map((g) => g.name.toLowerCase());
        const uniqueNames = new Set(lowerNames);
        if (uniqueNames.size !== parsed.length) {
          return reply.code(400).send({ error: 'Duplicate group names within the batch are not allowed' });
        }

        // Reject names that already exist within the assignment, listing conflicts
        const existing = await Group.findByNames(
          assignmentId,
          parsed.map((g) => g.name)
        );
        if (existing.length > 0) {
          const conflictNames = existing.map((g) => g.name).join(', ');
          return reply.code(409).send({ error: `One or more group names already exist: ${conflictNames}` });
        }

        const groups = await Group.bulkCreate(assignmentId, parsed);

        return reply.code(201).send({
          message: 'Groups created successfully',
          groups,
        });
      } catch (error) {
        logger.error('Bulk create groups error', { err: error.message, code: error.code });
        if (error.code === '23505') {
          return reply.code(409).send({ error: 'One or more group names already exist' });
        }
        return reply.code(500).send({ error: 'Failed to create groups' });
      }
    }
  );

  // Update group (admin or managing assignment manager)
  fastify.put(
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

        const allowed = await fastify.assertManagesAssignment(request, reply, group.assignment_id);
        if (!allowed) {
          return reply;
        }

        const { data: body, error: validationError } = parseBody(updateGroupSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const { name, enabled, maxMembers } = body;

        // If renaming, check the name is not taken by a different group in the assignment
        if (name !== undefined) {
          const existingGroup = await Group.findByName(group.assignment_id, name);
          if (existingGroup && existingGroup.id !== groupId) {
            return reply.code(409).send({ error: 'Group name already exists' });
          }
        }

        const updates = { name, enabled };
        if (maxMembers !== undefined) {
          updates.maxMembers = maxMembers;
        }

        // Validates a lowered maxMembers against the live count under the group
        // lock, so a concurrent join cannot land between check and write.
        const updatedGroup = await Group.updateWithCapacityCheck(groupId, updates);
        if (!updatedGroup) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        return reply.send({
          message: 'Group updated successfully',
          group: updatedGroup,
        });
      } catch (error) {
        if (error.statusCode && error.statusCode < 500) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        // Migration 016 enforces case-insensitive names, so a concurrent create
        // loses the race here rather than at the application precheck.
        if (error.code === '23505') {
          return reply.code(409).send({ error: 'Group name already exists' });
        }
        logger.error('Update group error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update group' });
      }
    }
  );

  // Bulk delete groups (admin, or assignment manager for assignments they manage)
  fastify.delete(
    '/groups/bulk',
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
        const { ids } = request.body || {};

        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK_DELETE) {
          return reply.code(400).send({ error: 'ids must be a non-empty array of up to 2000 items' });
        }

        const invalidIds = ids.filter((id) => !validateUUID(id));
        if (invalidIds.length > 0) {
          return reply.code(400).send({ error: 'One or more IDs have an invalid format' });
        }

        const uniqueIds = [...new Set(ids)];

        // Assignment managers may only delete groups of assignments they manage
        if (request.user.role !== 'admin') {
          const groups = await Group.findByIds(uniqueIds);
          const assignmentIds = [...new Set(groups.map((g) => g.assignment_id))];
          for (const assignmentId of assignmentIds) {
            if (!(await Assignment.isManager(request.user.id, assignmentId))) {
              return reply.code(403).send({ error: 'Forbidden: You do not manage this assignment' });
            }
          }
        }

        const deleted = await Group.bulkDelete(uniqueIds);
        return reply.send({ message: 'Groups deleted successfully', deleted });
      } catch (error) {
        logger.error('Bulk delete groups error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to delete groups' });
      }
    }
  );

  // Delete group (admin or managing assignment manager)
  fastify.delete(
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

        const allowed = await fastify.assertManagesAssignment(request, reply, group.assignment_id);
        if (!allowed) {
          return reply;
        }

        await Group.delete(groupId);

        return reply.send({ message: 'Group deleted successfully' });
      } catch (error) {
        logger.error('Delete group error', { err: error.message, code: error.code });
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

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        if (!group.enabled) {
          return reply.code(400).send({ error: 'Cannot join a disabled group' });
        }

        // Join lock is per assignment; staff may still place members while locked.
        const exempt = await isLockExempt(request, group.assignment_id);
        const unlocked = await assertJoinUnlocked(request, reply, group.assignment_id, exempt);
        if (!unlocked) {
          return reply;
        }

        // Assign user to group inside a transaction with row-level lock; the model
        // enforces subject membership (403), one-group-per-assignment (409), and
        // capacity (409) via errors carrying a statusCode.
        // enforcePolicy: the lock/enabled checks above are a fast path for a clear
        // error message; the transaction re-checks them from the locked rows.
        await UserGroup.assignUserToGroup(userId, groupId, { replace: false, enforcePolicy: !exempt });

        return reply.send({ message: 'Successfully joined group', groupId, groupName: group.name });
      } catch (error) {
        if (error.statusCode) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        logger.error('Join group error', { err: error.message, code: error.code });
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

        const group = await Group.findById(groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }

        const exempt = await isLockExempt(request, group.assignment_id);
        const unlocked = await assertJoinUnlocked(request, reply, group.assignment_id, exempt);
        if (!unlocked) {
          return reply;
        }

        // Delete only if the membership still points at this group, so a
        // reassignment made after the caller loaded the page is not silently
        // removed by their stale leave request.
        const removed = await UserGroup.leaveGroup(userId, group.assignment_id, groupId, { enforcePolicy: !exempt });
        if (!removed) {
          return reply.code(400).send({ error: 'You are not a member of this group' });
        }

        return reply.send({ message: 'Successfully left group' });
      } catch (error) {
        // leaveGroup raises a 403 when the assignment was locked mid-request.
        if (error.statusCode && error.statusCode < 500) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        logger.error('Leave group error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to leave group' });
      }
    }
  );
}

module.exports = groupsRoutes;
