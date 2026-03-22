ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Set existing users' first_name and last_name to their username
UPDATE users SET first_name = username, last_name = username WHERE first_name IS NULL;
