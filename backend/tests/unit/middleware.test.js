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

  it('checkRole allows a non-admin role present in the allowlist', async () => {
    const rbacPlugin = require('../../src/middleware/rbac');
    await rbacPlugin(fastify, {});

    const checkRole = fastify.decorate.mock.calls.find((call) => call[0] === 'checkRole')[1];
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

    const result = await checkRole({ user: { role: 'assignment_manager' } }, mockReply, ['assignment_manager']);

    expect(result).toBe(true);
    expect(mockReply.code).not.toHaveBeenCalled();
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

  describe('assertManagesAssignment', () => {
    const ASSIGNMENT_ID = 'a0000000-0000-0000-0000-000000000001';
    const USER_ID = 'u0000000-0000-0000-0000-000000000001';

    const setup = async (isManagerResult) => {
      jest.doMock('../../src/models/Assignment', () => ({
        isManager: jest.fn().mockResolvedValue(isManagerResult),
      }));
      const Assignment = require('../../src/models/Assignment');
      const rbacPlugin = require('../../src/middleware/rbac');
      await rbacPlugin(fastify, {});
      const assertManagesAssignment = fastify.decorate.mock.calls.find(
        (call) => call[0] === 'assertManagesAssignment'
      )[1];
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      return { assertManagesAssignment, mockReply, Assignment };
    };

    afterEach(() => {
      jest.dontMock('../../src/models/Assignment');
    });

    it('is registered as a decorator', async () => {
      const { assertManagesAssignment } = await setup(false);
      expect(assertManagesAssignment).toEqual(expect.any(Function));
    });

    it('returns 401 for unauthenticated requests', async () => {
      const { assertManagesAssignment, mockReply } = await setup(false);

      const result = await assertManagesAssignment({ user: null }, mockReply, ASSIGNMENT_ID);

      expect(result).toBe(false);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('allows admin without consulting the manager table', async () => {
      const { assertManagesAssignment, mockReply, Assignment } = await setup(false);

      const result = await assertManagesAssignment({ user: { id: USER_ID, role: 'admin' } }, mockReply, ASSIGNMENT_ID);

      expect(result).toBe(true);
      expect(Assignment.isManager).not.toHaveBeenCalled();
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('allows an assignment manager who manages the assignment', async () => {
      const { assertManagesAssignment, mockReply, Assignment } = await setup(true);

      const result = await assertManagesAssignment(
        { user: { id: USER_ID, role: 'assignment_manager' } },
        mockReply,
        ASSIGNMENT_ID
      );

      expect(result).toBe(true);
      expect(Assignment.isManager).toHaveBeenCalledWith(USER_ID, ASSIGNMENT_ID);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('returns 403 for an assignment manager who does not manage the assignment', async () => {
      const { assertManagesAssignment, mockReply } = await setup(false);

      const result = await assertManagesAssignment(
        { user: { id: USER_ID, role: 'assignment_manager' } },
        mockReply,
        ASSIGNMENT_ID
      );

      expect(result).toBe(false);
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('returns 403 for a plain user regardless of the manager table', async () => {
      const { assertManagesAssignment, mockReply, Assignment } = await setup(true);

      const result = await assertManagesAssignment({ user: { id: USER_ID, role: 'user' } }, mockReply, ASSIGNMENT_ID);

      expect(result).toBe(false);
      expect(Assignment.isManager).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });
  });
});
