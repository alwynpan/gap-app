describe('Auth Middleware', () => {
  let fastify;
  let mockJwt;
  let originalJwtSecret;
  let originalJwtSecretExists;

  beforeAll(() => {
    originalJwtSecret = process.env.JWT_SECRET;
    originalJwtSecretExists = Object.hasOwn(process.env, 'JWT_SECRET');
    process.env.JWT_SECRET = 'test-secret-for-unit-tests';
  });

  afterAll(() => {
    // Restore exact original state (handles empty string correctly)
    if (originalJwtSecretExists) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  beforeEach(() => {
    jest.resetModules();
    mockJwt = {
      sign: jest.fn().mockResolvedValue('signed-token'),
      verify: jest.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', username: 'test' }),
    };

    fastify = {
      register: jest.fn().mockImplementation(async (plugin, options) => {
        fastify.jwt = mockJwt;
      }),
      decorate: jest.fn(),
      jwt: mockJwt,
    };
    jest.clearAllMocks();
  });

  it('registers JWT plugin', async () => {
    const authPlugin = require('../../src/middleware/auth');
    await authPlugin(fastify, {});

    expect(fastify.register).toHaveBeenCalled();
  });

  it('decorates with generateToken', async () => {
    const authPlugin = require('../../src/middleware/auth');
    await authPlugin(fastify, {});

    expect(fastify.decorate).toHaveBeenCalledWith('generateToken', expect.any(Function));
  });

  it('decorates with verifyToken', async () => {
    const authPlugin = require('../../src/middleware/auth');
    await authPlugin(fastify, {});

    expect(fastify.decorate).toHaveBeenCalledWith('verifyToken', expect.any(Function));
  });

  it('generateToken signs payload', async () => {
    const authPlugin = require('../../src/middleware/auth');
    await authPlugin(fastify, {});

    const generateToken = fastify.decorate.mock.calls.find((call) => call[0] === 'generateToken')[1];
    const token = await generateToken({ id: '00000000-0000-4000-8000-000000000001' });

    expect(mockJwt.sign).toHaveBeenCalledWith({ id: '00000000-0000-4000-8000-000000000001' });
    expect(token).toBe('signed-token');
  });

  it('verifyToken verifies token', async () => {
    const authPlugin = require('../../src/middleware/auth');
    await authPlugin(fastify, {});

    const verifyToken = fastify.decorate.mock.calls.find((call) => call[0] === 'verifyToken')[1];
    const result = await verifyToken('test-token');

    expect(mockJwt.verify).toHaveBeenCalledWith('test-token');
    expect(result).toEqual({ id: '00000000-0000-4000-8000-000000000001', username: 'test' });
  });
});

describe('RBAC Middleware', () => {
  let fastify;

  beforeEach(() => {
    jest.resetModules();

    fastify = {
      register: jest.fn(),
      decorate: jest.fn(),
      checkRole: null,
    };
    jest.clearAllMocks();
  });

  it('decorates with checkRole', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    expect(fastify.decorate).toHaveBeenCalledWith('checkRole', expect.any(Function));
  });

  it('decorates with requireAdmin', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    expect(fastify.decorate).toHaveBeenCalledWith('requireAdmin', expect.any(Function));
  });

  it('decorates with requireAssignmentManager', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    expect(fastify.decorate).toHaveBeenCalledWith('requireAssignmentManager', expect.any(Function));
  });

  it('checkRole rejects unauthenticated', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    const checkRole = fastify.decorate.mock.calls.find((call) => call[0] === 'checkRole')[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    await checkRole({ user: null }, mockReply, ['admin']);

    expect(mockReply.code).toHaveBeenCalledWith(401);
  });

  it('checkRole allows admin', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    const checkRole = fastify.decorate.mock.calls.find((call) => call[0] === 'checkRole')[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    const result = await checkRole({ user: { role: 'admin' } }, mockReply, ['admin']);

    expect(result).toBe(true);
  });

  it('checkRole denies user access to admin', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    const checkRole = fastify.decorate.mock.calls.find((call) => call[0] === 'checkRole')[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    await checkRole({ user: { role: 'user' } }, mockReply, ['admin']);

    expect(mockReply.code).toHaveBeenCalledWith(403);
  });

  it('requireAssignmentManager allows assignment_manager', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    fastify.checkRole = jest.fn().mockResolvedValue(true);
    await rbacPlugin(fastify, {});

    const requireAssignmentManager = fastify.decorate.mock.calls.find(
      (call) => call[0] === 'requireAssignmentManager'
    )[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    const result = await requireAssignmentManager({ user: { role: 'assignment_manager' } }, mockReply);

    expect(result).toBe(true);
    expect(fastify.checkRole).toHaveBeenCalledWith({ user: { role: 'assignment_manager' } }, mockReply, [
      'assignment_manager',
      'admin',
    ]);
  });

  it('requireAssignmentManager allows admin', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    fastify.checkRole = jest.fn().mockResolvedValue(true);
    await rbacPlugin(fastify, {});

    const requireAssignmentManager = fastify.decorate.mock.calls.find(
      (call) => call[0] === 'requireAssignmentManager'
    )[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    const result = await requireAssignmentManager({ user: { role: 'admin' } }, mockReply);

    expect(result).toBe(true);
  });

  it('requireAssignmentManager denies user', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    fastify.checkRole = jest.fn().mockImplementation((request, reply, roles) => {
      reply.code(403).send({ error: 'Forbidden' });
      return false;
    });
    await rbacPlugin(fastify, {});

    const requireAssignmentManager = fastify.decorate.mock.calls.find(
      (call) => call[0] === 'requireAssignmentManager'
    )[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    await requireAssignmentManager({ user: { role: 'user' } }, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
  });

  it('requireAdmin allows admin', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    fastify.checkRole = jest.fn().mockResolvedValue(true);
    await rbacPlugin(fastify, {});

    const requireAdmin = fastify.decorate.mock.calls.find((call) => call[0] === 'requireAdmin')[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    const result = await requireAdmin({ user: { role: 'admin' } }, mockReply);

    expect(result).toBe(true);
    expect(fastify.checkRole).toHaveBeenCalledWith({ user: { role: 'admin' } }, mockReply, ['admin']);
  });

  it('requireAdmin denies user', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    fastify.checkRole = jest.fn().mockImplementation((request, reply, roles) => {
      reply.code(403).send({ error: 'Forbidden' });
      return false;
    });
    await rbacPlugin(fastify, {});

    const requireAdmin = fastify.decorate.mock.calls.find((call) => call[0] === 'requireAdmin')[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    await requireAdmin({ user: { role: 'user' } }, mockReply);

    expect(mockReply.code).toHaveBeenCalledWith(403);
  });
});
