-- These indexes are redundant because UNIQUE constraints already create implicit B-tree indexes
-- Drop them to avoid redundant write overhead

DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_prt_token;
