const jwt = require('@fastify/jwt');

async function authPlugin(fastify, _options) {
  // Fail startup if JWT_SECRET is not configured (security requirement)
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required for production security');
  }

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
  });

  // Decorate reply with token generation
  fastify.decorate('generateToken', async (payload) => {
    return fastify.jwt.sign(payload);
  });

  // Decorate request with user verification
  fastify.decorate('verifyToken', async (token) => {
    return fastify.jwt.verify(token);
  });
}

module.exports = authPlugin;
