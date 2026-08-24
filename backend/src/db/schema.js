'use strict';

/**
 * Base schema DDL — side-effect-free, no imports.
 * Imported by both migrate.js (production runner) and the integration test
 * globalSetup so there is a single source of truth for the base schema.
 *
 * Hierarchy: subjects → assignments → groups.
 * Users enrol in subjects (user_subjects m2m); group membership is per
 * assignment (user_groups) with at most one group per (user, assignment).
 * Assignment managers are scoped via assignment_managers m2m.
 *
 * NOTE: "a user may only be placed in a group of a subject they belong to"
 * is enforced in the application layer (UserGroup.assignUserToGroup
 * transaction), not by the database.
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

-- Create subjects table (top of the hierarchy)
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create assignments table (belongs to a subject; name unique per subject)
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  join_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (subject_id, name)
);

-- Create groups table (belongs to an assignment; name unique per assignment).
-- UNIQUE (id, assignment_id) exists solely as the composite FK target that
-- lets user_groups guarantee its group belongs to its assignment.
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  max_members INTEGER DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, name),
  UNIQUE (id, assignment_id)
);

-- Create users table (no group_id — membership lives in user_groups)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  student_id VARCHAR(50) UNIQUE,
  role_id UUID REFERENCES roles(id) ON DELETE RESTRICT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User ↔ Subject membership (m2m). "enabled" is the per-subject suspension
-- flag: suspended members keep their roster row but lose subject access and
-- group memberships (cleanup enforced in Subject.setMemberEnabled).
CREATE TABLE IF NOT EXISTS user_subjects (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject_id)
);

-- Per-assignment group membership: at most ONE group per (user, assignment);
-- composite FK pins the group to the same assignment.
-- Guarded: on a legacy database the pre-hierarchy groups table (no
-- assignment_id) still exists at this point, so the composite FK target is
-- missing; migration 013 drops the legacy table and creates user_groups.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'groups' AND column_name = 'assignment_id'
  ) THEN
    CREATE TABLE IF NOT EXISTS user_groups (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id UUID NOT NULL,
      group_id UUID NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, assignment_id),
      FOREIGN KEY (group_id, assignment_id)
        REFERENCES groups(id, assignment_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_groups_assignment_id ON groups(assignment_id);
    CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);
    CREATE INDEX IF NOT EXISTS idx_user_groups_assignment_id ON user_groups(assignment_id);
  END IF;
END $$;

-- Assignment-manager scoping (m2m)
CREATE TABLE IF NOT EXISTS assignment_managers (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, assignment_id)
);

-- Create indexes for performance
-- Case-insensitive uniqueness (users 012/015, hierarchy names 016) is created by
-- those migrations, not here: this DDL runs before migration 013 replaces the
-- legacy flat groups table, so referencing assignment_id here breaks upgrades.
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_assignments_subject_id ON assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_groups_enabled ON groups(enabled);
CREATE INDEX IF NOT EXISTS idx_user_subjects_subject_id ON user_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_assignment_managers_assignment_id ON assignment_managers(assignment_id);

-- Create schema_migrations table to track incremental migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

module.exports = { createSQL };
