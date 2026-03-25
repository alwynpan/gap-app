const User = require('../models/User');
const Role = require('../models/Role');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendPasswordResetEmail, sendPasswordSetupEmail } = require('../services/email');
const config = require('../config/index');
const { parseBody, registerSchema, loginSchema, forgotPasswordSchema, setPasswordSchema } = require('../utils/schemas');

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

      const { data: body, error: validationError } = parseBody(registerSchema, request.body);
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }

      const { username, email, firstName, lastName, studentId, password } = body;

      // Reject any attempt to register with admin or assignment_manager role
      if (request.body.role && request.body.role !== 'user') {
        return reply.code(403).send({ error: 'Registration is only available for regular user accounts' });
      }

      try {
        // Check if username already exists
        const existingUsername = await User.findByUsername(username);
        if (existingUsername) {
          return reply.code(409).send({ error: 'An account with those details already exists' });
        }

        // Check if email already exists
        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
          return reply.code(409).send({ error: 'An account with those details already exists' });
        }

        // Get default user role
        const defaultRole = await Role.findByName('user');

        // Create user - if no password provided, user is created as 'pending' and will receive email to set password
        const newUser = await User.create({
          username,
          email,
          password: password || null,
          firstName,
          lastName,
          studentId,
          roleId: defaultRole.id,
        });

        // Send setup email if no password was provided
        if (!password) {
          try {
            await PasswordResetToken.deleteStaleForUser(newUser.id);
            const tokenRecord = await PasswordResetToken.create(newUser.id, 'setup', 24);
            await sendPasswordSetupEmail(newUser, tokenRecord.token);
          } catch (emailError) {
            console.error('Failed to send setup email:', emailError);
            // Don't fail the request - user was created successfully
          }
        }

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

  // Config route (public) — exposes server-side feature flags to the frontend
  fastify.get('/auth/config', {}, async (_request, reply) => {
    return reply.send({ registrationEnabled: config.app.registrationEnabled });
  });

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
      const { data: body, error: validationError } = parseBody(loginSchema, request.body);
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }
      const { username, password } = body;

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

        // Check if user account is pending (password not yet set)
        if (user.status === 'pending') {
          return reply
            .code(401)
            .send({ error: 'Account setup pending. Please check your email to set your password.' });
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
  fastify.post('/auth/logout', async (_request, reply) => {
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

  // Forgot password — public, sends reset email if email is registered
  fastify.post(
    '/auth/forgot-password',
    {
      config: {
        rateLimit: {
          max: isDev ? 500 : 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const { data: body, error: validationError } = parseBody(forgotPasswordSchema, request.body || {});
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }
      const email = body.email;

      // Always return success to avoid leaking which emails are registered
      const successMsg = { message: 'If that email is registered, a reset link has been sent.' };

      try {
        // Housekeeping: purge expired / used tokens
        await PasswordResetToken.deleteExpired();

        const user = await User.findByEmail(email);
        if (user) {
          await PasswordResetToken.deleteStaleForUser(user.id);
          if (user.status === 'pending') {
            // Account was never activated — resend the setup link (24 h expiry, same as initial)
            const tokenRecord = await PasswordResetToken.create(user.id, 'setup', 24);
            await sendPasswordSetupEmail(user, tokenRecord.token);
          } else {
            // Active or inactive account — send a password reset link (1 h expiry)
            const tokenRecord = await PasswordResetToken.create(user.id, 'reset', 1);
            await sendPasswordResetEmail(user, tokenRecord.token);
          }
        }
        return reply.send(successMsg);
      } catch (error) {
        console.error('Forgot password error:', error);
        // Still return 200 to avoid timing-based enumeration
        return reply.send(successMsg);
      }
    }
  );

  // Set / reset password using a token (public)
  fastify.post(
    '/auth/set-password',
    {
      config: {
        rateLimit: {
          max: isDev ? 500 : 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { data: body, error: validationError } = parseBody(setPasswordSchema, request.body || {});
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }
      const { token, password } = body;

      try {
        // Housekeeping: purge expired / used tokens before lookup
        await PasswordResetToken.deleteExpired();

        const tokenRecord = await PasswordResetToken.findByToken(token);

        if (!tokenRecord || tokenRecord.used || new Date(tokenRecord.expires_at) < new Date()) {
          return reply.code(400).send({ error: 'Invalid or expired token' });
        }

        // Consume the token first — if the password update fails the user requests a new link;
        // this prevents a valid token from persisting after a successful password change.
        await PasswordResetToken.markUsed(tokenRecord.id);

        await User.updatePassword(tokenRecord.user_id, password);

        // Activate the account if this was a first-time setup token
        if (tokenRecord.token_type === 'setup') {
          await User.activate(tokenRecord.user_id);
        }

        return reply.send({ message: 'Password set successfully. You can now log in.' });
      } catch (error) {
        console.error('Set password error:', error);
        return reply.code(500).send({ error: 'Failed to set password' });
      }
    }
  );
}

module.exports = authRoutes;
