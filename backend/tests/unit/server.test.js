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
});
