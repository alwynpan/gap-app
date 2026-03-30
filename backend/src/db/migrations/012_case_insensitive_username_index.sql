-- Drop the existing case-sensitive unique constraint and replace with a
-- case-insensitive unique index so that 'Admin' and 'admin' are treated
-- as the same username.

-- Before creating the case-insensitive UNIQUE index, ensure there are no
-- existing usernames that differ only by case. If such duplicates exist,
-- abort the migration with a clear error so operators can clean up data
-- and rerun the migration.
DO $$
BEGIN
    IF EXISTS (
        SELECT LOWER(username) AS normalized_username
        FROM users
        GROUP BY LOWER(username)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot create case-insensitive unique index on users.username: duplicate usernames differing only by case exist. Please resolve these duplicates before rerunning this migration.';
    END IF;
END;
$$;

-- Drop constraint first (it owns the backing index); the DROP INDEX below
-- is then a no-op in the common case but handles any standalone index.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
DROP INDEX IF EXISTS users_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
