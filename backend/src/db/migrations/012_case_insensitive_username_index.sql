-- Drop the existing case-sensitive unique constraint and replace with a
-- case-insensitive unique index so that 'Admin' and 'admin' are treated
-- as the same username.
DROP INDEX IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
