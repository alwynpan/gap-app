const User = require('../models/User');
const Group = require('../models/Group');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendPasswordSetupEmail } = require('../services/email');

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
        const { username, email, password, firstName, lastName, studentId, groupId, role } = request.body;

        if (!username || !email) {
          return reply.code(400).send({ error: 'Username and email are required' });
        }

        // Validate firstName and lastName are provided
        if (!firstName || !lastName) {
          return reply.code(400).send({ error: 'First name and last name are required' });
        }

        // If a password is provided, validate its length
        if (password && password.length < 6) {
          return reply.code(400).send({ error: 'Password must be at least 6 characters' });
        }

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

        // If a group is specified, verify it exists and has capacity
        if (groupId) {
          const group = await Group.findById(groupId);
          if (!group) {
            return reply.code(404).send({ error: 'Group not found' });
          }
          if (group.max_members !== null && group.member_count >= group.max_members) {
            return reply.code(400).send({ error: 'Group is full' });
          }
        }

        // Get role ID by name lookup
        const Role = require('../models/Role');
        const roleRecord = await Role.findByName(role || 'user');
        if (!roleRecord) {
          return reply.code(400).send({ error: `Invalid role: ${role}` });
        }
        const roleId = roleRecord.id;

        const newUser = await User.create({
          username,
          email,
          password: password || null,
          firstName,
          lastName,
          studentId,
          groupId,
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
        const { groupId } = request.body;

        if (groupId === undefined) {
          return reply.code(400).send({ error: 'groupId is required' });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // If groupId is not null, verify group exists and has capacity
        if (groupId !== null) {
          const group = await Group.findById(groupId);
          if (!group) {
            return reply.code(404).send({ error: 'Group not found' });
          }
          if (group.max_members !== null && group.member_count >= group.max_members) {
            return reply.code(400).send({ error: 'Group is full' });
          }
        }

        const updatedUser = await User.updateGroup(userId, groupId);

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
      },
    },
    async (request, reply) => {
      try {
        const userId = request.params.id;
        const { username, email, firstName, lastName, studentId, groupId, role, enabled } = request.body;

        const user = await User.findById(userId);
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
            const Role = require('../models/Role');
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

        return reply.send({
          message: 'User updated successfully',
          user: updatedUser,
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
        const { currentPassword, newPassword } = request.body;

        if (!newPassword || newPassword.length < 6) {
          return reply.code(400).send({ error: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // All users must verify their current password before changing it
        if (!currentPassword) {
          return reply.code(400).send({ error: 'Current password is required' });
        }
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
}

module.exports = usersRoutes;
