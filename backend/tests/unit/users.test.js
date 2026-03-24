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
      Role.findByName.mockResolvedValue({ id: 'r0000000-0000-0000-0000-000000000003', name: 'user' });
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
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Regular users cannot edit user information' });
    });

    it('rejects assignment_manager editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        role_name: 'admin',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'assignment_manager' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Assignment managers cannot edit admin users' });
    });

    it('allows admin to edit another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        role_name: 'user',
      });
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

    it('admin can update all fields including role and enabled', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'oldname',
        role_name: 'user',
      });
      Role.findByName.mockResolvedValue({ id: 'a0000000-0000-0000-0000-000000000001' });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'oldname',
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

      expect(User.update).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000002', {
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
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'oldname',
        role_name: 'user',
        status: 'active',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'oldname',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'assignment_manager' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: {
            email: 'new@test.com',
            firstName: undefined,
            lastName: undefined,
            studentId: undefined,
            role: 'admin',
            groupId: 'g0000000-0000-0000-0000-000000000005',
            enabled: false,
          },
        },
        mockReply
      );

      // role and groupId must be excluded; enabled must be included with status sync
      expect(User.update).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', {
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
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'oldname',
        role_name: 'user',
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
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'admin',
        role_id: 'r0000000-0000-0000-0000-000000000001',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
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
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'admin',
        role_name: 'admin',
        role_id: 'a0000000-0000-0000-0000-000000000001',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
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
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'otheradmin',
        role_id: 'r0000000-0000-0000-0000-000000000001',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'otheradmin',
        enabled: false,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
          body: { enabled: false },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          id: 'u0000000-0000-0000-0000-000000000002',
          username: 'otheradmin',
          enabled: false,
        }),
      });
    });

    it('sets status to inactive when disabling a user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'someuser',
        role_name: 'user',
        status: 'active',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        enabled: false,
        status: 'inactive',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
          body: { enabled: false },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        'u0000000-0000-0000-0000-000000000002',
        expect.objectContaining({
          enabled: false,
          status: 'inactive',
        })
      );
    });

    it('restores status to active when re-enabling a previously inactive user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'someuser',
        role_name: 'user',
        status: 'inactive',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        enabled: true,
        status: 'active',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
          body: { enabled: true },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        'u0000000-0000-0000-0000-000000000002',
        expect.objectContaining({
          enabled: true,
          status: 'active',
        })
      );
    });

    it('does not change status when re-enabling a pending user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'pendinguser',
        role_name: 'user',
        status: 'pending',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        enabled: true,
        status: 'pending',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
          body: { enabled: true },
        },
        mockReply
      );

      // status should not be changed for pending users
      expect(User.update).toHaveBeenCalledWith(
        'u0000000-0000-0000-0000-000000000002',
        expect.not.objectContaining({
          status: 'active',
        })
      );
    });

    it('allows changing role of a non-built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'otheradmin',
        role_name: 'admin',
        role_id: 'a0000000-0000-0000-0000-000000000001',
      });
      Role.findByName.mockResolvedValue({ id: 'b0000000-0000-0000-0000-000000000003' });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'otheradmin',
        role_id: 'b0000000-0000-0000-0000-000000000003',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000002' },
          body: { role: 'user' },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        'u0000000-0000-0000-0000-000000000002',
        expect.objectContaining({
          roleId: 'b0000000-0000-0000-0000-000000000003',
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          id: 'u0000000-0000-0000-0000-000000000002',
          username: 'otheradmin',
          role_id: 'b0000000-0000-0000-0000-000000000003',
        }),
      });
    });

    it('allows updating built-in admin user email and name (but not role or enabled)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'admin',
        role_id: 'r0000000-0000-0000-0000-000000000001',
        role_name: 'admin',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
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
          user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: {
            email: 'newadmin@example.com',
            firstName: 'New',
            lastName: 'Admin',
          },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', {
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
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'oldusername',
        role_name: 'user',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
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
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'adminuser',
        role_name: 'admin',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'adminuser',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { email: 'new@test.com', studentId: 'S12345' },
        },
        mockReply
      );

      // Should succeed but not include studentId in updates
      expect(User.update).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({ id: 'u0000000-0000-0000-0000-000000000001' }),
      });
    });

    it('ignores group ID for admin users (only sets for regular users)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'adminuser',
        role_name: 'admin',
      });
      User.update.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'adminuser',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: 'u0000000-0000-0000-0000-000000000002', role: 'admin' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
          body: { email: 'new@test.com', groupId: 'g0000000-0000-0000-0000-000000000001' },
        },
        mockReply
      );

      // Should succeed but not include groupId in updates
      expect(User.update).toHaveBeenCalledWith('u0000000-0000-0000-0000-000000000001', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({ id: 'u0000000-0000-0000-0000-000000000001' }),
      });
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

    it('rejects admin changing another users password', async () => {
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
          user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'user' },
          params: { id: 'u0000000-0000-0000-0000-000000000001' },
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

    it('rejects when admin does not provide current password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'admin',
      });
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

    it('successfully changes password with correct current password', async () => {
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

  describe('PUT /users/:id - preHandler permissions', () => {
    it('rejects regular user from editing anyone', async () => {
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

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Regular users cannot edit user information' });
    });

    it('allows admin to edit any user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 'u0000000-0000-0000-0000-000000000002', role_name: 'admin' });
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

    it('allows assignment manager to edit regular user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 'u0000000-0000-0000-0000-000000000002', role_name: 'user' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'assignment_manager' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects assignment manager from editing admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 'u0000000-0000-0000-0000-000000000002', role_name: 'admin' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: 'u0000000-0000-0000-0000-000000000001', role: 'assignment_manager' },
        params: { id: 'u0000000-0000-0000-0000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Assignment managers cannot edit admin users' });
    });
  });
});
