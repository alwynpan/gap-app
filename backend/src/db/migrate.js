const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const dbConfig = require('../config/database');

const pool = new Pool(dbConfig);

const schemaSQL = `
-- Drop tables if they exist (for clean migration)
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- Create roles table
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles
INSERT INTO roles (name) VALUES ('admin'), ('assignment_manager'), ('user');

-- Create groups table
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  student_id VARCHAR(50) UNIQUE,
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  role_id INTEGER REFERENCES roles(id) ON DELETE RESTRICT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_group_id ON users(group_id);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_groups_enabled ON groups(enabled);

-- Insert sample groups
INSERT INTO groups (name, enabled) VALUES
  ('Team Alpha', true),
  ('Team Beta', true),
  ('Team Gamma', true),
  ('Team Delta', false);
`;

async function runMigrations(client) {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) return;

  const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying migration: ${file}`);
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  }
}

async function migrate() {
  // Read admin credentials from environment variables
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  // Fail migration if ADMIN_PASSWORD is not set
  if (!adminPassword) {
    console.error('ERROR: ADMIN_PASSWORD environment variable is not set.');
    console.error('Please set ADMIN_PASSWORD in your environment or .env file.');
    console.error('Example: ADMIN_PASSWORD=your-secure-password');
    process.exit(1);
  }

  // Generate bcrypt hash dynamically at migration time
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

  // Retry connecting to the database (handles Docker DNS propagation delay)
  const maxRetries = 10;
  let client;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      client = await pool.connect();
      break;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Failed to connect to database after ${maxRetries} attempts:`, err.message);
        process.exit(1);
      }
      console.log(`Waiting for database... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  try {
    console.log('Starting database migration...');

    await client.query('BEGIN');
    await client.query(schemaSQL);

    // Insert admin user with parameterized query to prevent SQL injection
    await client.query(
      `INSERT INTO users (username, email, password_hash, role_id, enabled)
       VALUES ($1, $2, $3, 1, true)`,
      [adminUsername, 'admin@gap.local', passwordHash]
    );

    // Create schema_migrations table to track incremental migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

// Run incremental migrations only (non-destructive, for existing databases)
async function migrateUp() {
  const maxRetries = 10;
  let client;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      client = await pool.connect();
      break;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Failed to connect to database after ${maxRetries} attempts:`, err.message);
        process.exit(1);
      }
      console.log(`Waiting for database... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
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
// Usage: node migrate.js          - full reset (DROP + CREATE + migrations)
//        node migrate.js up       - incremental only (safe for existing data)
if (require.main === module) {
  const command = process.argv[2];
  if (command === 'up') {
    migrateUp();
  } else {
    migrate();
  }
}

module.exports = { pool, migrate };
