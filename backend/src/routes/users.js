const User = require('../models/User');
const Group = require('../models/Group');
const Role = require('../models/Role');
const Subject = require('../models/Subject');
const Assignment = require('../models/Assignment');
const UserGroup = require('../models/UserGroup');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendPasswordSetupEmail } = require('../services/email');
const {
  sanitize,
  parseBody,
  createUserSchema,
  updateUserSchema,
  updateUserGroupSchema,
  changePasswordSchema,
  importUserRowSchema,
  validateUUID,
  ROLE_VALUES,
} = require('../utils/schemas');
const { logger } = require('../utils/logger');
const config = require('../config/index');

const _parsed = parseInt(process.env.MAX_IMPORT_SIZE || '2000', 10);
const MAX_IMPORT_SIZE = Number.isNaN(_parsed) ? 2000 : _parsed;

async function usersRoutes(fastify, _options) {
  const isDev = config.app.nodeEnv === 'development';

  // Get all users (admin/assignment_manager only) — supports ?role=, ?status=,
  // ?subjectId=, ?assignmentId= and ?groupId= (uuid or 'none') filters.
  // Assignment managers only see users enrolled in subjects they manage.
  fastify.get(
    '/users',
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
        const { role, status, subjectId, assignmentId, groupId } = request.query || {};

        const VALID_STATUSES = ['active', 'inactive', 'pending'];
        if (status !== undefined && !VALID_STATUSES.includes(status)) {
          return reply.code(400).send({ error: 'Invalid status filter' });
        }
        if (role !== undefined && !ROLE_VALUES.includes(role)) {
          return reply.code(400).send({ error: 'Invalid role filter' });
        }
        if (subjectId !== undefined && !validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Invalid subjectId filter' });
        }
        if (assignmentId !== undefined && !validateUUID(assignmentId)) {
          return reply.code(400).send({ error: 'Invalid assignmentId filter' });
        }
        if (groupId !== undefined && groupId !== 'none' && !validateUUID(groupId)) {
          return reply.code(400).send({ error: 'Invalid groupId filter' });
        }
        if (groupId === 'none' && assignmentId === undefined) {
          return reply.code(400).send({ error: 'assignmentId is required when filtering ungrouped users' });
        }

        const filters = { role, status, subjectId, assignmentId, groupId };
        // AM scoping: assignment managers only see users in subjects they manage
        if (request.user?.role === 'assignment_manager') {
          filters.managedBy = request.user.id;
        }

        const users = await User.findAll(filters);

        // Attach subject enrolments and group memberships in two batch queries
        const userIds = users.map((u) => u.id);
        let subjectRows = [];
        let membershipRows = [];
        if (userIds.length > 0) {
          [subjectRows, membershipRows] = await Promise.all([
            Subject.findForUsers(userIds),
            UserGroup.findMembershipsForUsers(userIds),
          ]);
        }
        const subjectsByUser = new Map();
        for (const row of subjectRows) {
          const { user_id: uid, ...subject } = row;
          if (!subjectsByUser.has(uid)) {
            subjectsByUser.set(uid, []);
          }
          subjectsByUser.get(uid).push(subject);
        }
        const membershipsByUser = new Map();
        for (const row of membershipRows) {
          const { user_id: uid, ...membership } = row;
          if (!membershipsByUser.has(uid)) {
            membershipsByUser.set(uid, []);
          }
          membershipsByUser.get(uid).push(membership);
        }
        const enriched = users.map((u) => ({
          ...u,
          subjects: subjectsByUser.get(u.id) || [],
          memberships: membershipsByUser.get(u.id) || [],
        }));

        return reply.send({ users: enriched });
      } catch (error) {
        logger.error('Get users error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve users' });
      }
    }
  );

  // Get user by ID
  fastify.get(
    '/users/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        // Users can view their own profile, admin/assignment_manager can view all
        const userId = request.params.id;
        if (request.user.id !== userId) {
          const allowed = await fastify.checkRole(request, reply, ['admin', 'assignment_manager']);
          if (!allowed) {
            return reply;
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const userId = request.params.id;
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        const user = await User.findById(userId);

        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // Remove password hash from response and enrich with hierarchy data
        const { password_hash: _password_hash, ...userWithoutPassword } = user;
        const [subjects, memberships] = await Promise.all([
          Subject.findForUser(userId),
          UserGroup.findMembershipsForUser(userId),
        ]);
        return reply.send({ user: { ...userWithoutPassword, subjects, memberships } });
      } catch (error) {
        logger.error('Get user error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to retrieve user' });
      }
    }
  );

  // Create new user (admin/assignment_manager) — password is optional.
  // When no password is supplied the account is created as 'pending' and an
  // email is sent with a link for the user to set their own password.
  fastify.post(
    '/users',
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
        const { data: body, error: validationError } = parseBody(createUserSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const {
          username,
          email,
          firstName,
          lastName,
          studentId,
          role,
          subjectIds,
          assignmentId,
          groupId,
          assignmentIds,
        } = body;

        // Only admins can create admin or assignment_manager users
        if ((role === 'admin' || role === 'assignment_manager') && request.user.role !== 'admin') {
          return reply.code(403).send({ error: 'Only admins can create admin or assignment manager users' });
        }

        // Check if username/email exists
        const existingUsername = await User.findByUsername(username);
        if (existingUsername) {
          return reply.code(409).send({ error: 'Username already exists' });
        }

        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
          return reply.code(409).send({ error: 'Email already exists' });
        }

        // Get role ID by name lookup (needed to know the effective role)
        const effectiveRole = role || 'user';
        const roleRecord = await Role.findByName(effectiveRole);
        if (!roleRecord) {
          return reply.code(400).send({ error: `Invalid role: ${role}` });
        }
        const roleId = roleRecord.id;

        // studentId and subject/group placement only apply to regular users
        const isUserRole = effectiveRole === 'user';
        const effectiveStudentId = isUserRole ? studentId : undefined;

        // Check studentId uniqueness
        if (effectiveStudentId) {
          const existingStudent = await User.findByStudentId(effectiveStudentId);
          if (existingStudent) {
            return reply.code(409).send({ error: 'Student ID already exists' });
          }
        }

        // Regular users must be enrolled in at least one subject; optional
        // immediate group placement requires assignmentId within those subjects.
        if (isUserRole) {
          if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
            return reply.code(400).send({ error: 'Subject is required' });
          }
          for (const sid of subjectIds) {
            const subject = await Subject.findById(sid);
            if (!subject) {
              return reply.code(404).send({ error: 'Subject not found' });
            }
            // AMs may only enrol users into subjects containing an assignment
            // they manage (same rule as POST /users/import).
            if (request.user?.role === 'assignment_manager') {
              const manages = await Assignment.managesAnyInSubject(request.user.id, sid);
              if (!manages) {
                return reply.code(403).send({ error: 'Forbidden: You do not manage any assignment in this subject' });
              }
            }
          }
          if (groupId && !assignmentId) {
            return reply.code(400).send({ error: 'assignmentId is required when groupId is provided' });
          }
          if (assignmentId) {
            const assignment = await Assignment.findById(assignmentId);
            if (!assignment) {
              return reply.code(404).send({ error: 'Assignment not found' });
            }
            if (!subjectIds.includes(assignment.subject_id)) {
              return reply.code(400).send({ error: 'Assignment does not belong to the selected subjects' });
            }
          }
          if (groupId) {
            const group = await Group.findById(groupId);
            if (!group) {
              return reply.code(404).send({ error: 'Group not found' });
            }
            if (group.assignment_id !== assignmentId) {
              return reply.code(400).send({ error: 'Group does not belong to the selected assignment' });
            }
          }
        }

        // Assignment managers may be given assignments to manage at creation time
        let managedAssignmentIds = [];
        if (effectiveRole === 'assignment_manager' && Array.isArray(assignmentIds) && assignmentIds.length > 0) {
          for (const aid of assignmentIds) {
            const assignment = await Assignment.findById(aid);
            if (!assignment) {
              return reply.code(404).send({ error: 'Assignment not found' });
            }
          }
          managedAssignmentIds = assignmentIds;
        }

        // Always create user as pending — password must be set via the email link
        const newUser = await User.create({
          username,
          email,
          password: null,
          firstName,
          lastName,
          studentId: effectiveStudentId,
          roleId,
        });

        let placementWarning;
        if (isUserRole) {
          for (const sid of subjectIds) {
            await Subject.addUsers(sid, [newUser.id]);
          }
          if (groupId) {
            try {
              await UserGroup.assignUserToGroup(newUser.id, groupId, { replace: true });
            } catch (placementError) {
              // Don't fail the request — the user was created and enrolled successfully
              logger.error('Group placement failed after user creation', { err: placementError.message });
              placementWarning = `User created but group placement failed: ${placementError.message}`;
            }
          }
        } else if (managedAssignmentIds.length > 0) {
          await Assignment.addManagers(newUser.id, managedAssignmentIds);
        }

        // Only admins can suppress the setup email; assignment managers always trigger it
        const shouldSendEmail = request.user?.role === 'admin' ? body.sendSetupEmail !== false : true;
        if (shouldSendEmail) {
          try {
            await PasswordResetToken.deleteStaleForUser(newUser.id);
            const tokenRecord = await PasswordResetToken.create(newUser.id, 'setup', 24);
            await sendPasswordSetupEmail(newUser, tokenRecord.token);
          } catch (emailError) {
            logger.error('Failed to send setup email', { err: emailError.message });
            // Don't fail the request — user was created successfully
          }
        }

        const response = {
          message: 'User created successfully',
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            status: newUser.status,
            studentId: newUser.student_id,
          },
        };
        if (placementWarning) {
          response.warning = placementWarning;
        }
        return reply.code(201).send(response);
      } catch (error) {
        if (error.code === '23505') {
          if (error.constraint?.includes('student_id')) {
            return reply.code(409).send({ error: 'Student ID already exists' });
          }
          if (error.constraint?.includes('email')) {
            return reply.code(409).send({ error: 'Email already exists' });
          }
          if (error.constraint?.includes('username')) {
            return reply.code(409).send({ error: 'Username already exists' });
          }
          return reply.code(409).send({ error: 'A user with these details already exists' });
        }
        logger.error('Create user error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to create user' });
      }
    }
  );

  // Update user's group placement for one assignment (admin, or an assignment
  // manager who manages that assignment). groupId null removes the placement.
  fastify.put(
    '/users/:id/group',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const userId = request.params.id;
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }

        const { data: body, error: validationError } = parseBody(updateUserGroupSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // Role guard, then assignment-scoped guard (admin always passes both)
        const allowed = await fastify.requireAssignmentManager(request, reply);
        if (!allowed) {
          return reply;
        }
        const managesOk = await fastify.assertManagesAssignment(request, reply, body.assignmentId);
        if (!managesOk) {
          return reply;
        }

        const assignment = await Assignment.findById(body.assignmentId);
        if (!assignment) {
          return reply.code(404).send({ error: 'Assignment not found' });
        }

        if (body.groupId === null) {
          await UserGroup.remove(userId, body.assignmentId);
          return reply.send({
            message: 'User removed from group',
            user: {
              id: user.id,
              username: user.username,
              assignmentId: body.assignmentId,
              groupId: null,
            },
          });
        }

        const group = await Group.findById(body.groupId);
        if (!group) {
          return reply.code(404).send({ error: 'Group not found' });
        }
        if (group.assignment_id !== body.assignmentId) {
          return reply.code(400).send({ error: 'Group does not belong to the selected assignment' });
        }

        // Atomic placement — enforces subject membership (403), capacity (409)
        // and existence (404) under a row-level lock on the group.
        await UserGroup.assignUserToGroup(userId, body.groupId, { replace: true });

        return reply.send({
          message: 'User group updated successfully',
          user: {
            id: user.id,
            username: user.username,
            assignmentId: body.assignmentId,
            groupId: body.groupId,
          },
        });
      } catch (error) {
        if (error.statusCode && error.statusCode < 500) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        logger.error('Update user group error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update user group' });
      }
    }
  );

  // Update user (admin can edit any user; assignment managers can edit non-admin users; regular users can edit their own profile only)
  fastify.put(
    '/users/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const userId = request.params.id;
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        const isAdmin = request.user.role === 'admin';
        const isAssignmentManager = request.user.role === 'assignment_manager';
        const isSelfEdit = request.user.id === userId;

        // Regular users can only edit their own profile
        if (!isAdmin && !isAssignmentManager && !isSelfEdit) {
          return reply.code(403).send({ error: 'Forbidden: You can only edit your own profile' });
        }

        // Get the target user to check their role
        const targetUser = await User.findById(userId);
        if (!targetUser) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // Assignment managers can only edit non-admin users
        if (isAssignmentManager && targetUser.role_name === 'admin') {
          return reply.code(403).send({ error: 'Forbidden: Assignment managers cannot edit admin users' });
        }

        // Attach to request so the handler can reuse it without a second DB call
        request.targetUser = targetUser;
      },
    },
    async (request, reply) => {
      try {
        const userId = request.params.id;
        const { data: body, error: validationError } = parseBody(updateUserSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const { email, firstName, lastName, studentId, role, enabled, username } = body;

        // Reuse the user already fetched in preHandler (M3)
        const user = request.targetUser;
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // Prevent username changes
        if (username !== undefined && username !== user.username) {
          return reply.code(400).send({ error: 'Username cannot be changed' });
        }

        // Prevent disabling or changing role of the built-in admin user
        if (user.username === 'admin') {
          if (enabled === false) {
            return reply.code(400).send({ error: 'Cannot disable the built-in admin account' });
          }
          if (role !== undefined && role !== user.role_name) {
            return reply.code(400).send({ error: 'Cannot change role of the built-in admin account' });
          }
        }

        const isAdmin = request.user.role === 'admin';
        const isAssignmentManager = request.user.role === 'assignment_manager';
        const updates = { email, firstName, lastName };

        // Only include studentId for regular users
        if (user.role_name === 'user' && studentId !== undefined) {
          updates.studentId = studentId;
        }

        if (isAdmin) {
          // Resolve role name to roleId if provided and changed
          if (role !== undefined && role !== user.role_name) {
            const roleRecord = await Role.findByName(role);
            if (!roleRecord) {
              return reply.code(400).send({ error: `Invalid role: ${role}` });
            }
            updates.roleId = roleRecord.id;
          }
        }

        // Admins and assignment managers can enable/disable users; sync status accordingly
        // (assignment managers cannot edit admin users — enforced in preHandler)
        if ((isAdmin || isAssignmentManager) && enabled !== undefined) {
          updates.enabled = enabled;
          if (enabled === false) {
            updates.status = 'inactive';
          } else if (enabled === true && user.status === 'inactive') {
            updates.status = 'active';
          }
        }

        const updatedUser = await User.update(userId, updates);

        if (!updatedUser) {
          return reply.code(404).send({ error: 'User not found' });
        }

        const { password_hash: _ph, ...safeUser } = updatedUser;
        return reply.send({
          message: 'User updated successfully',
          user: safeUser,
        });
      } catch (error) {
        logger.error('Update user error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to update user' });
      }
    }
  );

  // Change password (only the current logged-in user can change their own password)
  // Rate-limited to prevent brute-force of the current-password check (fixes code scanning alert #10)
  fastify.put(
    '/users/:id/password',
    {
      config: {
        rateLimit: {
          max: isDev ? 500 : 10,
          timeWindow: '15 minutes',
        },
      },
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const userId = request.params.id;
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        // Only allow users to change their own password
        if (request.user.id !== userId) {
          return reply.code(403).send({ error: 'Forbidden: You can only change your own password' });
        }
      },
    },
    async (request, reply) => {
      try {
        const userId = request.params.id;
        const { data: body, error: validationError } = parseBody(changePasswordSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }
        const { currentPassword, newPassword } = body;

        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // All users must verify their current password before changing it
        const userWithPassword = await User.findByUsername(user.username);
        const valid = await User.verifyPassword(currentPassword, userWithPassword.password_hash);
        if (!valid) {
          return reply.code(401).send({ error: 'Current password is incorrect' });
        }

        await User.updatePassword(userId, newPassword);

        return reply.send({ message: 'Password updated successfully' });
      } catch (error) {
        logger.error('Change password error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to change password' });
      }
    }
  );

  // Delete user (admin only)
  fastify.delete(
    '/users/:id',
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
        const userId = request.params.id;
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }

        // Prevent deleting yourself
        if (userId === request.user.id) {
          return reply.code(400).send({ error: 'Cannot delete your own account' });
        }

        const deletedUser = await User.delete(userId);

        if (!deletedUser) {
          return reply.code(404).send({ error: 'User not found' });
        }

        return reply.send({ message: 'User deleted successfully' });
      } catch (error) {
        logger.error('Delete user error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to delete user' });
      }
    }
  );

  // Bulk delete users (admin only)
  fastify.delete(
    '/users/bulk',
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

        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.includes(request.user.id)) {
          return reply.code(400).send({ error: 'Cannot delete your own account' });
        }

        const deleted = await User.bulkDelete(uniqueIds);
        return reply.send({ message: 'Users deleted successfully', deleted });
      } catch (error) {
        logger.error('Bulk delete users error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to delete users' });
      }
    }
  );

  // Bulk import users from CSV (admin/assignment_manager only)
  fastify.post(
    '/users/import',
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
        const { users: usersToImport, conflictAction = 'skip', sendSetupEmail = false, subjectId } = request.body || {};

        if (!subjectId || !validateUUID(subjectId)) {
          return reply.code(400).send({ error: 'Subject is required' });
        }
        if (conflictAction !== 'skip' && conflictAction !== 'overwrite') {
          return reply.code(400).send({ error: "Invalid 'conflictAction'. Allowed values are 'skip' or 'overwrite'." });
        }
        if (typeof sendSetupEmail !== 'boolean') {
          return reply.code(400).send({ error: "'sendSetupEmail' must be a boolean." });
        }

        if (!Array.isArray(usersToImport) || usersToImport.length === 0) {
          return reply.code(400).send({ error: 'No users to import' });
        }

        if (usersToImport.length > MAX_IMPORT_SIZE) {
          return reply.code(400).send({ error: `Import exceeds maximum of ${MAX_IMPORT_SIZE} rows` });
        }

        const subject = await Subject.findById(subjectId);
        if (!subject) {
          return reply.code(404).send({ error: 'Subject not found' });
        }

        // Assignment managers may only import into subjects containing an
        // assignment they manage
        if (request.user.role === 'assignment_manager') {
          const manages = await Assignment.managesAnyInSubject(request.user.id, subjectId);
          if (!manages) {
            return reply.code(403).send({ error: 'Forbidden: You do not manage any assignment in this subject' });
          }
        }

        const roleRecord = await Role.findByName('user');
        if (!roleRecord) {
          return reply.code(500).send({ error: 'User role not found' });
        }

        let imported = 0;
        let skipped = 0;
        const errors = [];
        const enrolledUserIds = [];

        // First pass: parse all rows and collect unique keys for batch lookup
        const parsedRows = [];
        for (let rowNum = 1; rowNum <= usersToImport.length; rowNum++) {
          const rawRow = usersToImport[rowNum - 1];
          const parseResult = importUserRowSchema.safeParse(rawRow);
          if (!parseResult.success) {
            const rawUsername = typeof rawRow.username === 'string' ? rawRow.username.slice(0, 100) : '';
            const rawEmail = typeof rawRow.email === 'string' ? rawRow.email.slice(0, 255) : '';
            const rowLabel = sanitize(rawUsername || rawEmail) || `row ${rowNum}`;
            errors.push({ row: rowNum, identifier: rowLabel, reason: 'Missing or invalid required fields' });
            parsedRows.push(null);
            continue;
          }
          parsedRows.push({ rowNum, ...parseResult.data });
        }

        // Batch lookups — 3 queries regardless of import size
        const validParsedRows = parsedRows.filter(Boolean);
        const allUsernames = [...new Set(validParsedRows.map((r) => r.username.toLowerCase()))];
        const allEmails = [...new Set(validParsedRows.map((r) => r.email))];
        const allStudentIds = [...new Set(validParsedRows.filter((r) => r.studentId).map((r) => r.studentId))];

        const [usernameRows, emailRows, studentIdRows] = await Promise.all([
          User.findByUsernames(allUsernames),
          User.findByEmails(allEmails),
          User.findByStudentIds(allStudentIds),
        ]);

        const usernameMap = new Map(usernameRows.map((u) => [u.username.toLowerCase(), u]));
        const emailMap = new Map(emailRows.map((u) => [u.email, u]));
        const studentIdMap = new Map(studentIdRows.map((u) => [u.student_id, u]));

        // Second pass: process rows using in-memory maps; update maps after each write
        // for within-batch duplicate detection
        for (const parsed of parsedRows) {
          if (!parsed) {
            continue; // validation error already recorded in first pass
          }

          const { rowNum, username, email, firstName, lastName, studentId } = parsed;
          const rowLabel = username || email || `row ${rowNum}`;

          try {
            const existing = usernameMap.get(username.toLowerCase());

            if (existing) {
              if (conflictAction === 'skip') {
                skipped++;
                continue;
              }
              // overwrite — skip privileged accounts
              if (existing.role_name === 'admin' || existing.role_name === 'assignment_manager') {
                errors.push({
                  row: rowNum,
                  identifier: rowLabel,
                  reason: 'Cannot overwrite admin or assignment manager account',
                });
                continue;
              }
              // Check if email would conflict with a different user
              const emailOwner = emailMap.get(email);
              if (emailOwner && emailOwner.id !== existing.id) {
                errors.push({
                  row: rowNum,
                  identifier: rowLabel,
                  reason: 'Email already in use by another user',
                });
                continue;
              }
              // Check if student ID would conflict with a different user
              if (studentId) {
                const sidOwner = studentIdMap.get(studentId);
                if (sidOwner && sidOwner.id !== existing.id) {
                  errors.push({
                    row: rowNum,
                    identifier: rowLabel,
                    reason: 'Student ID already in use by another user',
                  });
                  continue;
                }
              }
              await User.update(existing.id, { email, firstName, lastName, studentId: studentId || null });
              // Keep maps in sync so subsequent rows in the same batch see current state
              const updatedEntry = {
                ...existing,
                email,
                first_name: firstName,
                last_name: lastName,
                student_id: studentId || null,
              };
              usernameMap.set(username.toLowerCase(), updatedEntry);
              if (existing.email !== email) {
                emailMap.delete(existing.email);
                emailMap.set(email, updatedEntry);
              }
              if (existing.student_id !== (studentId || null)) {
                if (existing.student_id) {
                  studentIdMap.delete(existing.student_id);
                }
                if (studentId) {
                  studentIdMap.set(studentId, updatedEntry);
                }
              }
              enrolledUserIds.push(existing.id);
              imported++;
              continue;
            }

            // New user — check email and student ID uniqueness using maps
            const emailOwner = emailMap.get(email);
            if (emailOwner) {
              errors.push({
                row: rowNum,
                identifier: rowLabel,
                reason: 'Email already in use by another user',
              });
              continue;
            }
            if (studentId) {
              const sidOwner = studentIdMap.get(studentId);
              if (sidOwner) {
                errors.push({
                  row: rowNum,
                  identifier: rowLabel,
                  reason: 'Student ID already in use by another user',
                });
                continue;
              }
            }

            const newUser = await User.create({
              username,
              email,
              password: null,
              firstName,
              lastName,
              studentId: studentId || null,
              roleId: roleRecord.id,
            });

            // Keep maps in sync for within-batch duplicate detection
            const newEntry = { ...newUser, role_name: roleRecord.name };
            usernameMap.set(username.toLowerCase(), newEntry);
            emailMap.set(email, newEntry);
            if (studentId) {
              studentIdMap.set(studentId, newEntry);
            }
            enrolledUserIds.push(newUser.id);

            if (sendSetupEmail) {
              try {
                await PasswordResetToken.deleteStaleForUser(newUser.id);
                const tokenRecord = await PasswordResetToken.create(newUser.id, 'setup', 24);
                await sendPasswordSetupEmail(newUser, tokenRecord.token);
              } catch (emailError) {
                logger.error('Failed to send setup email', { err: emailError.message });
              }
            }

            imported++;
          } catch (rowError) {
            const reason = rowError.code === '23505' ? 'Duplicate entry' : 'Processing failed';
            errors.push({ row: rowNum, identifier: rowLabel, reason });
          }
        }

        // Enrol every created/overwritten user in the target subject in one call
        if (enrolledUserIds.length > 0) {
          await Subject.addUsers(subjectId, enrolledUserIds);
        }

        errors.sort((a, b) => a.row - b.row);
        return reply.send({ imported, skipped, errors });
      } catch (error) {
        logger.error('Import error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Import failed' });
      }
    }
  );

  // Send setup email to pending users (admin/assignment_manager only)
  fastify.post(
    '/users/send-setup-emails',
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
        // Housekeeping: purge expired / used tokens
        await PasswordResetToken.deleteExpired();

        const { userIds } = request.body || {};
        // If userIds provided, send only to those; otherwise send to all pending users
        let targets;
        if (Array.isArray(userIds) && userIds.length > 0) {
          if (userIds.length > 500) {
            return reply.code(400).send({ error: 'Cannot send more than 500 setup emails per request' });
          }
          const invalidIds = userIds.filter((id) => !validateUUID(id));
          if (invalidIds.length > 0) {
            return reply.code(400).send({ error: 'One or more user IDs have an invalid format' });
          }
          const found = await User.findByIds(userIds);
          targets = found.filter((u) => u.status === 'pending');
        } else {
          const all = await User.findAll({ status: 'pending' });
          targets = all;
        }

        let sent = 0;
        const errors = [];
        for (const u of targets) {
          try {
            await PasswordResetToken.deleteStaleForUser(u.id);
            const tokenRecord = await PasswordResetToken.create(u.id, 'setup', 24);
            await sendPasswordSetupEmail(u, tokenRecord.token);
            sent++;
          } catch (emailError) {
            logger.error('Failed to send setup email', { username: u.username, err: emailError.message });
            errors.push({ userId: u.id, username: u.username, reason: 'Failed to send email' });
          }
        }

        return reply.send({ sent, errors });
      } catch (error) {
        logger.error('Send setup emails error', { err: error.message, code: error.code });
        return reply.code(500).send({ error: 'Failed to send setup emails' });
      }
    }
  );
}

module.exports = usersRoutes;
