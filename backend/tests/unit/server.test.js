// The global setup.js mocks @fastify/jwt and fastify-plugin; restore them
// so buildServer() can register real plugins for integration-style injection tests.
jest.unmock('@fastify/jwt');
jest.unmock('fastify-plugin');

// Set JWT_SECRET before the auth plugin reads it
process.env.JWT_SECRET = 'test-secret-for-server-tests';

// Mock models before requiring server
jest.mock('../../src/models/User', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByUsername: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateGroup: jest.fn(),
  updatePassword: jest.fn(),
  activate: jest.fn(),
  delete: jest.fn(),
  verifyPassword: jest.fn(),
}));

jest.mock('../../src/models/Role', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../src/models/Group', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../../src/models/PasswordResetToken', () => ({
  create: jest.fn(),
  findByToken: jest.fn(),
  markUsed: jest.fn(),
  deleteStaleForUser: jest.fn(),
  deleteExpired: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../src/services/email', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendPasswordSetupEmail: jest.fn(),
  sendEmail: jest.fn(),
}));

jest.mock('../../src/config/index', () => ({
  app: {
    nodeEnv: 'test',
    port: 3001,
    host: '0.0.0.0',
    registrationEnabled: true,
  },
  cors: {
    origin: '*',
  },
  jwt: {
    secret: 'test-secret',
  },
}));

const { buildServer } = require('../../src/server');
const User = require('../../src/models/User');

describe('Server', () => {
  let server;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /api/info', () => {
    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/info',
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({ error: 'Unauthorized' });
    });

    it('returns API info with auth', async () => {
      // Generate a valid JWT token using the server's jwt instance
      const token = server.jwt.sign({ id: 1, username: 'testuser', role: 'admin' });
      User.findById.mockResolvedValue({ id: 1, enabled: true, status: 'active', role_name: 'admin' });

      const response = await server.inject({
        method: 'GET',
        url: '/api/info',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toMatchObject({
        name: 'G.A.P. Portal API',
        version: '1.0.0',
        endpoints: {
          auth: expect.any(Object),
          users: expect.any(Object),
          groups: expect.any(Object),
        },
      });
    });
  });

  // The JWT is an identity assertion only; account state and role must be
  // re-read from the database on every request.
  describe('principal revocation', () => {
    const tokenFor = (claims) => server.jwt.sign({ id: 1, username: 'testuser', role: 'admin', ...claims });

    const inject = (token) =>
      server.inject({ method: 'GET', url: '/api/info', headers: { authorization: `Bearer ${token}` } });

    it('rejects a valid token whose account has been disabled', async () => {
      User.findById.mockResolvedValue({ id: 1, enabled: false, status: 'inactive', role_name: 'admin' });

      const response = await inject(tokenFor({}));

      expect(response.statusCode).toBe(401);
    });

    it('rejects a valid token whose account is inactive', async () => {
      User.findById.mockResolvedValue({ id: 1, enabled: true, status: 'inactive', role_name: 'admin' });

      expect((await inject(tokenFor({}))).statusCode).toBe(401);
    });

    it('rejects a valid token whose account has been deleted', async () => {
      User.findById.mockResolvedValue(null);

      expect((await inject(tokenFor({}))).statusCode).toBe(401);
    });

    it('rejects a malformed token without consulting the database', async () => {
      User.findById.mockClear();

      expect((await inject('not-a-jwt')).statusCode).toBe(401);
      expect(User.findById).not.toHaveBeenCalled();
    });

    // Must hit a route that AUTHORIZES on role: /api/info only authenticates, so
    // it would stay green even if the hook went back to trusting decoded.role.
    it('authorizes on the database role, not the token claim', async () => {
      // Token still claims admin, but the account has since been demoted.
      User.findById.mockResolvedValue({ id: 1, enabled: true, status: 'active', role_name: 'user' });

      const response = await server.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${tokenFor({ role: 'admin' })}` },
      });

      expect(response.statusCode).toBe(403);
      expect(User.findById).toHaveBeenCalledWith(1);
    });

    // A database fault is not a revocation. Answering 401 would make every
    // client discard a valid session over a transient blip.
    it('answers 500, not 401, when the principal lookup fails', async () => {
      User.findById.mockRejectedValue(Object.assign(new Error('connection terminated'), { code: '57P01' }));

      const response = await inject(tokenFor({}));

      expect(response.statusCode).toBe(500);
    });

    it('does not leak the database error to the caller', async () => {
      User.findById.mockRejectedValue(new Error('relation "users" does not exist'));

      const body = JSON.parse((await inject(tokenFor({}))).body);

      expect(JSON.stringify(body)).not.toContain('relation');
      expect(body).toEqual({ error: 'Internal Server Error' });
    });

    it('still authorizes an account whose database role really is admin', async () => {
      User.findById.mockResolvedValue({ id: 1, enabled: true, status: 'active', role_name: 'admin' });
      User.findAll.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${tokenFor({ role: 'user' })}` },
      });

      // Token claims 'user'; the database says admin, and the database wins.
      expect(response.statusCode).toBe(200);
    });
  });
});
