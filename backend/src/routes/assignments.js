const Assignment = require('../models/Assignment');
const Subject = require('../models/Subject');
const Group = require('../models/Group');
const UserGroup = require('../models/UserGroup');
const User = require('../models/User');
const {
  sanitize,
  parseBody,
  createAssignmentSchema,
  updateAssignmentSchema,
  setAssignmentManagersSchema,
  setJoinLockedSchema,
  importGroupMappingRowSchema,
  validateUUID,
} = require('../utils/schemas');
const { logger } = require('../utils/logger');

const _parsedImportMax = parseInt(process.env.MAX_IMPORT_SIZE || '2000', 10);
const MAX_IMPORT_MAPPINGS = Number.isNaN(_parsedImportMax) ? 2000 : _parsedImportMax;

async function assignmentsRoutes(fastify, _options) {
  // Get all assignments, scoped to the caller's role (any authenticated user)
  fastify.get(
    '/assignments',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const { subjectId } = request.query || {};
        if (subjectId !== undefined && !validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subject ID' });
        }

        const rows = await Assignment.findAll({ subjectId });
        const { role, id: userId } = request.user;

        let assignments;
        if (role === 'admin') {
          assignments = rows;
        } else if (role === 'assignment_manager') {
          // Assignments they manage, union assignments of subjects they belong to
          const [managed, ownSubjects] = await Promise.all([
            Assignment.findManagedBy(userId),
            Assignment.findForUser(userId),
          ]);
          const allowedIds = new Set([...managed.map((a) => a.id), ...ownSubjects.map((a) => a.id)]);
          assignments = rows.filter((a) => allowedIds.has(a.id));
        } else {
          const own = await Assignment.findForUser(userId);
          const allowedIds = new Set(own.map((a) => a.id));
          assignments = rows.filter((a) => allowedIds.has(a.id));
        }

        return reply.send({ assignments });
      } catch (error) {
        logger.error('Get assignments error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve assignments' });
      }
    }
  );

  // Get assignment by ID (admin, subject member, or its manager)
  fastify.get(
    '/assignments/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await canAccessAssignment(request.user, assignment);
        if (!allowed) {
          return reply.code(403).send({ error: 'Forbidden: You do not have access to this assignment' });
        }

        return reply.send({ assignment });
      } catch (error) {
        logger.error('Get assignment error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve assignment' });
      }
    }
  );

  // Create assignment (admin only)
  fastify.post(
    '/assignments',
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
        const { data: body, error: validationError } = parseBody(createAssignmentSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const subject = await Subject.findById(body.subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        const existing = await Assignment.findByName(body.subjectId, body.name);
        if (existing) {
          return reply.code(409).send({ error: 'An assignment with this name already exists in this subject' });
        }

        const assignment = await Assignment.create(body.subjectId, body.name);
        return reply.code(201).send({ message: 'Assignment created successfully', assignment });
      } catch (error) {
        // Migration 016 enforces case-insensitive names, so a concurrent create
        // loses the race here rather than at the application precheck.
        if (error.code === '23505') {
          return reply.code(409).send({ error: 'An assignment with this name already exists in this subject' });
        }
        logger.error('Create assignment error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to create assignment' });
      }
    }
  );

  // Update assignment (admin only)
  fastify.put(
    '/assignments/:id',
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
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const { data: body, error: validationError } = parseBody(updateAssignmentSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        if (body.name !== assignment.name) {
          const duplicate = await Assignment.findByName(assignment.subject_id, body.name);
          if (duplicate && duplicate.id !== assignmentId) {
            return reply.code(409).send({ error: 'An assignment with this name already exists in this subject' });
          }
        }

        const updated = await Assignment.update(assignmentId, { name: body.name });
        return reply.send({ message: 'Assignment updated successfully', assignment: updated });
      } catch (error) {
        // Migration 016 enforces case-insensitive names, so a concurrent create
        // loses the race here rather than at the application precheck.
        if (error.code === '23505') {
          return reply.code(409).send({ error: 'An assignment with this name already exists in this subject' });
        }
        logger.error('Update assignment error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update assignment' });
      }
    }
  );

  // Delete assignment (admin only)
  fastify.delete(
    '/assignments/:id',
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
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        await Assignment.delete(assignmentId);
        return reply.send({ message: 'Assignment deleted successfully' });
      } catch (error) {
        logger.error('Delete assignment error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to delete assignment' });
      }
    }
  );

  // Get groups of an assignment (admin, subject member, or its manager); ?enabled=true filters
  fastify.get(
    '/assignments/:id/groups',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await canAccessAssignment(request.user, assignment);
        if (!allowed) {
          return reply.code(403).send({ error: 'Forbidden: You do not have access to this assignment' });
        }

        const { enabled } = request.query || {};
        const groups = await Group.findAllByAssignment(assignmentId, { enabledOnly: enabled === 'true' });
        return reply.send({ groups });
      } catch (error) {
        logger.error('Get assignment groups error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve groups' });
      }
    }
  );

  // Freeze/unfreeze self-service group joining for one assignment
  // (admin, or the assignment's manager)
  fastify.put(
    '/assignments/:id/join-lock',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const { data: body, error: validationError } = parseBody(setJoinLockedSchema, request.body || {});
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await fastify.assertManagesAssignment(request, reply, assignmentId);
        if (!allowed) {
          return reply;
        }

        const updated = await Assignment.setJoinLocked(assignmentId, body.joinLocked);
        if (!updated) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        return reply.send({
          message: body.joinLocked ? 'Group joining locked' : 'Group joining unlocked',
          assignment: updated,
        });
      } catch (error) {
        logger.error('Set assignment join lock error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update join lock' });
      }
    }
  );

  // Preview data for the mapping import: the members of the assignment's subject
  // plus its groups. Scoped to the assignment so an assignment manager does not
  // need the admin-only GET /users.
  fastify.get(
    '/assignments/:id/import-preview',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await fastify.assertManagesAssignment(request, reply, assignmentId);
        if (!allowed) {
          return reply;
        }

        const [members, groups] = await Promise.all([
          Subject.getMembers(assignment.subject_id),
          Group.findAllByAssignment(assignmentId),
        ]);

        // Each member's existing group in THIS assignment, so the preview can
        // flag reassignments as conflicts.
        const membershipRows =
          members.length > 0 ? await UserGroup.findMembershipsForUsers(members.map((m) => m.id)) : [];
        const currentGroupByUser = new Map(
          membershipRows.filter((r) => r.assignment_id === assignmentId).map((r) => [r.user_id, r.group_id])
        );

        // Only the fields the preview needs — no student IDs, names, or status.
        return reply.send({
          users: members.map((m) => ({
            id: m.id,
            email: m.email,
            role_name: m.role_name,
            membership_enabled: m.membership_enabled,
            current_group_id: currentGroupByUser.get(m.id) ?? null,
          })),
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            max_members: g.max_members,
            member_count: g.member_count,
          })),
        });
      } catch (error) {
        logger.error('Get assignment import preview error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to load preview data' });
      }
    }
  );

  // Get assignment managers (admin only)
  fastify.get(
    '/assignments/:id/managers',
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
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const managers = await Assignment.getManagers(assignmentId);
        return reply.send({ managers });
      } catch (error) {
        logger.error('Get assignment managers error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve managers' });
      }
    }
  );

  // Replace assignment managers (admin only)
  fastify.put(
    '/assignments/:id/managers',
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
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const { data: body, error: validationError } = parseBody(setAssignmentManagersSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        if (body.userIds.length > 0) {
          const found = await User.findByIds(body.userIds);
          const foundById = new Map(found.map((u) => [u.id, u]));
          if (body.userIds.some((id) => !foundById.has(id))) {
            return reply.code(400).send({ error: 'One or more users do not exist' });
          }
          if (found.some((u) => u.role_name !== 'assignment_manager')) {
            return reply.code(400).send({ error: 'All managers must have the assignment_manager role' });
          }
        }

        await Assignment.setManagers(assignmentId, body.userIds);
        const managers = await Assignment.getManagers(assignmentId);
        return reply.send({ message: 'Assignment managers updated successfully', managers });
      } catch (error) {
        logger.error('Set assignment managers error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update managers' });
      }
    }
  );

  // Export user-group mappings for one assignment (admin, or its manager)
  fastify.get(
    '/assignments/:id/export-mappings',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await fastify.assertManagesAssignment(request, reply, assignmentId);
        if (!allowed) {
          return reply;
        }

        const rows = await UserGroup.getExportMappings(assignmentId);
        const mappings = rows.map((r) => ({ email: r.email, groupName: r.group_name }));
        return reply.send({ mappings });
      } catch (error) {
        logger.error('Export assignment mappings error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to export mappings' });
      }
    }
  );

  // Import user-group mappings for one assignment from CSV (admin, or its manager)
  fastify.post(
    '/assignments/:id/import-mappings',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const assignmentId = request.params.id;
        if (!validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignment ID' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        const allowed = await fastify.assertManagesAssignment(request, reply, assignmentId);
        if (!allowed) {
          return reply;
        }

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

        // First pass: parse all rows while preserving input order for deterministic output
        const parsedRows = [];
        for (const raw of rows) {
          // A row may be null or a scalar; never dereference it directly.
          const rawRow = typeof raw === 'object' && raw !== null ? raw : {};
          if (rawRow.action === 'skip') {
            const email = typeof rawRow.email === 'string' ? sanitize(rawRow.email).slice(0, 255) : '?';
            const groupName = typeof rawRow.groupName === 'string' ? sanitize(rawRow.groupName).slice(0, 100) : '?';
            const rawReason = typeof rawRow.skipReason === 'string' ? rawRow.skipReason : '';
            const reason = sanitize(rawReason).slice(0, 500) || 'Skipped';
            parsedRows.push({ type: 'skip', email, groupName, reason });
            continue;
          }

          const parseResult = importGroupMappingRowSchema.safeParse(rawRow);
          if (!parseResult.success) {
            parsedRows.push({
              type: 'invalid',
              email: typeof rawRow.email === 'string' ? sanitize(rawRow.email).slice(0, 255) : '?',
              groupName: typeof rawRow.groupName === 'string' ? sanitize(rawRow.groupName).slice(0, 100) : '?',
              error: parseResult.error.issues[0]?.message || 'Validation failed',
            });
            continue;
          }

          parsedRows.push({ type: 'valid', ...parseResult.data });
        }

        // Batch lookups — 2 queries regardless of import size; groups scoped to this assignment
        const validRows = parsedRows.filter((r) => r.type === 'valid');
        const uniqueEmails = [...new Set(validRows.map((r) => r.email))];
        const uniqueGroupNames = [...new Set(validRows.map((r) => r.groupName))];

        const [usersArr, groupsArr] = await Promise.all([
          User.findByEmails(uniqueEmails),
          Group.findByNames(assignmentId, uniqueGroupNames),
        ]);

        const usersByEmail = new Map(usersArr.map((u) => [u.email, u]));
        const groupsByName = new Map();
        for (const group of groupsArr) {
          const normalizedName = group.name.toLowerCase();
          const existing = groupsByName.get(normalizedName);
          if (existing && existing.id !== group.id) {
            return reply.code(409).send({
              error: `Ambiguous group name: "${group.name}" matches multiple groups that differ only by case`,
            });
          }
          groupsByName.set(normalizedName, group);
        }

        // Second pass: emit results in original row order
        for (const parsed of parsedRows) {
          if (parsed.type === 'skip') {
            skipped.push({ email: parsed.email, groupName: parsed.groupName, reason: parsed.reason });
            continue;
          }
          if (parsed.type === 'invalid') {
            errors.push({ email: parsed.email, groupName: parsed.groupName, error: parsed.error });
            continue;
          }

          const { email, groupName } = parsed;
          try {
            const user = usersByEmail.get(email);
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

            const group = groupsByName.get(groupName.toLowerCase());
            if (!group) {
              skipped.push({ email, groupName, reason: 'Group not found' });
              continue;
            }

            await UserGroup.assignUserToGroup(user.id, group.id, { replace: true });
            imported++;
          } catch (rowErr) {
            if (rowErr.statusCode === 403) {
              skipped.push({ email, groupName, reason: 'User is not a member of this subject' });
              continue;
            }
            if (rowErr.statusCode === 409) {
              skipped.push({ email, groupName, reason: 'Group is full' });
              continue;
            }
            logger.error('Import mapping row error', { err: rowErr.message, code: rowErr.code });
            errors.push({ email, groupName, error: 'Failed to process row' });
          }
        }

        return reply.send({ imported, skipped, errors });
      } catch (error) {
        logger.error('Import assignment mappings error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to import mappings' });
      }
    }
  );
}

/**
 * Shared read-scope check: admin, subject member, or (for assignment managers)
 * manager of this assignment.
 */
async function canAccessAssignment(user, assignment) {
  if (user.role === 'admin') {
    return true;
  }
  if (await Subject.isMember(assignment.subject_id, user.id)) {
    return true;
  }
  if (user.role === 'assignment_manager') {
    return Assignment.isManager(user.id, assignment.id);
  }
  return false;
}

module.exports = assignmentsRoutes;
