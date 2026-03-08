describe('Auth Middleware - JWT_SECRET Validation', () => {
  let originalJwtSecret;

  beforeAll(() => {
    originalJwtSecret = process.env.JWT_SECRET;
  });

  afterAll(() => {
    if (originalJwtSecret) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  it('throws error when JWT_SECRET is not configured', async () => {
    // Save and clear JWT_SECRET
    delete process.env.JWT_SECRET;
    jest.resetModules();

    const authPlugin = require('../../src/middleware/auth');
    const fastify = {
      register: jest.fn().mockImplementation(async () => {}),
      decorate: jest.fn(),
      jwt: {},
    };

    // Should throw error during plugin registration
    await expect(authPlugin(fastify, {})).rejects.toThrow(
      'JWT_SECRET environment variable is required for production security'
    );

    // Restore for other tests
    process.env.JWT_SECRET = originalJwtSecret || 'test-secret';
  });

  it('proceeds when JWT_SECRET is configured', async () => {
    process.env.JWT_SECRET = 'test-secret-for-testing';
    jest.resetModules();

    const authPlugin = require('../../src/middleware/auth');
    const fastify = {
      register: jest.fn().mockImplementation(async () => {}),
      decorate: jest.fn(),
      jwt: {},
    };

    // Should not throw error
    await expect(authPlugin(fastify, {})).resolves.not.toThrow();
  });
});
