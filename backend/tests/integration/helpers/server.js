'use strict';

/**
 * Builds a Fastify server instance for integration tests.
 * Each test file should call buildTestServer() in beforeAll and
 * closeTestServer() in afterAll.
 */

const { buildServer } = require('../../../src/server');

async function buildTestServer() {
  // Disable pino logger to keep test output clean.
  const app = await buildServer({ logger: false });
  await app.ready();
  return app;
}

/**
 * Closes the Fastify app. The shared pg pool singletons (src/db/pool.js and
 * the test helper pool in helpers/db.js) are intentionally left open across
 * test files so that subsequent files can reuse them without reconnecting.
 * Jest's forceExit will drain them when the worker process exits.
 */
async function closeTestServer(app) {
  await app.close();
}

module.exports = { buildTestServer, closeTestServer };
