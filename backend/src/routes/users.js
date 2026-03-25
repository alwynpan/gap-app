const User = require('../models/User');
const Group = require('../models/Group');
const Role = require('../models/Role');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendPasswordSetupEmail } = require('../services/email');
const {
  parseBody,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  importUserRowSchema,
  validateUUID,
} = require('../utils/schemas');

async function usersRoutes(fastify, _options) {
  // Get all users (admin/assignment_manager only) — supports ?role=, ?status=, ?groupId= filters
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
        const { role, status, groupId } = request.query || {};
        const users = await User.findAll({ role, status, groupId });
        return reply.send({ users });
      } catch (error) {
        console.error('Get users error:', error);
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

        // Remove password hash from response
        const { password_hash: _password_hash, ...userWithoutPassword } = user;
        return reply.send({ user: userWithoutPassword });
      } catch (error) {
        console.error('Get user error:', error);
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

        const { username, email, firstName, lastName, studentId, password, groupId, role } = body;

        // Only admins can create admin users
        if (role === 'admin' && request.user.role !== 'admin') {
          return reply.code(403).send({ error: 'Only admins can create admin users' });
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

        // Get role ID by name lookup (needed before group check to know effective role)
        const effectiveRole = role || 'user';
        const roleRecord = await Role.findByName(effectiveRole);
        if (!roleRecord) {
          return reply.code(400).send({ error: `Invalid role: ${role}` });
        }
        const roleId = roleRecord.id;

        // studentId and groupId only apply to regular users
        const isUserRole = effectiveRole === 'user';
        const effectiveStudentId = isUserRole ? studentId : undefined;
        const effectiveGroupId = isUserRole ? groupId : undefined;

        // If a group is specified, verify it exists and has capacity
        if (effectiveGroupId) {
          const group = await Group.findById(effectiveGroupId);
          if (!group) {
            return reply.code(404).send({ error: 'Group not found' });
          }
          if (group.max_members !== null && group.member_count >= group.max_members) {
            return reply.code(400).send({ error: 'Group is full' });
          }
        }

        const newUser = await User.create({
          username,
          email,
          password: password || null,
          firstName,
          lastName,
          studentId: effectiveStudentId,
          groupId: effectiveGroupId,
          roleId,
        });

        // Send setup email if no password was provided
        if (!password) {
          try {
            await PasswordResetToken.deleteStaleForUser(newUser.id);
            const tokenRecord = await PasswordResetToken.create(newUser.id, 'setup', 24);
            await sendPasswordSetupEmail(newUser, tokenRecord.token);
          } catch (emailError) {
            console.error('Failed to send setup email:', emailError);
            // Don't fail the request — user was created successfully
          }
        }

        return reply.code(201).send({
          message: 'User created successfully',
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            status: newUser.status,
            studentId: newUser.student_id,
          },
        });
      } catch (error) {
        console.error('Create user error:', error);
        return reply.code(500).send({ error: 'Failed to create user' });
      }
    }
  );

  // Update user's group assignment (admin/assignment_manager only)
  fastify.put(
    '/users/:id/group',
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
        const userId = request.params.id;
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        const { groupId } = request.body;

        if (groupId === undefined) {
          return reply.code(400).send({ error: 'groupId is required' });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // If groupId is not null, assign inside a transaction with row-level lock (H2)
        if (groupId !== null) {
          await Group.assignUserToGroup(userId, groupId);
        } else {
          await User.updateGroup(userId, null);
        }

        const updatedUser = await User.findById(userId);

        return reply.send({
          message: 'User group updated successfully',
          user: {
            id: updatedUser.id,
            username: updatedUser.username,
            groupId: updatedUser.group_id,
          },
        });
      } catch (error) {
        console.error('Update user group error:', error);
        return reply.code(500).send({ error: 'Failed to update user group' });
      }
    }
  );

  // Update user (admin can edit any user; assignment managers can edit non-admin users; regular users cannot edit anyone)
  fastify.put(
    '/users/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const userId = request.params.id;
        const isAdmin = request.user.role === 'admin';
        const isAssignmentManager = request.user.role === 'assignment_manager';

        // Regular users cannot edit anyone (including themselves - they should use password change endpoint)
        if (!isAdmin && !isAssignmentManager) {
          return reply.code(403).send({ error: 'Forbidden: Regular users cannot edit user information' });
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
        if (!validateUUID(userId)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }
        const { data: body, error: validationError } = parseBody(updateUserSchema, request.body);
        if (validationError) {
          return reply.code(400).send({ error: validationError });
        }

        const { email, firstName, lastName, studentId, role, enabled, username, groupId } = body;

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
          // Only include groupId for regular users
          if (user.role_name === 'user' && groupId !== undefined) {
            updates.groupId = groupId;
          }
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
        console.error('Update user error:', error);
        return reply.code(500).send({ error: 'Failed to update user' });
      }
    }
  );

  // Change password (only the current logged-in user can change their own password)
  fastify.put(
    '/users/:id/password',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const userId = request.params.id;
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
        console.error('Change password error:', error);
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
        console.error('Delete user error:', error);
        return reply.code(500).send({ error: 'Failed to delete user' });
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
        const MAX_IMPORT_SIZE = parseInt(process.env.MAX_IMPORT_SIZE || '2000', 10);
        const { users: usersToImport, conflictAction = 'skip', sendSetupEmail = false } = request.body || {};

        if (!Array.isArray(usersToImport) || usersToImport.length === 0) {
          return reply.code(400).send({ error: 'No users to import' });
        }

        if (usersToImport.length > MAX_IMPORT_SIZE) {
          return reply.code(400).send({ error: `Import exceeds maximum of ${MAX_IMPORT_SIZE} rows` });
        }

        const roleRecord = await Role.findByName('user');
        if (!roleRecord) {
          return reply.code(500).send({ error: 'User role not found' });
        }

        let imported = 0;
        let skipped = 0;
        const errors = [];
        let rowNum = 0;

        for (const rawRow of usersToImport) {
          rowNum++;

          const parseResult = importUserRowSchema.safeParse(rawRow);
          if (!parseResult.success) {
            const rowLabel = rawRow.username || rawRow.email || `row ${rowNum}`;
            errors.push({ row: rowNum, identifier: rowLabel, reason: 'Missing or invalid required fields' });
            continue;
          }

          const { username, email, firstName, lastName, studentId } = parseResult.data;
          const rowLabel = username || email || `row ${rowNum}`;

          try {
            const existing = await User.findByUsername(username);

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
              const emailOwner = await User.findByEmail(email);
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
                const sidOwner = await User.findByStudentId(studentId);
                if (sidOwner && sidOwner.id !== existing.id) {
                  errors.push({
                    row: rowNum,
                    identifier: rowLabel,
                    reason: 'Student ID already in use by another user',
                  });
                  continue;
                }
              }
              await User.update(existing.id, { email, firstName, lastName, studentId: studentId || undefined });
              imported++;
              continue;
            }

            // New user — check email and student ID uniqueness
            const emailOwner = await User.findByEmail(email);
            if (emailOwner) {
              errors.push({
                row: rowNum,
                identifier: rowLabel,
                reason: 'Email already in use by another user',
              });
              continue;
            }
            if (studentId) {
              const sidOwner = await User.findByStudentId(studentId);
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
              studentId: studentId || undefined,
              roleId: roleRecord.id,
            });

            if (sendSetupEmail) {
              try {
                await PasswordResetToken.deleteStaleForUser(newUser.id);
                const tokenRecord = await PasswordResetToken.create(newUser.id, 'setup', 24);
                await sendPasswordSetupEmail(newUser, tokenRecord.token);
              } catch (emailError) {
                console.error('Failed to send setup email:', emailError);
              }
            }

            imported++;
          } catch (rowError) {
            errors.push({ row: rowNum, identifier: rowLabel, reason: rowError.message });
          }
        }

        return reply.send({ imported, skipped, errors });
      } catch (error) {
        console.error('Import error:', error);
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
          targets = await Promise.all(userIds.map((id) => User.findById(id)));
          targets = targets.filter((u) => u && u.status === 'pending');
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
            console.error(`Failed to send setup email to ${u.username}:`, emailError);
            errors.push({ userId: u.id, username: u.username, reason: emailError.message });
          }
        }

        return reply.send({ sent, errors });
      } catch (error) {
        console.error('Send setup emails error:', error);
        return reply.code(500).send({ error: 'Failed to send setup emails' });
      }
    }
  );
}

module.exports = usersRoutes;
