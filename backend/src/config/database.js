// Canonical database configuration — imported directly by models and migrate.js via the pg Pool.
// Do not duplicate this config in config/index.js; use this file as the single source of truth.
require('dotenv').config();

// Warn if using the default password (indicates misconfiguration in non-dev environments)
if (!process.env.DB_PASSWORD) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] WARNING: DB_PASSWORD environment variable is not set. Using default password — do NOT use in production.'
  );
}
const dbPassword = process.env.DB_PASSWORD || 'password';

module.exports = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'gap_db',
  user: process.env.DB_USER || 'gap_user',
  password: dbPassword,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
