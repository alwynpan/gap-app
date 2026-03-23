const User = require('../models/User');
const Group = require('../models/Group');

async function usersRoutes(fastify, _options) {
  // Get all users (admin/assignment_manager only)
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
        const users = await User.findAll();
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

  // Create new user (admin/assignment_manager)
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

        if (!username || !email || !password) {
          return reply.code(400).send({ error: 'Username, email, and password are required' });
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
          password,
          firstName,
          lastName,
          studentId,
          groupId,
          roleId,
        });

        return reply.code(201).send({
          message: 'User created successfully',
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
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

        // If groupId is not null, verify group exists
        if (groupId !== null) {
          const group = await Group.findById(groupId);
          if (!group) {
            return reply.code(404).send({ error: 'Group not found' });
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

  // Update user (admin can edit any user; users can edit their own profile)
  fastify.put(
    '/users/:id',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const userId = request.params.id;
        // Non-admin users can only edit themselves
        if (request.user.id !== userId && request.user.role !== 'admin') {
          return reply.code(403).send({ error: 'Forbidden: You can only edit your own profile' });
        }
      },
    },
    async (request, reply) => {
      try {
        const userId = request.params.id;
        const { username, email, firstName, lastName, studentId, groupId, roleId, enabled } = request.body;

        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // Non-admin users can only update basic profile fields
        const isAdmin = request.user.role === 'admin';
        const updates = { username, email, firstName, lastName, studentId };
        if (isAdmin) {
          updates.groupId = groupId;
          updates.roleId = roleId;
          updates.enabled = enabled;
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

  // Change password (any user can change their own; admin can change anyone's)
  fastify.put(
    '/users/:id/password',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const userId = request.params.id;
        if (request.user.id !== userId && request.user.role !== 'admin') {
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

        // Non-admin users must provide current password
        const isAdmin = request.user.role === 'admin';
        if (!isAdmin) {
          if (!currentPassword) {
            return reply.code(400).send({ error: 'Current password is required' });
          }
          const userWithPassword = await User.findByUsername(user.username);
          const valid = await User.verifyPassword(currentPassword, userWithPassword.password_hash);
          if (!valid) {
            return reply.code(401).send({ error: 'Current password is incorrect' });
          }
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
