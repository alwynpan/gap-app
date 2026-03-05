// Mock models at the top level
jest.mock('../../src/models/User');
jest.mock('../../src/models/Group');
jest.mock('../../src/models/Role');

const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Role = require('../../src/models/Role');

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
        if (config && config.preHandler) {handlers[`${path}_${method}_pre`] = config.preHandler;}
        if (handler) {handlers[`${path}_${method}`] = handler;}
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

    it('rejects user without admin/team_manager role', () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/users_get_pre']({ user: { role: 'user' } }, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith({ user: { role: 'user' } }, mockReply, [
        'admin',
        'team_manager',
      ]);
    });

    it('returns all users successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockResolvedValue([{ id: 1, username: 'user1', email: 'user1@test.com' }]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({}, mockReply);
      expect(User.findAll).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ users: [{ id: 1, username: 'user1', email: 'user1@test.com' }] });
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
    it('requires admin/team_manager role to view other users', () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 1, role: 'user' }, params: { id: '2' } };
      handlers['/users/:id_get_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'team_manager']);
    });

    it('returns user by id', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'testuser', email: 'test@test.com', password_hash: 'hash' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '1' } }, mockReply);
      expect(User.findById).toHaveBeenCalledWith(1);
      expect(mockReply.send).toHaveBeenCalledWith({ user: { id: 1, username: 'testuser', email: 'test@test.com' } });
    });

    it('returns 404 when user does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '999' } }, mockReply);
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
      await handlers['/users/:id_get']({ params: { id: '1' } }, mockReply);
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
      const request = { user: { id: 1, role: 'user' }, params: { id: '1' } };

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

    it('returns reply when admin check fails in preHandler', async () => {
      const mockFastify = createMockFastify({ requireAdminResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 1, role: 'user' } };
      const result = await handlers['/users_post_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('rejects when required fields are missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { username: 'u1', email: 'u1@test.com' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username, email, and password are required' });
    });

    it('rejects when username already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue({ id: 1, username: 'existing' });
      User.findByEmail.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'existing', email: 'new@test.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username already exists' });
    });

    it('rejects when email already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue({ id: 1, email: 'existing@test.com' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'newuser', email: 'existing@test.com', password: 'password123' } },
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
      User.create.mockResolvedValue({ id: 1, username: 'newuser', email: 'new@test.com', student_id: 'S123' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'newuser', email: 'new@test.com', password: 'password123', studentId: 'S123' } },
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        studentId: 'S123',
        groupId: undefined,
        roleId: 3,
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('creates user with custom role', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: 1, name: 'admin' });
      User.create.mockResolvedValue({ id: 1, username: 'adminuser', email: 'admin@test.com', student_id: null });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'adminuser', email: 'admin@test.com', password: 'password123', role: 'admin' } },
        mockReply
      );

      expect(Role.findByName).toHaveBeenCalledWith('admin');
    });

    it('creates user with unknown role (defaults to user)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue(null);
      User.create.mockResolvedValue({ id: 1, username: 'newuser', email: 'new@test.com', student_id: null });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'newuser', email: 'new@test.com', password: 'password123', role: 'unknown' } },
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 3 }));
    });

    it('handles error when creating user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      User.create.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { body: { username: 'newuser', email: 'new@test.com', password: 'password123' } },
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
      const request = { user: { id: 2, role: 'user' }, params: { id: '1' } };
      const result = await handlers['/users/:id/group_put_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'team_manager']);
      expect(result).toBe(mockReply);
    });

    it('returns 400 when groupId is missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put']({ params: { id: '1' }, body: {} }, mockReply);
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
      await handlers['/users/:id/group_put']({ params: { id: '999' }, body: { groupId: 1 } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns 404 when group not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'test' });
      Group.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put']({ params: { id: '1' }, body: { groupId: 999 } }, mockReply);

      expect(Group.findById).toHaveBeenCalledWith(999);
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('updates user group successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'test' });
      Group.findById.mockResolvedValue({ id: 2, name: 'New Group' });
      User.updateGroup.mockResolvedValue({ id: 1, username: 'test', group_id: 2 });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put']({ params: { id: '1' }, body: { groupId: 2 } }, mockReply);

      expect(User.updateGroup).toHaveBeenCalledWith(1, 2);
    });

    it('sets user group to null', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'test' });
      User.updateGroup.mockResolvedValue({ id: 1, username: 'test', group_id: null });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put']({ params: { id: '1' }, body: { groupId: null } }, mockReply);

      expect(User.updateGroup).toHaveBeenCalledWith(1, null);
    });

    it('handles error when updating group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'test' });
      Group.findById.mockResolvedValue({ id: 2, name: 'Group' });
      User.updateGroup.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put']({ params: { id: '1' }, body: { groupId: 2 } }, mockReply);

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

    it('returns reply when admin check fails in preHandler', async () => {
      const mockFastify = createMockFastify({ requireAdminResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 1, role: 'user' }, params: { id: '2' } };
      const result = await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 404 when user not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put']({ params: { id: '999' }, body: { username: 'newname' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('updates user successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'oldname' });
      User.update.mockResolvedValue({ id: 1, username: 'newname', email: 'new@test.com' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        { params: { id: '1' }, body: { username: 'newname', email: 'new@test.com' } },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ username: 'newname', email: 'new@test.com' })
      );
    });

    it('handles error when updating user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'oldname' });
      User.update.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put']({ params: { id: '1' }, body: { username: 'newname' } }, mockReply);

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
      const request = { user: { id: 1, role: 'user' }, params: { id: '2' } };
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
      await handlers['/users/:id_delete']({ user: { id: 2, role: 'admin' }, params: { id: '2' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
      expect(User.delete).not.toHaveBeenCalled();
    });

    it('deletes user successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.delete.mockResolvedValue({ id: 2, username: 'otheruser' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '2' } }, mockReply);

      expect(User.delete).toHaveBeenCalledWith(2);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'User deleted successfully' });
    });

    it('returns 404 when user not found for deletion', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.delete.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '999' } }, mockReply);

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
      await handlers['/users/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '2' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /users/:id/group - error handling', () => {
    it('handles error when checking group exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: 1, username: 'test' });
      Group.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put']({ params: { id: '1' }, body: { groupId: 2 } }, mockReply);

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
      await handlers['/users/:id_put']({ params: { id: '1' }, body: { username: 'newname' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
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
      await handlers['/users/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '2' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
