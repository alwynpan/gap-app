// Mock models at the top level
jest.mock('../../src/models/Group');

const Group = require('../../src/models/Group');

describe('Groups Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockFastify = () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    requireAdmin: jest.fn().mockResolvedValue(true),
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

  describe('GET /groups', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/groups_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('allows authenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/groups_get_pre']({ user: { id: 1 } }, mockReply);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('returns all groups successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findAll.mockResolvedValue([{ id: 1, name: 'Team A', enabled: true }]);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups_get']({}, mockReply);

      expect(Group.findAll).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ groups: [{ id: 1, name: 'Team A', enabled: true }] });
    });

    it('handles error when fetching groups', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findAll.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups_get']({}, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('GET /groups/enabled', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/groups/enabled_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns enabled groups successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findEnabled.mockResolvedValue([{ id: 1, name: 'Active Team', enabled: true }]);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/enabled_get']({}, mockReply);

      expect(Group.findEnabled).toHaveBeenCalled();
    });
  });

  describe('GET /groups/:id', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/groups/:id_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns group by id with members', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const mockGroup = { id: 1, name: 'Test Group', enabled: true, created_at: new Date(), updated_at: new Date() };
      const mockMembers = [{ id: 1, username: 'user1', role_name: 'user' }];
      Group.findById.mockResolvedValue(mockGroup);
      Group.getMembers.mockResolvedValue(mockMembers);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_get']({ params: { id: '1' } }, mockReply);

      expect(Group.findById).toHaveBeenCalledWith(1);
      expect(Group.getMembers).toHaveBeenCalledWith(1);
    });

    it('returns 404 when group not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findById.mockResolvedValue(null);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_get']({ params: { id: '999' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('handles error when fetching group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_get']({ params: { id: '1' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });

    it('handles error when fetching enabled groups', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findEnabled.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/enabled_get']({}, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('POST /groups', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/groups_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const mockFastify = createMockFastify();
      mockFastify.requireAdmin.mockResolvedValue(false);
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 1, role: 'user' } };
      const result = await handlers['/groups_post_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('rejects missing group name', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups_post']({ user: { id: 1, role: 'admin' }, body: {} }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects when group name already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findAll.mockResolvedValue([{ id: 1, name: 'Existing Group', enabled: true }]);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups_post']({ user: { id: 1, role: 'admin' }, body: { name: 'existing group' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(409);
    });

    it('creates group with enabled=true by default', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findAll.mockResolvedValue([]);
      Group.create.mockResolvedValue({ id: 1, name: 'New Group', enabled: true });

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups_post']({ user: { id: 1, role: 'admin' }, body: { name: 'New Group' } }, mockReply);

      expect(Group.create).toHaveBeenCalledWith('New Group', true);
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('creates group with enabled=false', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findAll.mockResolvedValue([]);
      Group.create.mockResolvedValue({ id: 1, name: 'Disabled Group', enabled: false });

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups_post'](
        { user: { id: 1, role: 'admin' }, body: { name: 'Disabled Group', enabled: false } },
        mockReply
      );

      expect(Group.create).toHaveBeenCalledWith('Disabled Group', false);
    });

    it('handles error when creating group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findAll.mockResolvedValue([]);
      Group.create.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups_post']({ user: { id: 1, role: 'admin' }, body: { name: 'New Group' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /groups/:id', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/groups/:id_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const mockFastify = createMockFastify();
      mockFastify.requireAdmin.mockResolvedValue(false);
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 1, role: 'user' }, params: { id: '1' } };
      const result = await handlers['/groups/:id_put_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 404 when group not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findById.mockResolvedValue(null);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_put'](
        { user: { id: 1, role: 'admin' }, params: { id: '999' }, body: { name: 'New Name' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('updates group successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findById.mockResolvedValue({ id: 1, name: 'Old Name', enabled: true });
      Group.update.mockResolvedValue({ id: 1, name: 'New Name', enabled: false });

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_put'](
        { user: { id: 1, role: 'admin' }, params: { id: '1' }, body: { name: 'New Name', enabled: false } },
        mockReply
      );

      expect(Group.update).toHaveBeenCalledWith(1, { name: 'New Name', enabled: false });
    });

    it('updates group with partial fields', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findById.mockResolvedValue({ id: 1, name: 'Old Name', enabled: true });
      Group.update.mockResolvedValue({ id: 1, name: 'Old Name', enabled: false });

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_put'](
        { user: { id: 1, role: 'admin' }, params: { id: '1' }, body: { enabled: false } },
        mockReply
      );

      expect(Group.update).toHaveBeenCalledWith(1, { enabled: false });
    });

    it('handles error when updating group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.findById.mockResolvedValue({ id: 1, name: 'Old Name', enabled: true });
      Group.update.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_put'](
        { user: { id: 1, role: 'admin' }, params: { id: '1' }, body: { name: 'New Name' } },
        mockReply
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });

    it('handles error when deleting group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.delete.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '1' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('DELETE /groups/:id', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/groups/:id_delete_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const mockFastify = createMockFastify();
      mockFastify.requireAdmin.mockResolvedValue(false);
      const handlers = captureHandlers(mockFastify);
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 1, role: 'user' }, params: { id: '1' } };
      const result = await handlers['/groups/:id_delete_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('deletes group successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.delete.mockResolvedValue({ id: 1, name: 'Deleted Group', enabled: true });

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '1' } }, mockReply);

      expect(Group.delete).toHaveBeenCalledWith(1);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Group deleted successfully' });
    });

    it('returns 404 when group not found for deletion', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.delete.mockResolvedValue(null);

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '999' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('handles error when deleting group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Group.delete.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/groups/:id_delete']({ user: { id: 1, role: 'admin' }, params: { id: '1' } }, mockReply);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
