-- Allow null password_hash for pending users (accounts created without a password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
