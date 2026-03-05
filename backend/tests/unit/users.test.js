describe('Users Routes', () => {
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
      checkRole: jest.fn().mockResolvedValue(true),
      requireAdmin: jest.fn().mockResolvedValue(true),
    };
    jest.clearAllMocks();
  });

  describe('GET /users', () => {
    it('has preHandler for auth', () => {
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      expect(capturedHandlers['/users_pre']).toBeDefined();
    });
  });

  describe('DELETE /users/:id', () => {
    it('prevents self-deletion', async () => {
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const request = { user: { id: 1, role: 'admin' }, params: { id: '1' } };
      await capturedHandlers['/users/:id'](request, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
    });
  });
});
