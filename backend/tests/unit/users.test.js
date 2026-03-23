// Mock models at the top level
jest.mock('../../src/models/User');
jest.mock('../../src/models/Group');
jest.mock('../../src/models/Role');
jest.mock('../../src/models/PasswordResetToken', () => ({
  create: jest.fn(),
  findByToken: jest.fn(),
  markUsed: jest.fn(),
  deleteStaleForUser: jest.fn(),
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
        { id: 'u0000000-0000-0000-0000-000000000001', username: 'user1', email: 'user1@test.com' },
      ]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({}, mockReply);
      expect(User.findAll).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        users: [{ id: 'u0000000-0000-0000-0000-000000000001', username: 'user1', email: 'user1@test.com' }],
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
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };
      handlers['/users/:id_get_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
    });

    it('returns user by id', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'hash',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: 'u0000000-0000-0000-0000-000000000001' } }, mockReply);
      expect(User.findById).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'testuser', email: 'test@test.com' },
      });
    });

    it('returns 404 when user does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: 'u0000000-0000-0000-0000-000000000999' } }, mockReply);
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
      await handlers['/users/:id_get']({ params: { id: 'u0000000-0000-0000-0000-000000000001' } }, mockReply);
      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
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
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
        params: { id: 'u0000000-0000-0000-0000-000000000001' },
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
      const request = { user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' } };
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
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username and email are required' });
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
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'First name and last name are required' });
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
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'First name and last name are required' });
    });

    it('rejects when username already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
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
        id: 'u0000000-0000-0000-0000-000000000001',
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
      Role.findByName.mockResolvedValue({ id: 'r0000000-0000-0000-0000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
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
        roleId: 'r0000000-0000-0000-0000-000000000003',
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('creates user with custom role when requester is admin', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: 'r0000000-0000-0000-0000-000000000001', name: 'admin' });
      User.create.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'adminuser',
        email: 'admin@test.com',
        student_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
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
      Role.findByName.mockResolvedValue({ id: 'r0000000-0000-0000-0000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'assignment_manager' },
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'assignment_manager' },
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
        id: 'u0000000-0000-0000-0000-000000000001',
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
      Group.findById.mockResolvedValue({
        id: 'g0000000-0000-0000-0000-000000000001',
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
            groupId: 'g0000000-0000-0000-0000-000000000001',
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
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Group',
        max_members: 5,
        member_count: 4,
      });
      Role.findByName.mockResolvedValue({ id: 'r0000000-0000-0000-0000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
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
            groupId: 'g0000000-0000-0000-0000-000000000001',
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
      Role.findByName.mockResolvedValue({ id: 'r0000000-0000-0000-0000-000000000003', name: 'user' });
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
        user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'user' },
        params: { id: 'u0000000-0000-0000-0000-000000000001' },
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
        { params: { id: 'u0000000-0000-0000-0000-000000000001' }, body: {} },
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
          params: { id: 'u0000000-0000-0000-0000-000000000999' },
          body: { groupId: 'g0000000-0000-0000-0000-000000000001' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns 404 when group not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
      });
      Group.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { groupId: 'g0000000-0000-0000-0000-000000000999' },
        },
        mockReply
      );

      expect(Group.findById).toHaveBeenCalledWith('g0000000-0000-0000-0000-000000000999');
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('updates user group successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
      });
      Group.findById.mockResolvedValue({
        id: 'g0000000-0000-0000-0000-000000000002',
        name: 'New Group',
        max_members: 5,
        member_count: 3,
      });
      User.updateGroup.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
        group_id: 'g0000000-0000-0000-0000-000000000002',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { groupId: 'g0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );

      expect(User.updateGroup).toHaveBeenCalledWith(
        'u0000000-0000-0000-0000-000000000001',
        'g0000000-0000-0000-0000-000000000002'
      );
    });

    it('sets user group to null', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
      });
      User.updateGroup.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
        group_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { groupId: null },
        },
        mockReply
      );

      expect(User.updateGroup).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', null);
    });

    it('rejects assigning user to a full group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
      });
      Group.findById.mockResolvedValue({
        id: 'g0000000-0000-0000-0000-000000000002',
        name: 'Full Group',
        max_members: 2,
        member_count: 2,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { groupId: 'g0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group is full' });
      expect(User.updateGroup).not.toHaveBeenCalled();
    });

    it('allows assigning user to group with unlimited capacity', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
      });
      Group.findById.mockResolvedValue({
        id: 'g0000000-0000-0000-0000-000000000002',
        name: 'Unlimited Group',
        max_members: null,
        member_count: 999,
      });
      User.updateGroup.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
        group_id: 'g0000000-0000-0000-0000-000000000002',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { groupId: 'g0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );

      expect(User.updateGroup).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User group updated successfully' })
      );
    });

    it('handles error when updating group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
      });
      Group.findById.mockResolvedValue({
        id: 'g0000000-0000-0000-0000-000000000002',
        name: 'Group',
        max_members: null,
        member_count: 0,
      });
      User.updateGroup.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { groupId: 'g0000000-0000-0000-0000-000000000002' },
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
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
        params: { id: 'u0000000-0000-0000-0000-000000000001' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects non-admin editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: You can only edit your own profile' });
    });

    it('rejects assignment_manager editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'assignment_manager' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('allows admin to edit another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('returns 404 when user not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000999' },
          body: { username: 'newname' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('admin can update all fields including roleId and enabled', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'oldname',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'newname',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
          body: {
            username: 'newname',
            email: 'new@test.com',
            roleId: 'r0000000-0000-0000-0000-000000000001',
            enabled: false,
          },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000002', {
        username: 'newname',
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
        studentId: undefined,
        groupId: undefined,
        roleId: 'r0000000-0000-0000-0000-000000000001',
        enabled: false,
      });
    });

    it('non-admin can only update basic profile fields (username, email, studentId)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'oldname',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'newname',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: {
            username: 'newname',
            email: 'new@test.com',
            roleId: 'r0000000-0000-0000-0000-000000000001',
            groupId: 'g0000000-0000-0000-0000-000000000005',
            enabled: false,
          },
        },
        mockReply
      );

      // Should only pass basic fields, not admin fields
      expect(User.update).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', {
        username: 'newname',
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
        studentId: undefined,
      });
    });

    it('handles error when updating user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'oldname',
      });
      User.update.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { username: 'newname' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
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
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
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
          user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
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
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'otheruser',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );

      expect(User.delete).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000002');
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000999' },
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id/group - error handling', () => {
    it('handles error when checking group exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'test',
      });
      Group.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        {
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { groupId: 'g0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id - error handling', () => {
    it('handles error when checking user exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { username: 'newname' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('allows admin to change another users password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects password shorter than 6 characters', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { currentPassword: 'old', newPassword: '12345' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'New password must be at least 6 characters' });
    });

    it('rejects when current password is not provided for non-admin', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Current password is required' });
    });

    it('rejects when current password is incorrect', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
      });
      User.findByUsername.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        password_hash: 'hashed',
      });
      User.verifyPassword.mockResolvedValue(false);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { currentPassword: 'wrong', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
    });

    it('successfully changes password for non-admin with correct current password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
      });
      User.findByUsername.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        password_hash: 'hashed',
      });
      User.verifyPassword.mockResolvedValue(true);
      User.updatePassword.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { currentPassword: 'correct', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(User.updatePassword).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', 'newpass123');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Password updated successfully' });
    });

    it('admin can change another users password without current password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'otheruser',
      });
      User.updatePassword.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'otheruser',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
          body: { newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(User.verifyPassword).not.toHaveBeenCalled();
      expect(User.updatePassword).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000002', 'newpass123');
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000999' },
          body: { newPassword: 'newpass123' },
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { newPassword: 'newpass123' },
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
        },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('POST /users/:id/reset-password', () => {
    it('rejects unauthenticated request', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/:id/reset-password_post_pre']({ user: null }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('rejects user without admin/assignment_manager role', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/:id/reset-password_post_pre']({ user: { role: 'user' } }, mockReply);

      expect(mockFastify.checkRole).toHaveBeenCalledWith({ user: { role: 'user' } }, mockReply, [
        'admin',
        'assignment_manager',
      ]);
    });

    it('returns 404 when user not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/:id/reset-password_post'](
        { user: { role: 'admin' }, params: { id: 'u0000000-0000-0000-0000-000000000999' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('sends reset email and returns success', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const mockUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        email: 'user@test.com',
        username: 'testuser',
        first_name: 'Test',
      };
      User.findById.mockResolvedValue(mockUser);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'resettoken', id: 't1' });
      sendPasswordResetEmail.mockResolvedValue();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/:id/reset-password_post'](
        { user: { role: 'admin' }, params: { id: 'u0000000-0000-0000-0000-000000000001' } },
        mockReply
      );

      expect(PasswordResetToken.deleteStaleForUser).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001');
      expect(PasswordResetToken.create).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', 'reset', 24);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(mockUser, 'resettoken');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Password reset email sent' });
    });

    it('returns 500 on unexpected error', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/:id/reset-password_post'](
        { user: { role: 'admin' }, params: { id: 'u0000000-0000-0000-0000-000000000001' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
