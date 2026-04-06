'use strict';

const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { Pool } = require('pg');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Single source of truth for the base DDL — imported directly from the
// production migration runner so this file can never silently diverge.
const { createSQL } = require('../../../src/db/migrate');

// Temp file lives outside the repo tree to prevent accidental git commits.
const CONTAINER_CONFIG_FILE = path.join(os.tmpdir(), 'gap-integration-container.json');

// Test-only admin password — not a secret, not written to disk.
const ADMIN_PASSWORD = 'AdminPass123!';

async function runMigrations(client) {
  const migrationsDir = path.join(__dirname, '../../../src/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  }
}

async function seedAdminUser(client) {
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4); // fast rounds for tests

  // Use WHERE NOT EXISTS — avoids ON CONFLICT issues with the case-insensitive
  // functional index that migration 012 creates.
  await client.query(
    `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, enabled)
     SELECT 'admin', 'admin@gap.local', $1, 'Admin', 'User',
            (SELECT id FROM roles WHERE name = 'admin'), true
     WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = 'admin')`,
    [passwordHash]
  );
}

module.exports = async () => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('gap_test')
    .withUsername('gap_test_user')
    .withPassword('gap_test_pass')
    .start();

  const dbConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  };

  // Run schema + migrations + seed admin using the production DDL.
  const pool = new Pool(dbConfig);
  const client = await pool.connect();
  try {
    await client.query(createSQL);
    await runMigrations(client);
    await seedAdminUser(client);
  } finally {
    client.release();
    await pool.end();
  }

  // Write connection config for worker processes and teardown.
  // adminPassword is NOT written here — it is a compile-time constant in this
  // file and in setupEnv.js; no need to persist it to disk.
  fs.writeFileSync(CONTAINER_CONFIG_FILE, JSON.stringify(dbConfig));

  // Store stop function for teardown (globalSetup and globalTeardown share a
  // process in Jest 28+, so global works reliably here).
  global.__TESTCONTAINER_STOP__ = () => container.stop();
};
