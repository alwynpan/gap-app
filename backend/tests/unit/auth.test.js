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

jest.mock('../../src/models/Subject', () => ({
  findForUser: jest.fn(),
}));

jest.mock('../../src/models/Assignment', () => ({
  findManagedBy: jest.fn(),
}));

jest.mock('../../src/models/UserGroup', () => ({
  findMembershipsForUser: jest.fn(),
}));

jest.mock('../../src/config/index', () => ({
  app: {
    registrationEnabled: true,
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn() },
  maskEmail: (e) => e,
  maskName: (n) => n,
  maskToken: (t) => t,
  maskStudentId: (s) => s,
  redactMeta: (m) => m,
}));

const User = require('../../src/models/User');
const Role = require('../../src/models/Role');
const Subject = require('../../src/models/Subject');
const Assignment = require('../../src/models/Assignment');
const UserGroup = require('../../src/models/UserGroup');
const PasswordResetToken = require('../../src/models/PasswordResetToken');
const { sendPasswordResetEmail } = require('../../src/services/email');
const config = require('../../src/config/index');

describe('Auth Routes', () => {
  const SUBJECT_ID = '30000000-0000-4000-8000-000000000001';
  const ASSIGNMENT_ID = '40000000-0000-4000-8000-000000000001';
  const GROUP_ID = '10000000-0000-4000-8000-000000000001';

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

    // Default hierarchy enrichment mocks
    Subject.findForUser.mockResolvedValue([]);
    UserGroup.findMembershipsForUser.mockResolvedValue([]);
    Assignment.findManagedBy.mockResolvedValue([]);
  });

  describe('POST /auth/register', () => {
    const validRegisterBody = {
      username: 'newuser',
      email: 'new@test.com',
      firstName: 'Test',
      lastName: 'User',
    };

    it('rejects when registration disabled', async () => {
      config.app.registrationEnabled = false;
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: validRegisterBody }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Registration is currently disabled' });
    });

    it('rejects missing username', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { email: 'test@test.com', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects missing email', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects when firstName is missing', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when lastName is missing', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', firstName: 'Test' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('ignores password field — does not reject or use it', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: { ...validRegisterBody, password: 'password123' } }, mockReply);

      // Request succeeds — password is stripped, not rejected
      expect(mockReply.code).toHaveBeenCalledWith(201);
      // User is always created with password: null regardless of what was submitted
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ password: null }));
    });

    it('rejects invalid email format (no @ symbol)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'invalidemail', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('rejects invalid email format (no domain)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('rejects invalid email format (spaces)', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test @email.com', firstName: 'Test', lastName: 'User' } },
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
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'valid@example.com', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).not.toHaveBeenCalledWith(400);
      expect(mockReply.send).not.toHaveBeenCalledWith({ error: 'Invalid email format' });
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('rejects when username already exists', async () => {
      User.findByUsername.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', username: 'existing' });
      User.findByEmail.mockResolvedValue(null);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'existing', email: 'new@test.com', firstName: 'Test', lastName: 'User' } },
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
        { body: { username: 'newuser', email: 'existing@test.com', firstName: 'Test', lastName: 'User' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'An account with those details already exists' });
    });

    it('successfully creates user as pending and always sends setup email', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: 'S123',
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'setup-token' });

      const { sendPasswordSetupEmail } = require('../../src/services/email');

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: { ...validRegisterBody, studentId: 'S123' } }, mockReply);

      // User always created with null password
      expect(User.create).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@test.com',
        password: null,
        firstName: 'Test',
        lastName: 'User',
        studentId: 'S123',
        roleId: '20000000-0000-4000-8000-000000000003',
      });
      // Setup email always sent
      expect(PasswordResetToken.create).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'setup', 24);
      expect(sendPasswordSetupEmail).toHaveBeenCalled();
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

      await capturedHandlers['/auth/register']({ body: { ...validRegisterBody, role: 'admin' } }, mockReply);

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
        { body: { ...validRegisterBody, role: 'assignment_manager' } },
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
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: validRegisterBody }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('handles registration error', async () => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockRejectedValue(new Error('Database error'));

      const { logger: mockLogger } = require('../../src/utils/logger');

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: validRegisterBody }, mockReply);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Registration failed' });
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

    it('successfully logs in user with subjects and memberships and no group claims in the JWT', async () => {
      const mockUser = {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        first_name: 'Test',
        last_name: 'User',
        enabled: true,
        password_hash: 'hash',
        role_name: 'admin',
        student_id: 'S123',
      };
      User.findByUsername.mockResolvedValue(mockUser);
      User.verifyPassword.mockResolvedValue(true);
      mockFastify.generateToken.mockResolvedValue('jwt-token-123');
      Subject.findForUser.mockResolvedValue([{ id: SUBJECT_ID, name: 'Subject 1', created_at: 'now' }]);
      const memberships = [
        {
          assignment_id: ASSIGNMENT_ID,
          assignment_name: 'Assignment 1',
          subject_id: SUBJECT_ID,
          subject_name: 'Subject 1',
          group_id: GROUP_ID,
          group_name: 'Group 1',
        },
      ];
      UserGroup.findMembershipsForUser.mockResolvedValue(memberships);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'testuser', password: 'correctpassword' } }, mockReply);

      // JWT payload must contain only id/username/email/role — no groupId/groupName claims
      expect(mockFastify.generateToken).toHaveBeenCalledWith({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        role: 'admin',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Login successful',
        token: 'jwt-token-123',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'testuser',
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'admin',
          studentId: 'S123',
          subjects: [{ id: SUBJECT_ID, name: 'Subject 1' }],
          memberships,
          managedAssignments: [],
        },
      });
    });

    it('includes managedAssignments for assignment_manager login', async () => {
      const mockUser = {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'manager',
        email: 'am@test.com',
        first_name: 'Man',
        last_name: 'Ager',
        enabled: true,
        password_hash: 'hash',
        role_name: 'assignment_manager',
        student_id: null,
      };
      User.findByUsername.mockResolvedValue(mockUser);
      User.verifyPassword.mockResolvedValue(true);
      const managed = [{ id: ASSIGNMENT_ID, name: 'Assignment 1', subject_id: SUBJECT_ID, subject_name: 'Subject 1' }];
      Assignment.findManagedBy.mockResolvedValue(managed);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'manager', password: 'correctpassword' } }, mockReply);

      expect(Assignment.findManagedBy).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ role: 'assignment_manager', managedAssignments: managed }),
        })
      );
    });

    it('does not query managed assignments for regular user login', async () => {
      const mockUser = {
        id: '00000000-0000-4000-8000-000000000003',
        username: 'regular',
        email: 'reg@test.com',
        first_name: 'Reg',
        last_name: 'User',
        enabled: true,
        password_hash: 'hash',
        role_name: 'user',
        student_id: null,
      };
      User.findByUsername.mockResolvedValue(mockUser);
      User.verifyPassword.mockResolvedValue(true);

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'regular', password: 'correctpassword' } }, mockReply);

      expect(Assignment.findManagedBy).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ managedAssignments: [] }),
        })
      );
    });

    it('handles login error', async () => {
      User.findByUsername.mockRejectedValue(new Error('Database error'));

      const { logger: mockLogger } = require('../../src/utils/logger');

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test', password: 'password' } }, mockReply);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Login failed' });
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

    it('returns current user info enriched with subjects, memberships and managedAssignments', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        first_name: 'Test',
        last_name: 'User',
        role_name: 'admin',
        student_id: null,
      });
      Subject.findForUser.mockResolvedValue([{ id: SUBJECT_ID, name: 'Subject 1', created_at: 'now' }]);
      const memberships = [
        {
          assignment_id: ASSIGNMENT_ID,
          assignment_name: 'Assignment 1',
          subject_id: SUBJECT_ID,
          subject_name: 'Subject 1',
          group_id: GROUP_ID,
          group_name: 'Group 1',
        },
      ];
      UserGroup.findMembershipsForUser.mockResolvedValue(memberships);

      const request = {
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'testuser',
          email: 'test@test.com',
          role: 'admin',
        },
      };

      await capturedHandlers['/auth/me'](request, mockReply);

      expect(User.findById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(Subject.findForUser).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(UserGroup.findMembershipsForUser).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'testuser',
          email: 'test@test.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'admin',
          studentId: null,
          subjects: [{ id: SUBJECT_ID, name: 'Subject 1' }],
          memberships,
          managedAssignments: [],
        },
      });
    });

    it('includes managedAssignments for assignment_manager in /auth/me', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'manager',
        email: 'am@test.com',
        first_name: 'Man',
        last_name: 'Ager',
        role_name: 'assignment_manager',
        student_id: null,
      });
      const managed = [{ id: ASSIGNMENT_ID, name: 'Assignment 1', subject_id: SUBJECT_ID, subject_name: 'Subject 1' }];
      Assignment.findManagedBy.mockResolvedValue(managed);

      const request = { user: { id: '00000000-0000-4000-8000-000000000002' } };
      await capturedHandlers['/auth/me'](request, mockReply);

      expect(Assignment.findManagedBy).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: expect.objectContaining({
          role: 'assignment_manager',
          managedAssignments: managed,
        }),
      });
    });

    it('returns 401 when user found in token but deleted from DB', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findById.mockResolvedValue(null);

      const request = { user: { id: '00000000-0000-4000-8000-000000000001' } };
      await capturedHandlers['/auth/me'](request, mockReply);

      expect(User.findById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns 500 on DB error', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      User.findById.mockRejectedValue(new Error('DB connection lost'));

      const request = { user: { id: '00000000-0000-4000-8000-000000000001' } };
      await capturedHandlers['/auth/me'](request, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to retrieve user info' });
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

      await capturedHandlers['/auth/forgot-password']({ body: { email: 'user@test.com' } }, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'If that email is registered, a reset link has been sent.',
      });
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

    it('calls markUsed before updatePassword to prevent token replay', async () => {
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

      expect(PasswordResetToken.markUsed).toHaveBeenCalledTimes(1);
      expect(User.updatePassword).toHaveBeenCalledTimes(1);
      const markUsedOrder = PasswordResetToken.markUsed.mock.invocationCallOrder[0];
      const updatePasswordOrder = User.updatePassword.mock.invocationCallOrder[0];
      expect(markUsedOrder).toBeLessThan(updatePasswordOrder);
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

      await capturedHandlers['/auth/set-password']({ body: { token: 'sometoken', password: 'newpass1' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to set password' });
    });
  });
});
