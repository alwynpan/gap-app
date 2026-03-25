// Mock models at the top level before requiring routes
jest.mock('../../src/models/User', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByUsername: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateGroup: jest.fn(),
  updatePassword: jest.fn(),
  activate: jest.fn(),
  delete: jest.fn(),
  verifyPassword: jest.fn(),
}));

jest.mock('../../src/models/Role', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../src/models/PasswordResetToken', () => ({
  create: jest.fn(),
  findByToken: jest.fn(),
  markUsed: jest.fn(),
  deleteStaleForUser: jest.fn(),
  deleteExpired: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../src/services/email', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendPasswordSetupEmail: jest.fn(),
  sendEmail: jest.fn(),
}));

jest.mock('../../src/config/index', () => ({
  app: {
    registrationEnabled: true,
  },
}));

const User = require('../../src/models/User');
const Role = require('../../src/models/Role');
const PasswordResetToken = require('../../src/models/PasswordResetToken');
const { sendPasswordResetEmail } = require('../../src/services/email');
const config = require('../../src/config/index');

describe('Auth Routes', () => {
  let mockReply;
  let mockFastify;
  let capturedHandlers;

  beforeEach(() => {
    // Reset all mocks and config
    jest.clearAllMocks();
    config.app.registrationEnabled = true;

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    capturedHandlers = {};
    mockFastify = {
      post: jest.fn((path, ...args) => {
        const handler = args.find((arg) => typeof arg === 'function');
        if (handler) {
          capturedHandlers[path] = handler;
        }
      }),
      get: jest.fn((path, config, handler) => {
        if (config && config.preHandler) {
          capturedHandlers[`${path}_pre`] = config.preHandler;
        }
        if (handler) {
          capturedHandlers[path] = handler;
        }
      }),
      generateToken: jest.fn().mockResolvedValue('mock-token'),
    };
  });

  describe('POST /auth/register', () => {
    it('rejects when registration disabled', async () => {
      config.app.registrationEnabled = false;
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Registration is currently disabled' });
    });

    it('rejects missing username', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { email: 'test@test.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects missing email', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: { username: 'test', password: 'password123' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects missing password', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: { username: 'test', email: 'test@test.com' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects when firstName is missing', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', password: 'password123', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when lastName is missing', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', password: 'password123', firstName: 'Test' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects short password (less than 6 chars)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', password: '12345', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Password must be at least 6 characters' });
    });

    it('rejects invalid email format (no @ symbol)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'test',
            email: 'invalidemail',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('rejects invalid email format (no domain)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@', password: 'password123', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('rejects invalid email format (spaces)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'test',
            email: 'test @email.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('accepts valid email format', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'valid@example.com',
        student_id: null,
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'test',
            email: 'valid@example.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        mockReply
      );

      // Verify email validation passed (no 400 error for invalid email)
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
      expect(mockReply.send).not.toHaveBeenCalledWith({ error: 'Invalid email format' });
      // Verify registration proceeded successfully
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('rejects when username already exists', async () => {
      User.findByUsername.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', username: 'existing' });
      User.findByEmail.mockResolvedValue(null);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'existing',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'An account with those details already exists' });
    });

    it('rejects when email already exists', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        email: 'existing@test.com',
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'newuser',
            email: 'existing@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'An account with those details already exists' });
    });

    it('successfully creates user with default role', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: 'S123',
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            studentId: 'S123',
          },
        },
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        studentId: 'S123',
        roleId: '20000000-0000-4000-8000-000000000003',
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User registered successfully',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'newuser',
          email: 'new@test.com',
          studentId: 'S123',
        },
      });
    });

    it('rejects registration with admin role', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'newadmin',
            email: 'admin@test.com',
            password: 'password123',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Registration is only available for regular user accounts',
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('rejects registration with assignment_manager role', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'newam',
            email: 'am@test.com',
            password: 'password123',
            firstName: 'AM',
            lastName: 'User',
            role: 'assignment_manager',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Registration is only available for regular user accounts',
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('successfully creates user without studentId', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('handles registration error', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
          },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Registration failed' });

      consoleSpy.mockRestore();
    });
  });

  describe('POST /auth/login', () => {
    it('rejects missing username', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { password: 'password123' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects missing password', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects when user not found', async () => {
      User.findByUsername.mockResolvedValue(null);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'nonexistent', password: 'password123' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('rejects when user is disabled', async () => {
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
        enabled: false,
        password_hash: 'hash',
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test', password: 'password123' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Account is disabled' });
    });

    it('rejects when user status is pending', async () => {
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
        enabled: true,
        status: 'pending',
        password_hash: null,
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test', password: 'password123' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('pending') })
      );
    });

    it('rejects when password is incorrect', async () => {
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
        enabled: true,
        password_hash: 'hash',
        role_name: 'user',
        group_id: null,
        group_name: null,
      });
      User.verifyPassword.mockResolvedValue(false);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test', password: 'wrongpassword' } }, mockReply);

      expect(User.verifyPassword).toHaveBeenCalledWith('wrongpassword', 'hash');
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('successfully logs in user', async () => {
      const mockUser = {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        enabled: true,
        password_hash: 'hash',
        role_name: 'admin',
        group_id: '10000000-0000-4000-8000-000000000001',
        group_name: 'Team A',
        student_id: 'S123',
      };
      User.findByUsername.mockResolvedValue(mockUser);
      User.verifyPassword.mockResolvedValue(true);
      mockFastify.generateToken.mockResolvedValue('jwt-token-123');

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'testuser', password: 'correctpassword' } }, mockReply);

      expect(mockFastify.generateToken).toHaveBeenCalledWith({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        role: 'admin',
        groupId: '10000000-0000-4000-8000-000000000001',
        groupName: 'Team A',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Login successful',
        token: 'jwt-token-123',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'testuser',
          email: 'test@test.com',
          role: 'admin',
          groupId: '10000000-0000-4000-8000-000000000001',
          groupName: 'Team A',
          studentId: 'S123',
        },
      });
    });

    it('handles login error', async () => {
      User.findByUsername.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test', password: 'password' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Login failed' });

      consoleSpy.mockRestore();
    });
  });

  describe('POST /auth/logout', () => {
    it('returns success message', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/logout']({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Logout successful' });
    });
  });

  describe('GET /auth/config', () => {
    it('returns registrationEnabled true when enabled', async () => {
      config.app.registrationEnabled = true;
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/config']({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ registrationEnabled: true });
    });

    it('returns registrationEnabled false when disabled', async () => {
      config.app.registrationEnabled = false;
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/config']({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ registrationEnabled: false });
    });
  });

  describe('GET /auth/me', () => {
    it('rejects unauthenticated request', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/me_pre']({ user: null }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('allows authenticated request', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      const request = {
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'test',
          email: 'test@test.com',
          role: 'user',
          groupId: '10000000-0000-4000-8000-000000000001',
          groupName: 'Team',
        },
      };

      const result = await capturedHandlers['/auth/me_pre'](request, mockReply);

      expect(result).toBeUndefined();
    });

    it('returns current user info', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        role_name: 'admin',
        group_id: '10000000-0000-4000-8000-000000000001',
        group_name: 'Team A',
        student_id: null,
      });

      const request = {
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'testuser',
          email: 'test@test.com',
          role: 'admin',
          groupId: '10000000-0000-4000-8000-000000000001',
          groupName: 'Team A',
        },
      };

      await capturedHandlers['/auth/me'](request, mockReply);

      expect(User.findById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'testuser',
          email: 'test@test.com',
          role: 'admin',
          groupId: '10000000-0000-4000-8000-000000000001',
          groupName: 'Team A',
          studentId: null,
        },
      });
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('returns 400 when email is missing', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/forgot-password']({ body: {} }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('returns 200 and sends reset email when user found with active status', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      const mockUser = {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'user@test.com',
        username: 'testuser',
        status: 'active',
      };
      User.findByEmail.mockResolvedValue(mockUser);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'resettoken123', id: 't1' });
      sendPasswordResetEmail.mockResolvedValue();

      await capturedHandlers['/auth/forgot-password']({ body: { email: 'user@test.com' } }, mockReply);

      expect(User.findByEmail).toHaveBeenCalledWith('user@test.com');
      expect(PasswordResetToken.deleteStaleForUser).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(PasswordResetToken.create).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'reset', 1);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(mockUser, 'resettoken123');
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'If that email is registered, a reset link has been sent.',
      });
    });

    it('returns 200 without sending email when user not found (enumeration prevention)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findByEmail.mockResolvedValue(null);

      await capturedHandlers['/auth/forgot-password']({ body: { email: 'unknown@test.com' } }, mockReply);

      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'If that email is registered, a reset link has been sent.',
      });
    });

    it('resends setup email when user has pending status', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      const { sendPasswordSetupEmail } = require('../../src/services/email');
      const pendingUser = {
        id: 'u1',
        email: 'pending@test.com',
        username: 'pendinguser',
        status: 'pending',
      };
      User.findByEmail.mockResolvedValue(pendingUser);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'setuptoken123', id: 't2' });
      sendPasswordSetupEmail.mockResolvedValue();

      await capturedHandlers['/auth/forgot-password']({ body: { email: 'pending@test.com' } }, mockReply);

      expect(PasswordResetToken.create).toHaveBeenCalledWith('u1', 'setup', 24);
      expect(sendPasswordSetupEmail).toHaveBeenCalledWith(pendingUser, 'setuptoken123');
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'If that email is registered, a reset link has been sent.',
      });
    });

    it('calls deleteExpired before processing', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findByEmail.mockResolvedValue(null);

      await capturedHandlers['/auth/forgot-password']({ body: { email: 'user@test.com' } }, mockReply);

      expect(PasswordResetToken.deleteExpired).toHaveBeenCalled();
      // deleteExpired should be called before findByEmail
      const deleteExpiredOrder = PasswordResetToken.deleteExpired.mock.invocationCallOrder[0];
      const findByEmailOrder = User.findByEmail.mock.invocationCallOrder[0];
      expect(deleteExpiredOrder).toBeLessThan(findByEmailOrder);
    });

    it('returns 200 even when an internal error occurs', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findByEmail.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await capturedHandlers['/auth/forgot-password']({ body: { email: 'user@test.com' } }, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'If that email is registered, a reset link has been sent.',
      });
      consoleSpy.mockRestore();
    });
  });

  describe('POST /auth/set-password', () => {
    it('returns 400 when token or password is missing', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/set-password']({ body: { token: 'tok' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('returns 400 when password is too short', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/set-password']({ body: { token: 'tok', password: 'abc' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Password must be at least 6 characters' });
    });

    it('calls deleteExpired before looking up token', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      PasswordResetToken.findByToken.mockResolvedValue(null);

      await capturedHandlers['/auth/set-password']({ body: { token: 'sometoken', password: 'newpass1' } }, mockReply);

      expect(PasswordResetToken.deleteExpired).toHaveBeenCalled();
      const deleteExpiredOrder = PasswordResetToken.deleteExpired.mock.invocationCallOrder[0];
      const findByTokenOrder = PasswordResetToken.findByToken.mock.invocationCallOrder[0];
      expect(deleteExpiredOrder).toBeLessThan(findByTokenOrder);
    });

    it('returns 400 for expired token', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      PasswordResetToken.findByToken.mockResolvedValue({
        id: 't1',
        user_id: 'u1',
        token_type: 'reset',
        used: false,
        expires_at: new Date(Date.now() - 3600000), // 1 hour in the past
      });

      await capturedHandlers['/auth/set-password'](
        { body: { token: 'expiredtoken', password: 'newpass1' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    it('returns 400 when token is invalid or expired', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      PasswordResetToken.findByToken.mockResolvedValue(null);

      await capturedHandlers['/auth/set-password']({ body: { token: 'badtoken', password: 'newpass1' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    it('returns 400 when token is already used', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      PasswordResetToken.findByToken.mockResolvedValue({
        id: 't1',
        user_id: 'u1',
        token_type: 'reset',
        used: true,
        expires_at: new Date(Date.now() + 3600000),
      });

      await capturedHandlers['/auth/set-password']({ body: { token: 'usedtoken', password: 'newpass1' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    it('sets password and returns success for reset token', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      PasswordResetToken.findByToken.mockResolvedValue({
        id: 't1',
        user_id: '00000000-0000-4000-8000-000000000001',
        token_type: 'reset',
        used: false,
        expires_at: new Date(Date.now() + 3600000),
      });
      User.updatePassword.mockResolvedValue();
      PasswordResetToken.markUsed.mockResolvedValue();

      await capturedHandlers['/auth/set-password']({ body: { token: 'validtoken', password: 'newpass1' } }, mockReply);

      expect(User.updatePassword).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'newpass1');
      expect(User.activate).not.toHaveBeenCalled();
      expect(PasswordResetToken.markUsed).toHaveBeenCalledWith('t1');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Password set successfully. You can now log in.' });
    });

    it('activates user when token type is setup', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      PasswordResetToken.findByToken.mockResolvedValue({
        id: 't2',
        user_id: '00000000-0000-4000-8000-000000000002',
        token_type: 'setup',
        used: false,
        expires_at: new Date(Date.now() + 3600000),
      });
      User.updatePassword.mockResolvedValue();
      User.activate.mockResolvedValue();
      PasswordResetToken.markUsed.mockResolvedValue();

      await capturedHandlers['/auth/set-password']({ body: { token: 'setuptoken', password: 'newpass1' } }, mockReply);

      expect(User.activate).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Password set successfully. You can now log in.' });
    });

    it('returns 500 on unexpected error', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      PasswordResetToken.findByToken.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await capturedHandlers['/auth/set-password']({ body: { token: 'sometoken', password: 'newpass1' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to set password' });
      consoleSpy.mockRestore();
    });
  });
});
