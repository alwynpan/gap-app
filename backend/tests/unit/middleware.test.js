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
      verify: jest.fn().mockResolvedValue({ id: 1, username: 'test' }),
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
    const token = await generateToken({ id: 1 });

    expect(mockJwt.sign).toHaveBeenCalledWith({ id: 1 });
    expect(token).toBe('signed-token');
  });

  it('verifyToken verifies token', async () => {
    const authPlugin = require('../../src/middleware/auth');
    await authPlugin(fastify, {});

    const verifyToken = fastify.decorate.mock.calls.find((call) => call[0] === 'verifyToken')[1];
    const result = await verifyToken('test-token');

    expect(mockJwt.verify).toHaveBeenCalledWith('test-token');
    expect(result).toEqual({ id: 1, username: 'test' });
  });
});

describe('RBAC Middleware', () => {
  let fastify;
  let mockBcrypt;

  beforeEach(() => {
    jest.resetModules();
    mockBcrypt = {
      hash: jest.fn().mockResolvedValue('hashed'),
      compare: jest.fn().mockResolvedValue(true),
    };

    fastify = {
      register: jest.fn().mockImplementation(async () => {
        fastify.bcrypt = mockBcrypt;
      }),
      decorate: jest.fn(),
      bcrypt: mockBcrypt,
      checkRole: null,
    };
    jest.clearAllMocks();
  });

  it('registers bcrypt plugin', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    expect(fastify.register).toHaveBeenCalled();
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

  it('decorates with hashPassword', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    expect(fastify.decorate).toHaveBeenCalledWith('hashPassword', expect.any(Function));
  });

  it('decorates with verifyPassword', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    expect(fastify.decorate).toHaveBeenCalledWith('verifyPassword', expect.any(Function));
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

  it('hashPassword hashes password', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    const hashPassword = fastify.decorate.mock.calls.find((call) => call[0] === 'hashPassword')[1];
    await hashPassword('plain');

    expect(mockBcrypt.hash).toHaveBeenCalledWith('plain');
  });

  it('verifyPassword verifies password', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    const verifyPassword = fastify.decorate.mock.calls.find((call) => call[0] === 'verifyPassword')[1];
    await verifyPassword('plain', 'hashed');

    expect(mockBcrypt.compare).toHaveBeenCalledWith('plain', 'hashed');
  });

  it('requireAssignmentManager allows assignment_manager', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    fastify.checkRole = jest.fn().mockResolvedValue(true);
    await rbacPlugin(fastify, {});

    const requireAssignmentManager = fastify.decorate.mock.calls.find((call) => call[0] === 'requireAssignmentManager')[1];
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

    const requireAssignmentManager = fastify.decorate.mock.calls.find((call) => call[0] === 'requireAssignmentManager')[1];
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

    const requireAssignmentManager = fastify.decorate.mock.calls.find((call) => call[0] === 'requireAssignmentManager')[1];
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
