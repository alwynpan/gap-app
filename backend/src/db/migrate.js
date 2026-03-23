const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dbConfig = require('../config/database');

const pool = new Pool(dbConfig);

const dropSQL = `
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
`;

const createSQL = `
-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles (skip if already present)
INSERT INTO roles (name) VALUES ('admin'), ('assignment_manager'), ('user')
ON CONFLICT (name) DO NOTHING;

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  max_members INTEGER DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  student_id VARCHAR(50) UNIQUE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  role_id UUID REFERENCES roles(id) ON DELETE RESTRICT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_groups_enabled ON groups(enabled);

-- Create schema_migrations table to track incremental migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const sampleGroupsSQL = `
INSERT INTO groups (name, enabled) VALUES
  ('Team Alpha', true),
  ('Team Beta', true),
  ('Team Gamma', true),
  ('Team Delta', false)
ON CONFLICT (name) DO NOTHING;
`;

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function connectWithRetry() {
  const maxRetries = 10;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Failed to connect to database after ${maxRetries} attempts:`, err.message);
        process.exit(1);
      }
      console.log(`Waiting for database... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function runMigrations(client) {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    return;
  }

  const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying migration: ${file}`);
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  }
}

// Full reset: DROP all tables, recreate schema, seed data, run migrations
async function migrate() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ERROR: ADMIN_PASSWORD environment variable is not set.');
    console.error('Please set ADMIN_PASSWORD in your environment or .env file.');
    console.error('Example: ADMIN_PASSWORD=your-secure-password');
    process.exit(1);
  }

  // Production safety check: require confirmation unless --force is passed
  const isProduction = process.env.NODE_ENV === 'production';
  const forceFlag = process.argv.includes('--force');

  if (isProduction && !forceFlag) {
    console.warn('WARNING: You are about to DROP ALL TABLES in a production database.');
    console.warn('This will permanently delete all data.');
    const answer = await askConfirmation('Type "drop all tables" to confirm: ');
    if (answer !== 'drop all tables') {
      console.log('Migration cancelled.');
      process.exit(0);
    }
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

  const client = await connectWithRetry();

  try {
    console.log('Starting full database reset...');

    await client.query('BEGIN');
    await client.query(dropSQL);
    await client.query(createSQL);

    // Insert admin user (look up role by name, not hardcoded ID)
    await client.query(
      `INSERT INTO users (username, email, password_hash, role_id, enabled)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = 'admin'), true)`,
      [adminUsername, 'admin@gap.local', passwordHash]
    );

    // Insert sample groups
    await client.query(sampleGroupsSQL);

    // Run pending incremental migrations
    await runMigrations(client);

    await client.query('COMMIT');
    console.log('Database migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Incremental migrations only (non-destructive, safe for existing data)
// Also handles first-time setup: creates tables if they don't exist and seeds admin user
async function migrateUp() {
  const client = await connectWithRetry();

  try {
    await client.query('BEGIN');

    // Create base schema if tables don't exist (idempotent)
    await client.query(createSQL);

    // Check if admin user needs to be seeded (first-time setup)
    const { rows } = await client.query(
      "SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin' LIMIT 1"
    );
    if (rows.length === 0) {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (adminPassword) {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(adminPassword, saltRounds);
        await client.query(
          `INSERT INTO users (username, email, password_hash, role_id, enabled)
           VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = 'admin'), true)
           ON CONFLICT (username) DO NOTHING`,
          [adminUsername, 'admin@gap.local', passwordHash]
        );
        console.log('Admin user created.');
      }
    }

    await runMigrations(client);
    await client.query('COMMIT');
    console.log('Incremental migrations completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
// Usage: node migrate.js              - create tables if needed, apply pending migrations (safe)
//        node migrate.js up           - same as above (alias)
//        node migrate.js reset        - full reset: DROP + CREATE + seed + migrations (destructive)
//        node migrate.js reset --force - full reset, skip production confirmation
if (require.main === module) {
  const command = process.argv[2];
  if (command === 'reset') {
    migrate();
  } else {
    migrateUp();
  }
}

module.exports = { pool, migrate };
