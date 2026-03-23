const User = require('../models/User');
const Role = require('../models/Role');
const config = require('../config/index');

async function authRoutes(fastify, _options) {
  const isDev = config.app.nodeEnv === 'development';
  // Register route (stricter limit by default; relaxed only in dev for e2e tests)
  fastify.post(
    '/auth/register',
    {
      config: {
        rateLimit: {
          max: isDev ? 500 : 3,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      // Check if registration is enabled
      if (!config.app.registrationEnabled) {
        return reply.code(403).send({ error: 'Registration is currently disabled' });
      }

      const { username, email, password, firstName, lastName, studentId } = request.body;

      // Validate required fields
      if (!username || !email || !password) {
        return reply.code(400).send({ error: 'Username, email, and password are required' });
      }

      // Validate password length
      if (password.length < 6) {
        return reply.code(400).send({ error: 'Password must be at least 6 characters' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return reply.code(400).send({ error: 'Invalid email format' });
      }

      try {
        // Check if username already exists
        const existingUsername = await User.findByUsername(username);
        if (existingUsername) {
          return reply.code(409).send({ error: 'Username already exists' });
        }

        // Check if email already exists
        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
          return reply.code(409).send({ error: 'Email already exists' });
        }

        // Get default user role (id=3 is 'user')
        const defaultRole = await Role.findByName('user');

        // Create user
        const newUser = await User.create({
          username,
          email,
          password,
          firstName,
          lastName,
          studentId,
          roleId: defaultRole.id,
        });

        return reply.code(201).send({
          message: 'User registered successfully',
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            studentId: newUser.student_id,
          },
        });
      } catch (error) {
        console.error('Registration error:', error);
        return reply.code(500).send({ error: 'Registration failed' });
      }
    }
  );

  // Login route (strict limit by default; relaxed only in dev for e2e tests)
  fastify.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: isDev ? 500 : 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;

      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password are required' });
      }

      try {
        // Find user by username
        const user = await User.findByUsername(username);
        if (!user) {
          return reply.code(401).send({ error: 'Invalid credentials' });
        }

        // Check if user is enabled
        if (!user.enabled) {
          return reply.code(401).send({ error: 'Account is disabled' });
        }

        // Verify password
        const isValid = await User.verifyPassword(password, user.password_hash);
        if (!isValid) {
          return reply.code(401).send({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = await fastify.generateToken({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role_name,
          groupId: user.group_id,
          groupName: user.group_name,
        });

        return reply.send({
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role_name,
            groupId: user.group_id,
            groupName: user.group_name,
            studentId: user.student_id,
          },
        });
      } catch (error) {
        console.error('Login error:', error);
        return reply.code(500).send({ error: 'Login failed' });
      }
    }
  );

  // Logout route
  fastify.post('/auth/logout', async (request, reply) => {
    // In a stateless JWT system, logout is client-side (remove token)
    // We could add token blacklisting here if needed
    return reply.send({ message: 'Logout successful' });
  });

  // Get current user info (fresh from DB, not stale JWT claims)
  fastify.get(
    '/auth/me',
    {
      preHandler: async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      try {
        const freshUser = await User.findById(request.user.id);
        if (!freshUser) {
          return reply.code(401).send({ error: 'User not found' });
        }

        return reply.send({
          user: {
            id: freshUser.id,
            username: freshUser.username,
            email: freshUser.email,
            firstName: freshUser.first_name,
            lastName: freshUser.last_name,
            role: freshUser.role_name,
            groupId: freshUser.group_id,
            groupName: freshUser.group_name,
            studentId: freshUser.student_id,
          },
        });
      } catch (error) {
        console.error('Get current user error:', error);
        return reply.code(500).send({ error: 'Failed to retrieve user info' });
      }
    }
  );
}

module.exports = authRoutes;
