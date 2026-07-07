const Subject = require('../models/Subject');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const UserGroup = require('../models/UserGroup');
const {
  parseBody,
  createSubjectSchema,
  updateSubjectSchema,
  addSubjectUsersSchema,
  setMemberEnabledSchema,
  validateUUID,
} = require('../utils/schemas');
const { logger } = require('../utils/logger');

async function subjectsRoutes(fastify, _options) {
  // Get all subjects, scoped to the caller's role (any authenticated user)
  fastify.get(
    '/subjects',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const rows = await Subject.findAll();
        const { role, id: userId } = request.user;

        let subjects;
        if (role === 'admin') {
          subjects = rows;
        } else if (role === 'assignment_manager') {
          // Subjects containing assignments they manage, union subjects they are members of
          const [managed, memberOf] = await Promise.all([
            Assignment.findManagedBy(userId),
            Subject.findForUser(userId),
          ]);
          const allowedIds = new Set([...managed.map((a) => a.subject_id), ...memberOf.map((s) => s.id)]);
          subjects = rows.filter((s) => allowedIds.has(s.id));
        } else {
          const memberOf = await Subject.findForUser(userId);
          const allowedIds = new Set(memberOf.map((s) => s.id));
          subjects = rows.filter((s) => allowedIds.has(s.id));
        }

        return reply.send({ subjects });
      } catch (error) {
        logger.error('Get subjects error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve subjects' });
      }
    }
  );

  // Get subject by ID with its assignments (admin, subject member, or managing AM)
  fastify.get(
    '/subjects/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const subjectId = request.params.id;
        if (!validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        const { role, id: userId } = request.user;
        let allowed = role === 'admin';
        if (!allowed) {
          allowed = await Subject.isMember(subjectId, userId);
        }
        if (!allowed && role === 'assignment_manager') {
          allowed = await Assignment.managesAnyInSubject(userId, subjectId);
        }
        if (!allowed) {
          return reply.code(403).send({ error: 'Forbidden: You do not have access to this subject' });
        }

        const assignments = await Assignment.findAll({ subjectId });
        return reply.send({ subject, assignments });
      } catch (error) {
        logger.error('Get subject error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve subject' });
      }
    }
  );

  // Create subject (admin only)
  fastify.post(
    '/subjects',
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
        const { data: body, error: validationError } = parseBody(createSubjectSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const existing = await Subject.findByName(body.name);
        if (existing) {
          return reply.code(409).send({ error: 'A subject with this name already exists' });
        }

        const subject = await Subject.create(body.name);
        return reply.code(201).send({ message: 'Subject created successfully', subject });
      } catch (error) {
        logger.error('Create subject error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to create subject' });
      }
    }
  );

  // Update subject (admin only)
  fastify.put(
    '/subjects/:id',
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
        const subjectId = request.params.id;
        if (!validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }

        const { data: body, error: validationError } = parseBody(updateSubjectSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        if (body.name !== subject.name) {
          const duplicate = await Subject.findByName(body.name);
          if (duplicate && duplicate.id !== subjectId) {
            return reply.code(409).send({ error: 'A subject with this name already exists' });
          }
        }

        const updated = await Subject.update(subjectId, { name: body.name });
        return reply.send({ message: 'Subject updated successfully', subject: updated });
      } catch (error) {
        logger.error('Update subject error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update subject' });
      }
    }
  );

  // Delete subject (admin only) — DB cascades assignments/groups/memberships; users survive
  fastify.delete(
    '/subjects/:id',
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
        const subjectId = request.params.id;
        if (!validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        await Subject.delete(subjectId);
        return reply.send({ message: 'Subject deleted successfully' });
      } catch (error) {
        logger.error('Delete subject error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to delete subject' });
      }
    }
  );

  // Get subject members (admin, or AM managing an assignment in the subject)
  fastify.get(
    '/subjects/:id/users',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const subjectId = request.params.id;
        if (!validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        const { role, id: userId } = request.user;
        const allowed =
          role === 'admin' ||
          (role === 'assignment_manager' && (await Assignment.managesAnyInSubject(userId, subjectId)));
        if (!allowed) {
          return reply.code(403).send({ error: 'Forbidden: You do not have access to this subject' });
        }

        const users = await Subject.getMembers(subjectId);

        // Attach each member's group memberships WITHIN this subject so the
        // members view can offer group unassignment.
        let membershipRows = [];
        if (users.length > 0) {
          membershipRows = await UserGroup.findMembershipsForUsers(users.map((u) => u.id));
        }
        const membershipsByUser = new Map();
        for (const row of membershipRows) {
          if (row.subject_id !== subjectId) {
            continue;
          }
          const { user_id: uid, ...membership } = row;
          if (!membershipsByUser.has(uid)) {
            membershipsByUser.set(uid, []);
          }
          membershipsByUser.get(uid).push(membership);
        }
        const enriched = users.map((u) => ({ ...u, memberships: membershipsByUser.get(u.id) || [] }));

        return reply.send({ users: enriched });
      } catch (error) {
        logger.error('Get subject members error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve subject members' });
      }
    }
  );

  // Add users to subject (admin only)
  fastify.post(
    '/subjects/:id/users',
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
        const subjectId = request.params.id;
        if (!validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }

        const { data: body, error: validationError } = parseBody(addSubjectUsersSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        const found = await User.findByIds(body.userIds);
        const foundIds = new Set(found.map((u) => u.id));
        if (body.userIds.some((id) => !foundIds.has(id))) {
          return reply.code(400).send({ error: 'One or more users do not exist' });
        }

        const added = await Subject.addUsers(subjectId, body.userIds);
        return reply.send({ message: 'Users added to subject', added });
      } catch (error) {
        logger.error('Add subject users error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to add users to subject' });
      }
    }
  );

  // Enable or suspend a subject member (admin, or AM managing an assignment in
  // the subject) — suspension transactionally removes the user's group
  // memberships within the subject
  fastify.put(
    '/subjects/:id/users/:userId',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const subjectId = request.params.id;
        const userId = request.params.userId;
        if (!validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid user ID' });
        }

        const { role, id: callerId } = request.user;
        const allowed =
          role === 'admin' ||
          (role === 'assignment_manager' && (await Assignment.managesAnyInSubject(callerId, subjectId)));
        if (!allowed) {
          return reply.code(403).send({ error: 'Forbidden: You do not have access to this subject' });
        }

        const { data: body, error: validationError } = parseBody(setMemberEnabledSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        const updated = await Subject.setMemberEnabled(subjectId, userId, body.enabled);
        if (!updated) {
          return reply.code(404).send({ error: 'User is not a member of this subject' });
        }

        return reply.send({
          message: body.enabled ? 'Member enabled' : 'Member suspended',
          membershipEnabled: body.enabled,
        });
      } catch (error) {
        logger.error('Set subject member enabled error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update subject member' });
      }
    }
  );

  // Remove user from subject (admin only) — model transactionally removes the
  // user's group memberships within the subject
  fastify.delete(
    '/subjects/:id/users/:userId',
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
        const subjectId = request.params.id;
        const userId = request.params.userId;
        if (!validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid user ID' });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        const removed = await Subject.removeUser(subjectId, userId);
        if (!removed) {
          return reply.code(404).send({ error: 'User is not a member of this subject' });
        }

        return reply.send({ message: 'User removed from subject' });
      } catch (error) {
        logger.error('Remove subject user error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to remove user from subject' });
      }
    }
  );
}

module.exports = subjectsRoutes;
