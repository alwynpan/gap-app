-- 015: Make email identity case-insensitive, matching username handling (012).
--
-- Before this migration `users.email` was UNIQUE but case-sensitive, so
-- 'Alice@example.com' and 'alice@example.com' were two accounts for one real
-- mailbox, and forgot-password / bulk-import lookups (exact match) reached only
-- one of them.

-- Abort with a clear message if the data already contains case-fold duplicates,
-- so an operator can merge them rather than have the index fail opaquely.
DO $$
BEGIN
    IF EXISTS (
        SELECT LOWER(email)
        FROM users
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot create case-insensitive unique index on users.email: addresses differing only by case exist. Please merge these accounts before rerunning this migration.';
    END IF;
END;
$$;

-- Canonicalise stored addresses so reads and writes agree.
UPDATE users SET email = LOWER(email) WHERE email <> LOWER(email);

-- Replace the case-sensitive constraint with a functional unique index.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS users_email_key;
DROP INDEX IF EXISTS idx_users_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
