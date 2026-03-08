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
  delete: jest.fn(),
  verifyPassword: jest.fn(),
}));

jest.mock('../../src/models/Role', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../src/config/index', () => ({
  app: {
    registrationEnabled: true,
  },
}));

const User = require('../../src/models/User');
const Role = require('../../src/models/Role');
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
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username, email, and password are required' });
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

    it('rejects short password (less than 6 chars)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', password: '12345' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Password must be at least 6 characters' });
    });

    it('rejects invalid email format (no @ symbol)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'invalidemail', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('rejects invalid email format (no domain)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('rejects invalid email format (spaces)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test @email.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('accepts valid email format', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: 3, name: 'user' });
      User.create.mockResolvedValue({
        id: 1,
        username: 'testuser',
        email: 'valid@example.com',
        student_id: null,
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'valid@example.com', password: 'password123' } },
        mockReply
      );

      // Verify email validation passed (no 400 error for invalid email)
      expect(mockReply.code).not.toHaveBeenCalledWith(400);
      expect(mockReply.send).not.toHaveBeenCalledWith({ error: 'Invalid email format' });
      // Verify registration proceeded successfully
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('rejects when username already exists', async () => {
      User.findByUsername.mockResolvedValue({ id: 1, username: 'existing' });
      User.findByEmail.mockResolvedValue(null);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'existing', email: 'new@test.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username already exists' });
    });

    it('rejects when email already exists', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue({ id: 1, email: 'existing@test.com' });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'newuser', email: 'existing@test.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Email already exists' });
    });

    it('successfully creates user with default role', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: 3, name: 'user' });
      User.create.mockResolvedValue({
        id: 1,
        username: 'newuser',
        email: 'new@test.com',
        student_id: 'S123',
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'newuser', email: 'new@test.com', password: 'password123', studentId: 'S123' } },
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        studentId: 'S123',
        roleId: 3,
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User registered successfully',
        user: {
          id: 1,
          username: 'newuser',
          email: 'new@test.com',
          studentId: 'S123',
        },
      });
    });

    it('successfully creates user without studentId', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: 3, name: 'user' });
      User.create.mockResolvedValue({
        id: 1,
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'newuser', email: 'new@test.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('handles registration error', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: 3, name: 'user' });
      User.create.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'newuser', email: 'new@test.com', password: 'password123' } },
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
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username and password are required' });
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
      User.findByUsername.mockResolvedValue({ id: 1, username: 'test', enabled: false, password_hash: 'hash' });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test', password: 'password123' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Account is disabled' });
    });

    it('rejects when password is incorrect', async () => {
      User.findByUsername.mockResolvedValue({
        id: 1,
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
        id: 1,
        username: 'testuser',
        email: 'test@test.com',
        enabled: true,
        password_hash: 'hash',
        role_name: 'admin',
        group_id: 1,
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
        id: 1,
        username: 'testuser',
        email: 'test@test.com',
        role: 'admin',
        groupId: 1,
        groupName: 'Team A',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Login successful',
        token: 'jwt-token-123',
        user: {
          id: 1,
          username: 'testuser',
          email: 'test@test.com',
          role: 'admin',
          groupId: 1,
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
        user: { id: 1, username: 'test', email: 'test@test.com', role: 'user', groupId: 1, groupName: 'Team' },
      };

      const result = await capturedHandlers['/auth/me_pre'](request, mockReply);

      expect(result).toBeUndefined();
    });

    it('returns current user info', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      const request = {
        user: { id: 1, username: 'testuser', email: 'test@test.com', role: 'admin', groupId: 1, groupName: 'Team A' },
      };

      await capturedHandlers['/auth/me'](request, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        user: {
          id: 1,
          username: 'testuser',
          email: 'test@test.com',
          role: 'admin',
          groupId: 1,
          groupName: 'Team A',
        },
      });
    });
  });
});
