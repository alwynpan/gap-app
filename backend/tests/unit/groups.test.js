// Mock models at the top level
jest.mock('../../src/models/Group');
jest.mock('../../src/models/User');
jest.mock('../../src/models/Config');

const Group = require('../../src/models/Group');
const User = require('../../src/models/User');
const Config = require('../../src/models/Config');

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
    requireAssignmentManager: jest.fn().mockResolvedValue(true),
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

  const setupRoute = () => {
    const mockFastify = createMockFastify();
    const handlers = captureHandlers(mockFastify);
    const groupsRoutes = require('../../src/routes/groups');
    groupsRoutes(mockFastify, {});
    return { mockFastify, handlers };
  };

  const mockReply = () => ({ code: jest.fn().mockReturnThis(), send: jest.fn() });

  describe('GET /groups', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups_get_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('allows authenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups_get_pre']({ user: { id: '00000000-0000-4000-8000-000000000001' } }, reply);
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('returns all groups successfully', async () => {
      const { handlers } = setupRoute();
      Group.findAll.mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000001', name: 'Team A', enabled: true }]);
      const reply = mockReply();
      await handlers['/groups_get']({}, reply);
      expect(Group.findAll).toHaveBeenCalled();
      expect(reply.send).toHaveBeenCalledWith({
        groups: [{ id: '10000000-0000-4000-8000-000000000001', name: 'Team A', enabled: true }],
      });
    });

    it('handles error when fetching groups', async () => {
      const { handlers } = setupRoute();
      Group.findAll.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups_get']({}, reply);
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('GET /groups/enabled', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/enabled_get_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns enabled groups successfully', async () => {
      const { handlers } = setupRoute();
      Group.findEnabled.mockResolvedValue([
        { id: '10000000-0000-4000-8000-000000000001', name: 'Active Team', enabled: true },
      ]);
      const reply = mockReply();
      await handlers['/groups/enabled_get']({}, reply);
      expect(Group.findEnabled).toHaveBeenCalled();
    });

    it('handles error when fetching enabled groups', async () => {
      const { handlers } = setupRoute();
      Group.findEnabled.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups/enabled_get']({}, reply);
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('GET /groups/:id', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id_get_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns group by id with members', async () => {
      const { handlers } = setupRoute();
      const mockGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Test Group',
        enabled: true,
        max_members: 10,
        member_count: 3,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mockMembers = [{ id: '00000000-0000-4000-8000-000000000001', username: 'user1', role_name: 'user' }];
      Group.findById.mockResolvedValue(mockGroup);
      Group.getMembers.mockResolvedValue(mockMembers);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ params: { id: '10000000-0000-4000-8000-000000000001' } }, reply);
      expect(Group.findById).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001');
      expect(Group.getMembers).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001');
      expect(reply.send).toHaveBeenCalledWith({
        group: expect.objectContaining({ maxMembers: 10, memberCount: 3 }),
        members: mockMembers,
      });
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ params: { id: '10000000-0000-4000-8000-000000000999' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it('handles error when fetching group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups/:id_get']({ params: { id: '10000000-0000-4000-8000-000000000001' } }, reply);
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('POST /groups', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.requireAdmin.mockResolvedValue(false);
      const reply = mockReply();
      const request = { user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' } };
      const result = await handlers['/groups_post_pre'](request, reply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, reply);
      expect(result).toBe(reply);
    });

    it('rejects missing group name', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups_post'](
        { user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' }, body: {} },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('rejects when group name already exists', async () => {
      const { handlers } = setupRoute();
      Group.findAll.mockResolvedValue([
        { id: '10000000-0000-4000-8000-000000000001', name: 'Existing Group', enabled: true },
      ]);
      const reply = mockReply();
      await handlers['/groups_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { name: 'existing group' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(409);
    });

    it('creates group with enabled=true by default', async () => {
      const { handlers } = setupRoute();
      Group.findAll.mockResolvedValue([]);
      Group.create.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'New Group',
        enabled: true,
        max_members: null,
      });
      const reply = mockReply();
      await handlers['/groups_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { name: 'New Group' },
        },
        reply
      );
      expect(Group.create).toHaveBeenCalledWith('New Group', true, null);
      expect(reply.code).toHaveBeenCalledWith(201);
    });

    it('creates group with enabled=false', async () => {
      const { handlers } = setupRoute();
      Group.findAll.mockResolvedValue([]);
      Group.create.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Disabled Group',
        enabled: false,
        max_members: null,
      });
      const reply = mockReply();
      await handlers['/groups_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { name: 'Disabled Group', enabled: false },
        },
        reply
      );
      expect(Group.create).toHaveBeenCalledWith('Disabled Group', false, null);
    });

    it('creates group with maxMembers', async () => {
      const { handlers } = setupRoute();
      Group.findAll.mockResolvedValue([]);
      Group.create.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Limited',
        enabled: true,
        max_members: 5,
      });
      const reply = mockReply();
      await handlers['/groups_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { name: 'Limited', maxMembers: 5 },
        },
        reply
      );
      expect(Group.create).toHaveBeenCalledWith('Limited', true, 5);
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ group: expect.objectContaining({ maxMembers: 5 }) })
      );
    });

    it('rejects invalid maxMembers (non-positive)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { name: 'Bad', maxMembers: 0 },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects invalid maxMembers (NaN)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { name: 'Bad', maxMembers: 'abc' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('handles error when creating group', async () => {
      const { handlers } = setupRoute();
      Group.findAll.mockResolvedValue([]);
      Group.create.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { name: 'New Group' },
        },
        reply
      );
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /groups/:id', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id_put_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.requireAdmin.mockResolvedValue(false);
      const reply = mockReply();
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '10000000-0000-4000-8000-000000000001' },
      };
      const result = await handlers['/groups/:id_put_pre'](request, reply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, reply);
      expect(result).toBe(reply);
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000999' },
          body: { name: 'New Name' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it('updates group successfully', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Old Name',
        enabled: true,
        member_count: 0,
      });
      Group.update.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'New Name',
        enabled: false,
      });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { name: 'New Name', enabled: false },
        },
        reply
      );
      expect(Group.update).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001', {
        name: 'New Name',
        enabled: false,
      });
    });

    it('updates group with partial fields', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Old Name',
        enabled: true,
        member_count: 0,
      });
      Group.update.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Old Name',
        enabled: false,
      });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { enabled: false },
        },
        reply
      );
      expect(Group.update).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001', {
        enabled: false,
      });
    });

    it('updates group with maxMembers', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        enabled: true,
        member_count: 2,
      });
      Group.getMemberCount.mockResolvedValue(2);
      Group.update.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        max_members: 5,
      });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { maxMembers: 5 },
        },
        reply
      );
      expect(Group.getMemberCount).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001');
      expect(Group.update).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001', {
        maxMembers: 5,
      });
    });

    it('sets maxMembers to null (unlimited)', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        enabled: true,
        max_members: 5,
      });
      Group.update.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        max_members: null,
      });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { maxMembers: null },
        },
        reply
      );
      expect(Group.update).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001', {
        maxMembers: null,
      });
    });

    it('rejects maxMembers less than current member count', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        enabled: true,
        member_count: 5,
      });
      Group.getMemberCount.mockResolvedValue(5);
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { maxMembers: 3 },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Group already has 5 members, cannot set limit to 3',
      });
    });

    it('rejects invalid maxMembers (non-positive)', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        enabled: true,
      });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { maxMembers: 0 },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects invalid maxMembers (NaN)', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        enabled: true,
      });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { maxMembers: 'abc' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('handles error when updating group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Old Name',
        enabled: true,
      });
      Group.update.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
          body: { name: 'New Name' },
        },
        reply
      );
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('DELETE /groups/:id', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id_delete_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.requireAdmin.mockResolvedValue(false);
      const reply = mockReply();
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '10000000-0000-4000-8000-000000000001' },
      };
      const result = await handlers['/groups/:id_delete_pre'](request, reply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, reply);
      expect(result).toBe(reply);
    });

    it('deletes group successfully', async () => {
      const { handlers } = setupRoute();
      Group.delete.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Deleted Group',
        enabled: true,
      });
      const reply = mockReply();
      await handlers['/groups/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(Group.delete).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001');
      expect(reply.send).toHaveBeenCalledWith({ message: 'Group deleted successfully' });
    });

    it('returns 404 when group not found for deletion', async () => {
      const { handlers } = setupRoute();
      Group.delete.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000999' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it('handles error when deleting group', async () => {
      const { handlers } = setupRoute();
      Group.delete.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('POST /groups/:id/join', () => {
    beforeEach(() => {
      Config.get.mockResolvedValue('false');
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id/join_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('joins group successfully', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
        max_members: 5,
        member_count: 2,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        group_id: null,
      });
      Group.assignUserToGroup.mockResolvedValue();
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(Group.assignUserToGroup).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000010',
        '10000000-0000-4000-8000-000000000001'
      );
      expect(reply.send).toHaveBeenCalledWith({
        message: 'Successfully joined group',
        groupId: '10000000-0000-4000-8000-000000000001',
        groupName: 'Team A',
      });
    });

    it('joins group with unlimited capacity', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Open Team',
        enabled: true,
        max_members: null,
        member_count: 100,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        group_id: null,
      });
      Group.assignUserToGroup.mockResolvedValue();
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(Group.assignUserToGroup).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000010',
        '10000000-0000-4000-8000-000000000001'
      );
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000999' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('returns 404 when user not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
        max_members: null,
        member_count: 0,
      });
      User.findById.mockResolvedValue(undefined);
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('rejects joining a disabled group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Disabled',
        enabled: false,
        max_members: null,
        member_count: 0,
      });
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Cannot join a disabled group' });
    });

    it('rejects when user is already in a group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Team B',
        enabled: true,
        max_members: null,
        member_count: 1,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        group_id: '10000000-0000-4000-8000-000000000001',
      });
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000002' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'You are already in a group. Leave your current group first.',
      });
    });

    it('rejects when group is full', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Full Team',
        enabled: true,
        max_members: 3,
        member_count: 3,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        group_id: null,
      });
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group is full' });
    });

    it('handles error when joining group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });

    it('rejects normal user when join lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010', role: 'user' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Group joining is currently locked. Please contact the teaching staff.',
      });
      expect(Group.findById).not.toHaveBeenCalled();
    });

    it('allows admin to join when lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
        max_members: null,
        member_count: 0,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        group_id: null,
      });
      Group.assignUserToGroup.mockResolvedValue();
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(Group.assignUserToGroup).toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalledWith(403);
    });

    it('allows assignment_manager to join when lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
        max_members: null,
        member_count: 0,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        group_id: null,
      });
      Group.assignUserToGroup.mockResolvedValue();
      const reply = mockReply();
      await handlers['/groups/:id/join_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'assignment_manager' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(Group.assignUserToGroup).toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalledWith(403);
    });
  });

  describe('POST /groups/:id/leave', () => {
    beforeEach(() => {
      Config.get.mockResolvedValue('false');
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id/leave_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('leaves group successfully', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        group_id: '10000000-0000-4000-8000-000000000001',
      });
      User.updateGroup.mockResolvedValue({});
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(User.updateGroup).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000010', null);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Successfully left group' });
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000999' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('returns 404 when user not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
      });
      User.findById.mockResolvedValue(undefined);
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('rejects when user is not in this group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Team B',
        enabled: true,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        group_id: '10000000-0000-4000-8000-000000000001',
      });
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000002' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'You are not a member of this group' });
    });

    it('rejects when user is not in any group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        group_id: null,
      });
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'You are not a member of this group' });
    });

    it('handles error when leaving group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });

    it('rejects normal user when join lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000010', role: 'user' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Group joining is currently locked. Please contact the teaching staff.',
      });
      expect(Group.findById).not.toHaveBeenCalled();
    });

    it('allows admin to leave when lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      Group.findById.mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Team A',
        enabled: true,
      });
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        group_id: '10000000-0000-4000-8000-000000000001',
      });
      User.updateGroup.mockResolvedValue({});
      const reply = mockReply();
      await handlers['/groups/:id/leave_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '10000000-0000-4000-8000-000000000001' },
        },
        reply
      );
      expect(User.updateGroup).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', null);
      expect(reply.code).not.toHaveBeenCalledWith(403);
    });
  });

  describe('POST /groups/import-mappings', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/import-mappings_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when AM check fails in preHandler', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.requireAssignmentManager.mockResolvedValue(false);
      const reply = mockReply();
      const request = { user: { id: '00000000-0000-4000-8000-000000000010', role: 'user' } };
      const result = await handlers['/groups/import-mappings_post_pre'](request, reply);
      expect(mockFastify.requireAssignmentManager).toHaveBeenCalledWith(request, reply);
      expect(result).toBe(reply);
    });

    it('rejects missing or empty rows', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/import-mappings_post']({ user: { id: 'u1', role: 'admin' }, body: { rows: [] } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'No mappings to import' });
    });

    it('imports a valid row successfully', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000010' });
      Group.findByName.mockResolvedValue({ id: '10000000-0000-4000-8000-000000000001' });
      Group.assignUserToGroup.mockResolvedValue();
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'alice@test.com', groupName: 'Team A', action: 'import' }] },
        },
        reply
      );
      expect(Group.assignUserToGroup).toHaveBeenCalled();
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ imported: 1, skipped: [], errors: [] }));
    });

    it('skips a row when action is skip', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: {
            rows: [{ email: 'alice@test.com', groupName: 'Team A', action: 'skip', skipReason: 'Unknown user' }],
          },
        },
        reply
      );
      expect(Group.assignUserToGroup).not.toHaveBeenCalled();
      const result = reply.send.mock.calls[0][0];
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Unknown user');
    });

    it('skips row when user not found', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'nobody@test.com', groupName: 'Team A', action: 'import' }] },
        },
        reply
      );
      const result = reply.send.mock.calls[0][0];
      expect(result.skipped[0].reason).toBe('User not found');
    });

    it('skips row when group not found', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockResolvedValue({ id: 'u1' });
      Group.findByName.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'alice@test.com', groupName: 'NoSuchGroup', action: 'import' }] },
        },
        reply
      );
      const result = reply.send.mock.calls[0][0];
      expect(result.skipped[0].reason).toBe('Group not found');
    });

    it('records error when group is full', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockResolvedValue({ id: 'u1' });
      Group.findByName.mockResolvedValue({ id: 'g1' });
      const fullErr = new Error('Group is full');
      fullErr.statusCode = 409;
      Group.assignUserToGroup.mockRejectedValue(fullErr);
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'alice@test.com', groupName: 'Team A', action: 'import' }] },
        },
        reply
      );
      const result = reply.send.mock.calls[0][0];
      expect(result.errors[0].error).toBe('Group is full');
    });

    it('records per-row DB error in errors array', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockRejectedValue(new Error('DB down'));
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'alice@test.com', groupName: 'Team A', action: 'import' }] },
        },
        reply
      );
      const result = reply.send.mock.calls[0][0];
      expect(result.errors[0].error).toBe('DB down');
    });

    it('skips row when target user is an admin', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockResolvedValue({ id: 'admin1', role_name: 'admin' });
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'admin@test.com', groupName: 'Team A', action: 'import' }] },
        },
        reply
      );
      expect(Group.assignUserToGroup).not.toHaveBeenCalled();
      const result = reply.send.mock.calls[0][0];
      expect(result.skipped[0].reason).toBe('Admins and Assignment Managers cannot be assigned to a group');
    });

    it('skips row when target user is an assignment_manager', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockResolvedValue({ id: 'am1', role_name: 'assignment_manager' });
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'am@test.com', groupName: 'Team A', action: 'import' }] },
        },
        reply
      );
      expect(Group.assignUserToGroup).not.toHaveBeenCalled();
      const result = reply.send.mock.calls[0][0];
      expect(result.skipped[0].reason).toBe('Admins and Assignment Managers cannot be assigned to a group');
    });

    it('imports successfully when target user is a normal user', async () => {
      const { handlers } = setupRoute();
      User.findByEmail.mockResolvedValue({ id: 'u2', role_name: 'user' });
      Group.findByName.mockResolvedValue({ id: 'g1' });
      Group.assignUserToGroup.mockResolvedValue();
      const reply = mockReply();
      await handlers['/groups/import-mappings_post'](
        {
          user: { id: 'u1', role: 'admin' },
          body: { rows: [{ email: 'normaluser@test.com', groupName: 'Team A', action: 'import' }] },
        },
        reply
      );
      expect(Group.assignUserToGroup).toHaveBeenCalled();
      const result = reply.send.mock.calls[0][0];
      expect(result.imported).toBe(1);
    });
  });

  describe('GET /groups/export-mappings', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/export-mappings_get_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when AM check fails in preHandler', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.requireAssignmentManager.mockResolvedValue(false);
      const reply = mockReply();
      const request = { user: { id: '00000000-0000-4000-8000-000000000010', role: 'user' } };
      const result = await handlers['/groups/export-mappings_get_pre'](request, reply);
      expect(mockFastify.requireAssignmentManager).toHaveBeenCalledWith(request, reply);
      expect(result).toBe(reply);
    });

    it('returns user-group mappings', async () => {
      const { handlers } = setupRoute();
      Group.getExportMappings.mockResolvedValue([
        { email: 'alice@test.com', group_name: 'Team A' },
        { email: 'bob@test.com', group_name: 'Team B' },
      ]);
      const reply = mockReply();
      await handlers['/groups/export-mappings_get']({ user: { id: 'u1', role: 'admin' } }, reply);
      expect(reply.send).toHaveBeenCalledWith({
        mappings: [
          { email: 'alice@test.com', groupName: 'Team A' },
          { email: 'bob@test.com', groupName: 'Team B' },
        ],
      });
    });

    it('returns empty array when no mappings', async () => {
      const { handlers } = setupRoute();
      Group.getExportMappings.mockResolvedValue([]);
      const reply = mockReply();
      await handlers['/groups/export-mappings_get']({ user: { id: 'u1', role: 'admin' } }, reply);
      expect(reply.send).toHaveBeenCalledWith({ mappings: [] });
    });

    it('handles DB error (500)', async () => {
      const { handlers } = setupRoute();
      Group.getExportMappings.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/groups/export-mappings_get']({ user: { id: 'u1', role: 'admin' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
