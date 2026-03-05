const User = require('../models/User');
const Role = require('../models/Role');
const config = require('../config/index');

async function authRoutes(fastify, options) {
  // Register route
  fastify.post('/auth/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    // Check if registration is enabled
    if (!config.app.registrationEnabled) {
      return reply.code(403).send({ error: 'Registration is currently disabled' });
    }

    const { username, email, password, studentId } = request.body;

    // Validate required fields
    if (!username || !email || !password) {
      return reply.code(400).send({ error: 'Username, email, and password are required' });
    }

    // Validate password length
    if (password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
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
  });

  // Login route
  fastify.post('/auth/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
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
  });

  // Logout route (client-side token removal, but we can invalidate if needed)
  fastify.post('/auth/logout', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    // In a stateless JWT system, logout is client-side (remove token)
    // We could add token blacklisting here if needed
    return reply.send({ message: 'Logout successful' });
  });

  // Get current user info
  fastify.get('/auth/me', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
    preHandler: async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    },
  }, async (request, reply) => {
    return reply.send({
      user: {
        id: request.user.id,
        username: request.user.username,
        email: request.user.email,
        role: request.user.role,
        groupId: request.user.groupId,
        groupName: request.user.groupName,
      },
    });
  });
}

module.exports = authRoutes;
