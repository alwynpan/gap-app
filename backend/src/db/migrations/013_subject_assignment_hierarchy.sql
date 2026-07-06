-- 013: Subject → Assignment → Group hierarchy.
--
-- *** DESTRUCTIVE ON LEGACY DATABASES ***
-- Databases created before this migration have a flat `groups` table and a
-- `users.group_id` column. Per the approved clean-reset strategy this
-- migration DROPS the legacy groups table (and all group memberships) and
-- removes users.group_id. User accounts are preserved. On databases created
-- from the current base schema this migration is a no-op apart from
-- re-attaching updated_at triggers.

-- Drop the legacy flat groups table (detected by the absence of assignment_id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'groups'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'groups' AND column_name = 'assignment_id'
  ) THEN
    DROP TABLE groups CASCADE;
  END IF;
END $$;

ALTER TABLE users DROP COLUMN IF EXISTS group_id;
DROP INDEX IF EXISTS idx_users_group_id;

-- Hierarchy tables (no-ops when created by the base schema)
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (subject_id, name)
);

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

CREATE TABLE IF NOT EXISTS user_subjects (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject_id)
);

CREATE TABLE IF NOT EXISTS user_groups (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL,
  group_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, assignment_id),
  FOREIGN KEY (group_id, assignment_id)
    REFERENCES groups(id, assignment_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignment_managers (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, assignment_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_subject_id ON assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_groups_assignment_id ON groups(assignment_id);
CREATE INDEX IF NOT EXISTS idx_groups_enabled ON groups(enabled);
CREATE INDEX IF NOT EXISTS idx_user_subjects_subject_id ON user_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_assignment_id ON user_groups(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_managers_assignment_id ON assignment_managers(assignment_id);

-- Re-attach updated_at triggers. Migration 008 created the function and the
-- groups trigger, but on legacy databases that trigger died with the dropped
-- table; recreate defensively for all hierarchy tables.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_subjects_updated_at ON subjects;
CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assignments_updated_at ON assignments;
CREATE TRIGGER update_assignments_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
