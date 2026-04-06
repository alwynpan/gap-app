'use strict';

/**
 * Runs in every worker process BEFORE any module is loaded (setupFiles).
 * Reads the container connection config written by globalSetup and injects
 * the test DB coordinates into process.env so that pool.js and
 * config/database.js point at the testcontainer, not the real DB.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONTAINER_CONFIG_FILE = path.join(os.tmpdir(), 'gap-integration-container.json');

if (!fs.existsSync(CONTAINER_CONFIG_FILE)) {
  throw new Error(
    'Integration test container config not found. ' +
      'Run globalSetup first (jest --config jest.integration.config.js).'
  );
}

const config = JSON.parse(fs.readFileSync(CONTAINER_CONFIG_FILE, 'utf8'));

process.env.DB_HOST = config.host;
process.env.DB_PORT = String(config.port);
process.env.DB_NAME = config.database;
process.env.DB_USER = config.user;
process.env.DB_PASSWORD = config.password;
process.env.JWT_SECRET = 'integration-test-jwt-secret-do-not-use-in-prod';
// 'development' gives relaxed rate limits (5000 req/min) for integration tests.
process.env.NODE_ENV = 'development';
// Admin password is a compile-time constant shared with globalSetup — not stored on disk.
process.env.ADMIN_PASSWORD = 'AdminPass123!';
process.env.REGISTRATION_ENABLED = 'true';
