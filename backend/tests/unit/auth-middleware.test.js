describe('Auth Middleware - JWT_SECRET Validation', () => {
  let originalJwtSecret;
  let originalJwtSecretExists;

  beforeAll(() => {
    originalJwtSecret = process.env.JWT_SECRET;
    originalJwtSecretExists = Object.hasOwn(process.env, 'JWT_SECRET');
  });

  afterAll(() => {
    // Restore exact original state (handles empty string correctly)
    if (originalJwtSecretExists) {
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

    // Restore for other tests (preserve exact original state)
    if (originalJwtSecretExists) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      process.env.JWT_SECRET = 'test-secret-for-next-test';
    }
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

    // Should not throw error (await directly, no rejection = success)
    await authPlugin(fastify, {});
  });
});
