-- Migration 008 incorrectly added an updated_at trigger to password_reset_tokens,
-- which has no updated_at column. Drop it.
DROP TRIGGER IF EXISTS update_password_reset_tokens_updated_at ON password_reset_tokens;
