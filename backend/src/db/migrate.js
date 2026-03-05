const { Pool } = require('pg');
const dbConfig = require('../config/database');

const pool = new Pool(dbConfig);

const migrationSQL = `
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

-- Insert default admin user (password: admin123)
-- Note: In production, change this immediately
INSERT INTO users (username, email, password_hash, role_id, enabled) 
VALUES (
  'admin',
  'admin@gap.local',
  '$2b$10$rQZ9vXJxL5K5J5K5J5K5JeQZ9vXJxL5K5J5K5J5K5J5K5J5K5J5K',
  1,
  true
);

-- Insert sample groups
INSERT INTO groups (name, enabled) VALUES 
  ('Team Alpha', true),
  ('Team Beta', true),
  ('Team Gamma', true),
  ('Team Delta', false);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting database migration...');
    await client.query('BEGIN');
    await client.query(migrationSQL);
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
