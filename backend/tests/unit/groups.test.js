describe('Groups Routes', () => {
  let mockReply;
  let mockFastify;
  let capturedHandlers;

  beforeEach(() => {
    jest.resetModules();
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    capturedHandlers = {};
    mockFastify = {
      get: jest.fn((path, config, handler) => {
        if (config && config.preHandler) {
          capturedHandlers[`${path}_pre`] = config.preHandler;
        }
        capturedHandlers[path] = handler;
      }),
      post: jest.fn((path, config, handler) => {
        if (config && config.preHandler) {
          capturedHandlers[`${path}_pre`] = config.preHandler;
        }
        capturedHandlers[path] = handler;
      }),
      put: jest.fn((path, config, handler) => {
        if (config && config.preHandler) {
          capturedHandlers[`${path}_pre`] = config.preHandler;
        }
        capturedHandlers[path] = handler;
      }),
      delete: jest.fn((path, config, handler) => {
        if (config && config.preHandler) {
          capturedHandlers[`${path}_pre`] = config.preHandler;
        }
        capturedHandlers[path] = handler;
      }),
      requireAdmin: jest.fn().mockResolvedValue(true),
    };
    jest.clearAllMocks();
  });

  describe('GET /groups', () => {
    it('has preHandler for auth', () => {
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      expect(capturedHandlers['/groups_pre']).toBeDefined();
    });
  });

  describe('POST /groups', () => {
    it('rejects missing group name', async () => {
      const groupsRoutes = require('../../src/routes/groups');
      groupsRoutes(mockFastify, {});

      await capturedHandlers['/groups']({ user: { id: 1, role: 'admin' }, body: {} }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group name is required' });
    });
  });
});
