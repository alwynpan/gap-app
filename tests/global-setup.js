'use strict';

const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { Pool } = require('pg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');

const STATE_FILE = path.join(os.tmpdir(), 'gap-e2e-state.json');
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const BACKEND_PORT = 3099;
const FRONTEND_PORT = 4173;
const ADMIN_PASSWORD = 'AdminPass123!';

async function runMigrations(client) {
  const migrationsDir = path.join(BACKEND_DIR, 'src', 'db', 'migrations');
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
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4);

  await client.query(
    `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, enabled, status)
     SELECT 'admin', 'admin@gap.local', $1, 'Admin', 'User',
            (SELECT id FROM roles WHERE name = 'admin'), true, 'active'
     WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = 'admin')`,
    [passwordHash]
  );
}

async function waitForVitePreview(proc, port, timeoutMs = 30000) {
  const http = require('http');
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => {
      if (!settled) {
        settled = true;
        fn(val);
      }
    };

    proc.on('error', (err) => settle(reject, err));
    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        settle(reject, new Error(`vite preview exited with code ${code}`));
      }
    });

    const poll = () => {
      if (proc.exitCode !== null || proc.killed) {
        settle(reject, new Error('vite preview process exited before becoming ready'));
        return;
      }
      if (Date.now() >= deadline) {
        settle(reject, new Error('Timed out waiting for vite preview to start'));
        return;
      }
      const req = http.get(`http://localhost:${port}`, () => {
        req.destroy();
        settle(resolve, undefined);
      });
      req.on('error', () => setTimeout(poll, 500));
      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(poll, 500);
      });
    };
    setTimeout(poll, 500);
  });
}

module.exports = async function globalSetup() {
  // 1. Start PostgreSQL Testcontainer
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('gap_e2e')
    .withUsername('gap_e2e_user')
    .withPassword('gap_e2e_pass')
    .start();

  const dbConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  };

  // 2. Run schema + migrations + seed
  const pool = new Pool(dbConfig);
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    // Load schema from the backend — set env vars FIRST to avoid pool init
    process.env.DB_HOST = dbConfig.host;
    process.env.DB_PORT = String(dbConfig.port);
    process.env.DB_NAME = dbConfig.database;
    process.env.DB_USER = dbConfig.user;
    process.env.DB_PASSWORD = dbConfig.password;
    process.env.JWT_SECRET = 'e2e-test-jwt-secret-do-not-use-in-prod';
    process.env.NODE_ENV = 'development';
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    process.env.CORS_ORIGIN = `http://localhost:${FRONTEND_PORT}`;
    process.env.APP_URL = `http://localhost:${FRONTEND_PORT}`;

    const { createSQL } = require(path.join(BACKEND_DIR, 'src', 'db', 'schema'));
    await client.query(createSQL);
    await runMigrations(client);
    await seedAdminUser(client);
  } finally {
    client.release();
    await pool.end();
  }

  // 3. Start backend on port BACKEND_PORT
  const { buildServer } = require(path.join(BACKEND_DIR, 'src', 'server'));
  const app = await buildServer({ logger: false });
  await app.listen({ port: BACKEND_PORT, host: '127.0.0.1' });

  // 4. Build frontend with VITE_API_URL pointing to backend
  console.log('[e2e] Building frontend...');
  try {
    execSync('pnpm run build', {
      cwd: FRONTEND_DIR,
      env: {
        ...process.env,
        VITE_API_URL: `http://localhost:${BACKEND_PORT}/api`,
      },
      stdio: 'pipe',
    });
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    throw err;
  }
  console.log('[e2e] Frontend build complete.');

  // 5. Start vite preview via pnpm exec so it resolves the correct vite binary cross-platform
  const previewProc = spawn(
    'pnpm',
    ['exec', 'vite', 'preview', '--port', String(FRONTEND_PORT), '--strictPort'],
    {
      cwd: FRONTEND_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  await waitForVitePreview(previewProc, FRONTEND_PORT);
  console.log(`[e2e] Vite preview running on http://localhost:${FRONTEND_PORT}`);

  // 6. Write state file for helpers
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({
      dbConfig,
      backendPort: BACKEND_PORT,
      frontendPort: FRONTEND_PORT,
    })
  );

  // 7. Store teardown functions
  global.__E2E_TEARDOWN__ = async () => {
    previewProc.kill('SIGTERM');
    await app.close();
    // End the backend's DB pool before stopping the container so idle connections
    // close cleanly instead of being forcibly terminated (which logs pool errors).
    const backendPool = require(path.join(BACKEND_DIR, 'src', 'db', 'pool'));
    await backendPool.end();
    await container.stop();
    try {
      fs.unlinkSync(STATE_FILE);
    } catch (_) {
      // ignore
    }
  };
};
