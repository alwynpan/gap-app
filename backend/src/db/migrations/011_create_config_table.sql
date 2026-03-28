-- Create config table for system-level settings
CREATE TABLE IF NOT EXISTS config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default config values
INSERT INTO config (key, value) VALUES ('group_join_locked', 'false')
ON CONFLICT (key) DO NOTHING;
