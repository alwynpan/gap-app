const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dbConfig = require('../config/database');

const pool = new Pool(dbConfig);

async function generateMigrationSQL() {
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

  // Safety guard for destructive migrations (Issue #49)
  const allowDestructive = process.env.ALLOW_DESTRUCTIVE_MIGRATION === 'true';
  if (!allowDestructive) {
    console.error('ERROR: Destructive migration blocked.');
    console.error('This migration will DROP all tables. Set ALLOW_DESTRUCTIVE_MIGRATION=true to proceed.');
    console.error('WARNING: This will DELETE ALL DATA in the database.');
    process.exit(1);
  }

  // Generate bcrypt hash dynamically at migration time
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

  return `
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
INSERT INTO roles (name) VALUES ('admin'), ('team_manager'), ('user');

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

-- Insert default admin user with dynamically generated password hash
-- Username: ${adminUsername}
-- Password hash generated at migration time using bcrypt
-- NOTE: Admin user inserted via parameterized query below (Issue #46)
-- INSERT INTO users (username, email, password_hash, role_id, enabled) 
-- VALUES (
--   '${adminUsername}',
--   'admin@gap.local',
--   '${passwordHash}',
--   1,
--   true
-- );

-- Insert sample groups
INSERT INTO groups (name, enabled) VALUES 
  ('Team Alpha', true),
  ('Team Beta', true),
  ('Team Gamma', true),
  ('Team Delta', false);
`;
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting database migration...');

    // Read admin credentials for parameterized INSERT (Issue #46)
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD;
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    // Generate SQL (without the admin INSERT - that's done via parameterized query)
    const migrationSQL = await generateMigrationSQL();

    await client.query('BEGIN');
    await client.query(migrationSQL);

    // Insert admin user using parameterized query to prevent SQL injection (Issue #46)
    await client.query(
      'INSERT INTO users (username, email, password_hash, role_id, enabled) VALUES ($1, $2, $3, $4, $5)',
      [adminUsername, 'admin@gap.local', passwordHash, 1, true]
    );

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

// Run migration if called directly
if (require.main === module) {
  migrate();
}

module.exports = { pool, migrate };
