'use strict';

jest.mock('../../src/models/Config');

const Config = require('../../src/models/Config');

describe('Config Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockFastify = () => ({
    get: jest.fn(),
    put: jest.fn(),
    checkRole: jest.fn().mockResolvedValue(true),
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
    wrapMethod('put');
    return handlers;
  };

  const setupRoute = () => {
    const mockFastify = createMockFastify();
    const handlers = captureHandlers(mockFastify);
    const configRoutes = require('../../src/routes/config');
    configRoutes(mockFastify, {});
    return { mockFastify, handlers };
  };

  const mockReply = () => ({ code: jest.fn().mockReturnThis(), send: jest.fn() });

  describe('GET /config/group-join-locked', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/config/group-join-locked_get_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns locked: false when config value is "false"', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('false');
      const reply = mockReply();
      await handlers['/config/group-join-locked_get']({ user: { id: 'u1', role: 'user' } }, reply);
      expect(Config.get).toHaveBeenCalledWith('group_join_locked');
      expect(reply.send).toHaveBeenCalledWith({ locked: false });
    });

    it('returns locked: true when config value is "true"', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      const reply = mockReply();
      await handlers['/config/group-join-locked_get']({ user: { id: 'u1', role: 'user' } }, reply);
      expect(reply.send).toHaveBeenCalledWith({ locked: true });
    });

    it('returns locked: false when config value is null (default)', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/config/group-join-locked_get']({ user: { id: 'u1', role: 'user' } }, reply);
      expect(reply.send).toHaveBeenCalledWith({ locked: false });
    });

    it('returns 500 on database error', async () => {
      const { handlers } = setupRoute();
      Config.get.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/config/group-join-locked_get']({ user: { id: 'u1', role: 'user' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('GET /config', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/config_get_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('rejects when role check fails', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.checkRole.mockResolvedValue(false);
      const reply = mockReply();
      const request = { user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' } };
      await handlers['/config_get_pre'](request, reply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, reply, ['admin', 'assignment_manager']);
    });

    it('returns all config rows for admin', async () => {
      const { handlers } = setupRoute();
      const mockRows = [{ key: 'group_join_locked', value: 'false', updated_at: new Date() }];
      Config.getAll.mockResolvedValue(mockRows);
      const reply = mockReply();
      await handlers['/config_get']({}, reply);
      expect(Config.getAll).toHaveBeenCalled();
      expect(reply.send).toHaveBeenCalledWith({ config: mockRows });
    });

    it('returns 500 on database error', async () => {
      const { handlers } = setupRoute();
      Config.getAll.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/config_get']({}, reply);
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /config/:key', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/config/:key_put_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('rejects when role check fails', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.checkRole.mockResolvedValue(false);
      const reply = mockReply();
      const request = { user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' } };
      await handlers['/config/:key_put_pre'](request, reply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, reply, ['admin', 'assignment_manager']);
    });

    it('rejects invalid config key with 400', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/config/:key_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { key: 'invalid_key' },
          body: { value: 'true' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid config key: invalid_key' });
    });

    it('rejects missing value with 400', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/config/:key_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { key: 'group_join_locked' },
          body: {},
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('updates config value successfully', async () => {
      const { handlers } = setupRoute();
      const mockRow = { key: 'group_join_locked', value: 'true', updated_at: new Date() };
      Config.set.mockResolvedValue(mockRow);
      const reply = mockReply();
      await handlers['/config/:key_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { key: 'group_join_locked' },
          body: { value: 'true' },
        },
        reply
      );
      expect(Config.set).toHaveBeenCalledWith('group_join_locked', 'true');
      expect(reply.send).toHaveBeenCalledWith({
        message: 'Config updated successfully',
        config: mockRow,
      });
    });

    it('returns 500 on database error', async () => {
      const { handlers } = setupRoute();
      Config.set.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const reply = mockReply();
      await handlers['/config/:key_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { key: 'group_join_locked' },
          body: { value: 'true' },
        },
        reply
      );
      expect(consoleSpy).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });
});
