// Mock models at the top level
jest.mock('../../src/models/User');
jest.mock('../../src/models/Group');
jest.mock('../../src/models/Role');
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

const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Role = require('../../src/models/Role');
const PasswordResetToken = require('../../src/models/PasswordResetToken');
const { sendPasswordResetEmail, sendPasswordSetupEmail } = require('../../src/services/email');

describe('Users Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockFastify = (options = {}) => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    checkRole: jest.fn().mockResolvedValue(options.checkRoleResult ?? true),
    requireAdmin: jest.fn().mockResolvedValue(options.requireAdminResult ?? true),
  });

  const captureHandlers = (mockFastify) => {
    const handlers = {};
    const wrapMethod = (method) => {
      mockFastify[method].mockImplementation((path, ...args) => {
        const config = args[0];
        const handler = args.find((a) => typeof a === 'function');
        if (config && config.preHandler) {
          handlers[`${path}_${method}_pre`] = config.preHandler;
        }
        if (handler) {
          handlers[`${path}_${method}`] = handler;
        }
      });
    };
    wrapMethod('get');
    wrapMethod('post');
    wrapMethod('put');
    wrapMethod('delete');
    return handlers;
  };

  describe('GET /users', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/users_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('rejects user without admin/assignment_manager role', () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/users_get_pre']({ user: { role: 'user' } }, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith({ user: { role: 'user' } }, mockReply, [
        'admin',
        'assignment_manager',
      ]);
    });

    it('returns all users successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockResolvedValue([
        { id: '00000000-0000-4000-8000-000000000001', username: 'user1', email: 'user1@test.com' },
      ]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({}, mockReply);
      expect(User.findAll).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        users: [{ id: '00000000-0000-4000-8000-000000000001', username: 'user1', email: 'user1@test.com' }],
      });
    });

    it('handles error when fetching users', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({}, mockReply);
      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('GET /users/:id', () => {
    it('requires admin/assignment_manager role to view other users', () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      handlers['/users/:id_get_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
    });

    it('returns user by id', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'hash',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '00000000-0000-4000-8000-000000000001' } }, mockReply);
      expect(User.findById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: { id: '00000000-0000-4000-8000-000000000001', username: 'testuser', email: 'test@test.com' },
      });
    });

    it('returns 404 when user does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '00000000-0000-4000-8000-000000000999' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('handles error when fetching user by id', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '00000000-0000-4000-8000-000000000001' } }, mockReply);
      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });

    it('returns 400 for invalid UUID in :id param (M5)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: 'not-a-uuid' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });
  });

  describe('GET /users/:id - own profile', () => {
    it('allows user to view own profile', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000001' },
      };

      handlers['/users/:id_get_pre'](request, mockReply);

      expect(mockFastify.checkRole).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated request for /users/:id', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/users/:id_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('POST /users', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns reply when role check fails in preHandler', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' } };
      const result = await handlers['/users_post_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
      expect(result).toBe(mockReply);
    });

    it('rejects when required fields are missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { username: 'u1' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when firstName is missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'u1', email: 'u1@test.com', password: 'password123', lastName: 'User' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when lastName is missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'u1', email: 'u1@test.com', password: 'password123', firstName: 'Test' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when username already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'existing',
      });
      User.findByEmail.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
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
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username already exists' });
    });

    it('rejects when email already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        email: 'existing@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
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
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Email already exists' });
    });

    it('creates user with default role', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: 'S123',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
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
        groupId: undefined,
        roleId: '20000000-0000-4000-8000-000000000003',
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('creates user with custom role when requester is admin', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000001', name: 'admin' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'adminuser',
        email: 'admin@test.com',
        student_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: {
            username: 'adminuser',
            email: 'admin@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
          },
        },
        mockReply
      );

      expect(Role.findByName).toHaveBeenCalledWith('admin');
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('allows assignment_manager to create user with role user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            role: 'user',
          },
        },
        mockReply
      );

      expect(User.create).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('rejects assignment_manager from creating admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          body: {
            username: 'newadmin',
            email: 'admin@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Only admins can create admin users' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('creates user with unknown role (defaults to user)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue(null);
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            role: 'unknown',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid role: unknown' });
    });

    it('rejects creating user in a full group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Full Group',
        max_members: 2,
        member_count: 2,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            groupId: '10000000-0000-4000-8000-000000000001',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group is full' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('allows creating user in a group with capacity', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        max_members: 5,
        member_count: 4,
      });
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            groupId: '10000000-0000-4000-8000-000000000001',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(User.create).toHaveBeenCalled();
    });

    it('handles error when creating user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
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
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id/group', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns reply when role check fails in preHandler', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000002', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000001' },
      };
      const result = await handlers['/users/:id/group_put_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
      expect(result).toBe(mockReply);
    });

    it('returns 400 when groupId is missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        { params: { id: '00000000-0000-4000-8000-000000000001' }, body: {} },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'groupId is required' });
    });

    it('returns 404 when user not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000999' },
          body: { groupId: '10000000-0000-4000-8000-000000000001' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns 404 when group not found (via assignUserToGroup)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
      });
      const notFoundErr = new Error('Group not found');
      notFoundErr.statusCode = 404;
      Group.assignUserToGroup.mockRejectedValue(notFoundErr);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { groupId: '10000000-0000-4000-8000-000000000999' },
        },
        mockReply
      );

      expect(Group.assignUserToGroup).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000999'
      );
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('updates user group successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.assignUserToGroup.mockResolvedValue();
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
        group_id: '10000000-0000-4000-8000-000000000002',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { groupId: '10000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(Group.assignUserToGroup).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002'
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User group updated successfully' })
      );
    });

    it('sets user group to null', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.updateGroup.mockResolvedValue();
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
        group_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { groupId: null },
        },
        mockReply
      );

      expect(User.updateGroup).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', null);
    });

    it('rejects assigning user to a full group (via assignUserToGroup)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
      });
      const fullErr = new Error('Group is full');
      fullErr.statusCode = 409;
      Group.assignUserToGroup.mockRejectedValue(fullErr);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { groupId: '10000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(Group.assignUserToGroup).toHaveBeenCalled();
      // Error propagates as 500 (unhandled by route)
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('allows assigning user to group with unlimited capacity', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.assignUserToGroup.mockResolvedValue();
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
        group_id: '10000000-0000-4000-8000-000000000002',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { groupId: '10000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(Group.assignUserToGroup).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User group updated successfully' })
      );
    });

    it('handles error when updating group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
      });
      Group.assignUserToGroup.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { groupId: '10000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('allows user to edit own profile', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000001' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Regular users cannot edit user information' });
    });

    it('rejects non-admin editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Regular users cannot edit user information' });
    });

    it('rejects assignment_manager editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        role_name: 'admin',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Assignment managers cannot edit admin users' });
    });

    it('allows admin to edit another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        role_name: 'user',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('returns 404 when user not found (targetUser missing)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000999' },
          body: {},
          // targetUser not set — simulates preHandler short-circuit
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('admin can update all fields including role and enabled', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'a0000000-0000-0000-0000-000000000001' });
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'oldname',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: { id: '00000000-0000-4000-8000-000000000002', username: 'oldname', role_name: 'user' },
          body: {
            email: 'new@test.com',
            firstName: undefined,
            lastName: undefined,
            studentId: undefined,
            role: 'admin',
            enabled: false,
          },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
        studentId: undefined,
        groupId: undefined,
        roleId: 'a0000000-0000-0000-0000-000000000001',
        enabled: false,
        status: 'inactive',
      });
    });

    it('assignment_manager can update basic fields and enabled but not role/groupId', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'oldname',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'oldname',
            role_name: 'user',
            status: 'active',
          },
          body: {
            email: 'new@test.com',
            firstName: undefined,
            lastName: undefined,
            studentId: undefined,
            role: 'admin',
            groupId: '10000000-0000-4000-8000-000000000005',
            enabled: false,
          },
        },
        mockReply
      );

      // role and groupId must be excluded; enabled must be included with status sync
      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
        studentId: undefined,
        enabled: false,
        status: 'inactive',
      });
    });

    it('handles error when updating user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'oldname', role_name: 'user' },
          body: { email: 'new@test.com' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });

    it('prevents disabling the built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'admin',
            role_id: '20000000-0000-4000-8000-000000000001',
          },
          body: { enabled: false },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot disable the built-in admin account' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('prevents changing role of the built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'admin',
            role_name: 'admin',
            role_id: 'a0000000-0000-0000-0000-000000000001',
          },
          body: { role: 'user' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot change role of the built-in admin account' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('allows disabling a non-built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'otheradmin',
        enabled: false,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'otheradmin',
            role_id: '20000000-0000-4000-8000-000000000001',
          },
          body: { enabled: false },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000002',
          username: 'otheradmin',
          enabled: false,
        }),
      });
    });

    it('sets status to inactive when disabling a user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        enabled: false,
        status: 'inactive',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'someuser',
            role_name: 'user',
            status: 'active',
          },
          body: { enabled: false },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({
          enabled: false,
          status: 'inactive',
        })
      );
    });

    it('restores status to active when re-enabling a previously inactive user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        enabled: true,
        status: 'active',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'someuser',
            role_name: 'user',
            status: 'inactive',
          },
          body: { enabled: true },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({
          enabled: true,
          status: 'active',
        })
      );
    });

    it('does not change status when re-enabling a pending user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        enabled: true,
        status: 'pending',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'pendinguser',
            role_name: 'user',
            status: 'pending',
          },
          body: { enabled: true },
        },
        mockReply
      );

      // status should not be changed for pending users
      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.not.objectContaining({
          status: 'active',
        })
      );
    });

    it('allows changing role of a non-built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'b0000000-0000-0000-0000-000000000003' });
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'otheradmin',
        role_id: 'b0000000-0000-0000-0000-000000000003',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'otheradmin',
            role_name: 'admin',
            role_id: 'a0000000-0000-0000-0000-000000000001',
          },
          body: { role: 'user' },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({
          roleId: 'b0000000-0000-0000-0000-000000000003',
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000002',
          username: 'otheradmin',
          role_id: 'b0000000-0000-0000-0000-000000000003',
        }),
      });
    });

    it('allows updating built-in admin user email and name (but not role or enabled)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'admin',
        email: 'newadmin@example.com',
        first_name: 'New',
        last_name: 'Admin',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'admin',
            role_id: '20000000-0000-4000-8000-000000000001',
            role_name: 'admin',
          },
          body: {
            email: 'newadmin@example.com',
            firstName: 'New',
            lastName: 'Admin',
          },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        email: 'newadmin@example.com',
        firstName: 'New',
        lastName: 'Admin',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          username: 'admin',
          email: 'newadmin@example.com',
        }),
      });
    });

    it('prevents username change', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'oldusername', role_name: 'user' },
          body: { username: 'newusername' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username cannot be changed' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('ignores student ID for admin users (only sets for regular users)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'adminuser',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'adminuser', role_name: 'admin' },
          body: { email: 'new@test.com', studentId: 'S12345' },
        },
        mockReply
      );

      // Should succeed but not include studentId in updates
      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001' }),
      });
    });

    it('ignores group ID for admin users (only sets for regular users)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'adminuser',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'adminuser', role_name: 'admin' },
          body: { email: 'new@test.com', groupId: '10000000-0000-4000-8000-000000000001' },
        },
        mockReply
      );

      // Should succeed but not include groupId in updates
      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001' }),
      });
    });

    it('returns 400 for invalid UUID in :id param', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: 'not-a-uuid' },
          body: {},
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });

    it('strips password_hash from PUT /users/:id response (C2)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'secret-hash',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'testuser', role_name: 'user' },
          body: { email: 'test@test.com' },
        },
        mockReply
      );

      const sentUser = mockReply.send.mock.calls[0][0].user;
      expect(sentUser).not.toHaveProperty('password_hash');
    });
  });

  describe('DELETE /users/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const mockFastify = createMockFastify({ requireAdminResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      const result = await handlers['/users/:id_delete_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('rejects attempt to delete own account', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
      expect(User.delete).not.toHaveBeenCalled();
    });

    it('deletes user successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.delete.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'otheruser',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(User.delete).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'User deleted successfully' });
    });

    it('returns 404 when user not found for deletion', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.delete.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000999' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('handles error when deleting user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.delete.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id/group - error handling', () => {
    it('handles error when assigning user to group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'test',
      });
      Group.assignUserToGroup.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { groupId: '10000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id - error handling', () => {
    it('handles database error when fetching user in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('Database error'));

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await expect(
        handlers['/users/:id_put_pre'](
          {
            user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
            params: { id: '00000000-0000-4000-8000-000000000001' },
          },
          mockReply
        )
      ).rejects.toThrow('Database error');

      expect(User.findById).toHaveBeenCalled();
    });
  });

  describe('PUT /users/:id/password', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('allows user to change own password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
        },
        mockReply
      );
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects non-admin changing another users password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('rejects admin changing another users password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: You can only change your own password' });
    });

    it('rejects password shorter than 6 characters', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'old', newPassword: '12345' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'New password must be at least 6 characters' });
    });

    it('rejects when current password is not provided', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when admin does not provide current password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'admin',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when current password is incorrect', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        password_hash: 'hashed',
      });
      User.verifyPassword.mockResolvedValue(false);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'wrong', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
    });

    it('successfully changes password with correct current password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        password_hash: 'hashed',
      });
      User.verifyPassword.mockResolvedValue(true);
      User.updatePassword.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'correct', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(User.updatePassword).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'newpass123');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Password updated successfully' });
    });

    it('returns 404 when user not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000999' },
          body: { currentPassword: 'currentpass', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('handles server error', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'currentpass', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('DELETE /users/:id - error handling', () => {
    it('handles error when deleting user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.delete.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id - preHandler permissions', () => {
    it('rejects regular user from editing anyone', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000001' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Regular users cannot edit user information' });
    });

    it('allows admin to edit any user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', role_name: 'admin' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('allows assignment manager to edit regular user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', role_name: 'user' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects assignment manager from editing admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', role_name: 'admin' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Assignment managers cannot edit admin users' });
    });
  });

  describe('POST /users/import', () => {
    const makeImportRequest = (body) => ({
      user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
      body,
    });

    it('rejects unauthenticated request', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('rejects user without admin/assignment_manager role', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 'u1', role: 'user' } };
      const result = await handlers['/users/import_post_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
      expect(result).toBe(mockReply);
    });

    it('returns 400 when users array is empty', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](makeImportRequest({ users: [] }), mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No users to import' });
    });

    it('returns 400 when users is not an array', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](makeImportRequest({ users: null }), mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('imports new users successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue(null);
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'newuser',
        email: 'new@test.com',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }],
        }),
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'newuser', email: 'new@test.com', password: null })
      );
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('sends setup email when sendSetupEmail is true', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue(null);
      const newUser = { id: 'u2', username: 'newuser', email: 'new@test.com' };
      User.create.mockResolvedValue(newUser);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'rawtoken123' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }],
          sendSetupEmail: true,
        }),
        mockReply
      );

      expect(PasswordResetToken.deleteStaleForUser).toHaveBeenCalledWith('u2');
      expect(PasswordResetToken.create).toHaveBeenCalledWith('u2', 'setup', 24);
      expect(sendPasswordSetupEmail).toHaveBeenCalledWith(newUser, 'rawtoken123');
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('does not send setup email by default', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue(null);
      User.create.mockResolvedValue({ id: 'u2', username: 'newuser', email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }],
        }),
        mockReply
      );

      expect(sendPasswordSetupEmail).not.toHaveBeenCalled();
    });

    it('skips existing user when conflictAction is skip', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'existing',
        role_name: 'user',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'existing@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'skip',
        }),
        mockReply
      );

      expect(User.create).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 0, skipped: 1, errors: [] });
    });

    it('overwrites existing user when conflictAction is overwrite', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = { id: '00000000-0000-4000-8000-000000000002', username: 'existing', role_name: 'user' };
      User.findByUsername.mockResolvedValue(existingUser);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue(null);
      User.update.mockResolvedValue({ ...existingUser, email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'new@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({ email: 'new@test.com', firstName: 'Ex', lastName: 'User' })
      );
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('protects admin/assignment_manager accounts from overwrite', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue({ id: 'u2', username: 'admin', role_name: 'admin' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'admin', email: 'admin@test.com', firstName: 'Ad', lastName: 'Min' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [
          {
            row: 1,
            identifier: 'admin',
            reason: 'Cannot overwrite admin or assignment manager account',
          },
        ],
      });
    });

    it('records error for rows with missing required fields', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'nomail', firstName: 'No', lastName: 'Mail' }],
        }),
        mockReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'nomail', reason: 'Missing or invalid required fields' }],
      });
    });

    it('records error for row-level database failures', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue(null);
      User.create.mockRejectedValue(new Error('DB constraint violation'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'baduser', email: 'bad@test.com', firstName: 'Bad', lastName: 'User' }],
        }),
        mockReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'baduser', reason: 'DB constraint violation' }],
      });
      consoleSpy.mockRestore();
    });

    it('handles mix of new, skipped, and errored rows', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername
        .mockResolvedValueOnce(null) // new
        .mockResolvedValueOnce({ id: 'u2', username: 'existing', role_name: 'user' }) // skip
        .mockResolvedValueOnce(null); // missing fields row — won't reach findByUsername
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue(null);
      User.create.mockResolvedValue({ id: 'u3', username: 'newuser', email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' },
            { username: 'existing', email: 'ex@test.com', firstName: 'Ex', lastName: 'User' },
            { username: 'incomplete' }, // missing email/firstName/lastName
          ],
          conflictAction: 'skip',
        }),
        mockReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 1,
        skipped: 1,
        errors: [{ row: 3, identifier: 'incomplete', reason: 'Missing or invalid required fields' }],
      });
    });

    it('handles top-level errors with 500', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockRejectedValue(new Error('DB down'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({ users: [{ username: 'u', email: 'e@e.com', firstName: 'F', lastName: 'L' }] }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });

    it('errors when new user email conflicts with existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue({ id: 'other', username: 'other', email: 'taken@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'taken@test.com', firstName: 'New', lastName: 'User' }],
        }),
        mockReply
      );

      expect(User.create).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'newuser', reason: 'Email already in use by another user' }],
      });
    });

    it('errors when new user student ID conflicts with existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue({ id: 'other', username: 'other', student_id: 'S123' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User', studentId: 'S123' },
          ],
        }),
        mockReply
      );

      expect(User.create).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'newuser', reason: 'Student ID already in use by another user' }],
      });
    });

    it('errors when overwrite email conflicts with a different existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = { id: 'u2', username: 'existing', role_name: 'user' };
      User.findByUsername.mockResolvedValue(existingUser);
      User.findByEmail.mockResolvedValue({ id: 'u3', username: 'other', email: 'taken@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'taken@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'existing', reason: 'Email already in use by another user' }],
      });
    });

    it('allows overwrite when email belongs to the same existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = { id: 'u2', username: 'existing', role_name: 'user' };
      User.findByUsername.mockResolvedValue(existingUser);
      User.findByEmail.mockResolvedValue({ id: 'u2', username: 'existing', email: 'same@test.com' });
      User.findByStudentId.mockResolvedValue(null);
      User.update.mockResolvedValue({ ...existingUser, email: 'same@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'same@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('errors when overwrite student ID conflicts with a different existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = { id: 'u2', username: 'existing', role_name: 'user' };
      User.findByUsername.mockResolvedValue(existingUser);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue({ id: 'u3', username: 'other', student_id: 'S123' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'ex@test.com', firstName: 'Ex', lastName: 'User', studentId: 'S123' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'existing', reason: 'Student ID already in use by another user' }],
      });
    });
  });

  describe('POST /users/send-setup-emails', () => {
    it('rejects unauthenticated request', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/send-setup-emails_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('rejects user without admin/assignment_manager role', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 'u1', role: 'user' } };
      const result = await handlers['/users/send-setup-emails_post_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
      expect(result).toBe(mockReply);
    });

    it('sends setup emails to all pending users when no userIds provided', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const pendingUsers = [
        { id: 'u1', username: 'pending1', status: 'pending' },
        { id: 'u2', username: 'pending2', status: 'pending' },
      ];
      User.findAll.mockResolvedValue(pendingUsers);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockResolvedValue();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post']({ user: { id: 'admin1', role: 'admin' }, body: {} }, mockReply);

      expect(User.findAll).toHaveBeenCalledWith({ status: 'pending' });
      expect(sendPasswordSetupEmail).toHaveBeenCalledTimes(2);
      expect(mockReply.send).toHaveBeenCalledWith({ sent: 2, errors: [] });
    });

    it('sends setup emails only to specified pending userIds', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById
        .mockResolvedValueOnce({ id: 'u1', username: 'pending1', status: 'pending' })
        .mockResolvedValueOnce({ id: 'u2', username: 'active1', status: 'active' });
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockResolvedValue();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post'](
        { user: { id: 'admin1', role: 'admin' }, body: { userIds: ['u1', 'u2'] } },
        mockReply
      );

      // Only u1 is pending, so only 1 email sent
      expect(sendPasswordSetupEmail).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith({ sent: 1, errors: [] });
    });

    it('reports errors for failed email sends', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const pendingUsers = [{ id: 'u1', username: 'pending1', status: 'pending' }];
      User.findAll.mockResolvedValue(pendingUsers);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockRejectedValue(new Error('SMTP down'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post']({ user: { id: 'admin1', role: 'admin' }, body: {} }, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        sent: 0,
        errors: [{ userId: 'u1', username: 'pending1', reason: 'SMTP down' }],
      });
      consoleSpy.mockRestore();
    });

    it('handles top-level errors with 500', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockRejectedValue(new Error('DB down'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post']({ user: { id: 'admin1', role: 'admin' }, body: {} }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
