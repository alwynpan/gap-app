'use strict';

/**
 * Base schema DDL — side-effect-free, no imports.
 * Imported by both migrate.js (production runner) and the integration test
 * globalSetup so there is a single source of truth for the base schema.
 */
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

module.exports = { createSQL };
