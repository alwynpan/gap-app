-- Skip if already migrated to UUID (check if users.id is uuid type)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'id') = 'uuid' THEN
    RAISE NOTICE 'Already using UUID IDs, skipping migration';
    RETURN;
  END IF;

  -- Step 1: Add new UUID columns
  ALTER TABLE roles ADD COLUMN new_id UUID DEFAULT gen_random_uuid() NOT NULL;
  ALTER TABLE groups ADD COLUMN new_id UUID DEFAULT gen_random_uuid() NOT NULL;
  ALTER TABLE users ADD COLUMN new_id UUID DEFAULT gen_random_uuid() NOT NULL;
  ALTER TABLE users ADD COLUMN new_group_id UUID;
  ALTER TABLE users ADD COLUMN new_role_id UUID;

  -- Step 2: Populate UUID values
  UPDATE roles SET new_id = gen_random_uuid();
  UPDATE groups SET new_id = gen_random_uuid();
  UPDATE users SET new_id = gen_random_uuid();

  -- Step 3: Map old integer FKs to new UUID FKs
  UPDATE users u SET new_group_id = g.new_id FROM groups g WHERE u.group_id = g.id;
  UPDATE users u SET new_role_id = r.new_id FROM roles r WHERE u.role_id = r.id;

  -- Step 4: Drop foreign key constraints and indexes
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_group_id_fkey;
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_id_fkey;
  DROP INDEX IF EXISTS idx_users_group_id;
  DROP INDEX IF EXISTS idx_users_role_id;
  DROP INDEX IF EXISTS idx_users_email;
  DROP INDEX IF EXISTS idx_users_username;
  DROP INDEX IF EXISTS idx_groups_enabled;

  -- Step 5: Drop primary key constraints
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
  ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_pkey;
  ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_pkey;

  -- Step 6: Drop old columns
  ALTER TABLE users DROP COLUMN id;
  ALTER TABLE users DROP COLUMN group_id;
  ALTER TABLE users DROP COLUMN role_id;
  ALTER TABLE groups DROP COLUMN id;
  ALTER TABLE roles DROP COLUMN id;

  -- Step 7: Rename new columns
  ALTER TABLE roles RENAME COLUMN new_id TO id;
  ALTER TABLE groups RENAME COLUMN new_id TO id;
  ALTER TABLE users RENAME COLUMN new_id TO id;
  ALTER TABLE users RENAME COLUMN new_group_id TO group_id;
  ALTER TABLE users RENAME COLUMN new_role_id TO role_id;

  -- Step 8: Set defaults
  ALTER TABLE roles ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE groups ALTER COLUMN id SET DEFAULT gen_random_uuid();
  ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();

  -- Step 9: Add primary keys
  ALTER TABLE roles ADD PRIMARY KEY (id);
  ALTER TABLE groups ADD PRIMARY KEY (id);
  ALTER TABLE users ADD PRIMARY KEY (id);

  -- Step 10: Add foreign keys
  ALTER TABLE users ADD CONSTRAINT users_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
  ALTER TABLE users ADD CONSTRAINT users_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT;

  -- Step 11: Recreate indexes
  CREATE INDEX idx_users_group_id ON users(group_id);
  CREATE INDEX idx_users_role_id ON users(role_id);
  CREATE INDEX idx_users_email ON users(email);
  CREATE INDEX idx_users_username ON users(username);
  CREATE INDEX idx_groups_enabled ON groups(enabled);

  -- Step 12: Drop old sequences
  DROP SEQUENCE IF EXISTS roles_id_seq;
  DROP SEQUENCE IF EXISTS groups_id_seq;
  DROP SEQUENCE IF EXISTS users_id_seq;
END $$;
