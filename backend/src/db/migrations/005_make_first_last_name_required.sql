-- Migration 005: Make first_name and last_name required
-- Backfill NULL values with 'User' before adding NOT NULL constraint
-- For admin users, use 'Admin' as first_name

-- First, backfill any NULL first_name/last_name values
UPDATE users 
SET 
  first_name = CASE 
    WHEN first_name IS NULL AND username = 'admin' THEN 'Admin'
    WHEN first_name IS NULL THEN username
    ELSE first_name
  END,
  last_name = CASE 
    WHEN last_name IS NULL AND username = 'admin' THEN 'User'
    WHEN last_name IS NULL THEN username
    ELSE last_name
  END
WHERE first_name IS NULL OR last_name IS NULL;

-- Add NOT NULL constraints
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
