describe('Auth Routes', () => {
  let mockReply;
  let mockFastify;
  let capturedHandlers;
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.REGISTRATION_ENABLED;
    process.env.REGISTRATION_ENABLED = 'true';
    jest.resetModules();

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
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.REGISTRATION_ENABLED = originalEnv;
  });

  describe('POST /auth/register', () => {
    it('rejects when registration disabled', async () => {
      process.env.REGISTRATION_ENABLED = 'false';
      jest.resetModules();

      mockFastify.post = jest.fn((path, ...args) => {
        const handler = args.find((arg) => typeof arg === 'function');
        if (handler) {
          capturedHandlers[path] = handler;
        }
      });

      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', password: 'password123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('rejects missing fields', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register']({ body: { username: 'test' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('rejects short password', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/register'](
        { body: { username: 'test', email: 'test@test.com', password: '123' } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /auth/login', () => {
    it('rejects missing credentials', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/login']({ body: { username: 'test' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns success', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/logout']({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Logout successful' });
    });
  });

  describe('GET /auth/me', () => {
    it('rejects unauthenticated', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      await capturedHandlers['/auth/me_pre']({ user: null }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns user info', async () => {
      const authRoutes = require('../../src/routes/auth');
      authRoutes(mockFastify, {});

      const request = {
        user: { id: 1, username: 'test', email: 'test@test.com', role: 'user', groupId: 1, groupName: 'Team' },
      };

      await capturedHandlers['/auth/me'](request, mockReply);

      expect(mockReply.send).toHaveBeenCalled();
    });
  });
});
