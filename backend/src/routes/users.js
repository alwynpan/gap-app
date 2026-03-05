const User = require('../models/User');
const Group = require('../models/Group');

async function usersRoutes(fastify, _options) {
  // Get all users (admin/team_manager only)
  fastify.get(
    '/users',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.checkRole(request, reply, ['admin', 'team_manager']);
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
        // Users can view their own profile, admin/team_manager can view all
        const userId = parseInt(request.params.id, 10);
        if (request.user.id !== userId) {
          const allowed = await fastify.checkRole(request, reply, ['admin', 'team_manager']);
          if (!allowed) {
            return reply;
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const userId = parseInt(request.params.id, 10);
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

  // Create new user (admin only)
  fastify.post(
    '/users',
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
        const { username, email, password, studentId, groupId, role } = request.body;

        if (!username || !email || !password) {
          return reply.code(400).send({ error: 'Username, email, and password are required' });
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

        // Get role ID
        let roleId = 3; // default to 'user'
        if (role) {
          const Role = require('../models/Role');
          const roleRecord = await Role.findByName(role);
          if (roleRecord) {
            roleId = roleRecord.id;
          }
        }

        const newUser = await User.create({
          username,
          email,
          password,
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

  // Update user's group assignment (admin/team_manager only)
  fastify.put(
    '/users/:id/group',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const allowed = await fastify.checkRole(request, reply, ['admin', 'team_manager']);
        if (!allowed) {
          return reply;
        }
      },
    },
    async (request, reply) => {
      try {
        const userId = parseInt(request.params.id, 10);
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

  // Update user (admin only for full updates)
  fastify.put(
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
        const userId = parseInt(request.params.id, 10);
        const { username, email, studentId, groupId, roleId, enabled } = request.body;

        const user = await User.findById(userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        const updatedUser = await User.update(userId, {
          username,
          email,
          studentId,
          groupId,
          roleId,
          enabled,
        });

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
        const userId = parseInt(request.params.id, 10);

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
