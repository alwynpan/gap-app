const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dbConfig = require('../config/database');

const pool = new Pool(dbConfig);

const { createSQL } = require('./schema');

const dropSQL = `
DROP TABLE IF EXISTS user_groups CASCADE;
DROP TABLE IF EXISTS assignment_managers CASCADE;
DROP TABLE IF EXISTS user_subjects CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS config CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
`;

// Minimal dev seed: one subject with one assignment and sample groups under it.
const sampleHierarchySQL = `
WITH subj AS (
  INSERT INTO subjects (name) VALUES ('Sample Subject')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), assign AS (
  INSERT INTO assignments (subject_id, name)
  SELECT id, 'Assignment 1' FROM subj
  ON CONFLICT (subject_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO groups (assignment_id, name, enabled)
SELECT assign.id, g.name, g.enabled
FROM assign,
     (VALUES ('Team Alpha', true), ('Team Beta', true),
             ('Team Gamma', true), ('Team Delta', false)) AS g(name, enabled)
ON CONFLICT (assignment_id, name) DO NOTHING;
`;

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function connectWithRetry() {
  const maxRetries = 10;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Failed to connect to database after ${maxRetries} attempts:`, err.message);
        process.exit(1);
      }
      console.log(`Waiting for database... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function runMigrations(client) {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    return;
  }

  const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying migration: ${file}`);
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  }
}

// Full reset: DROP all tables, recreate schema, seed data, run migrations
async function migrate() {
  const adminUsername = 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ERROR: ADMIN_PASSWORD environment variable is not set.');
    console.error('Please set ADMIN_PASSWORD in your environment or .env file.');
    console.error('Example: ADMIN_PASSWORD=your-secure-password');
    process.exit(1);
  }

  // Production safety check: require confirmation unless --force is passed
  const isProduction = process.env.NODE_ENV === 'production';
  const forceFlag = process.argv.includes('--force');

  if (isProduction && !forceFlag) {
    console.warn('WARNING: You are about to DROP ALL TABLES in a production database.');
    console.warn('This will permanently delete all data.');
    const answer = await askConfirmation('Type "drop all tables" to confirm: ');
    if (answer !== 'drop all tables') {
      console.log('Migration cancelled.');
      process.exit(0);
    }
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

  const client = await connectWithRetry();

  try {
    console.log('Starting full database reset...');

    await client.query('BEGIN');
    await client.query(dropSQL);
    await client.query(createSQL);

    // Insert admin user (look up role by name, not hardcoded ID)
    await client.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, enabled)
       VALUES ($1, $2, $3, 'Admin', 'User', (SELECT id FROM roles WHERE name = 'admin'), true)`,
      [adminUsername, 'admin@gap.local', passwordHash]
    );

    // Insert sample subject/assignment/groups hierarchy
    await client.query(sampleHierarchySQL);

    // Run pending incremental migrations
    await runMigrations(client);

    await client.query('COMMIT');
    console.log('Database migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Incremental migrations only (non-destructive, safe for existing data)
// Also handles first-time setup: creates tables if they don't exist and seeds admin user
async function migrateUp() {
  const client = await connectWithRetry();

  try {
    await client.query('BEGIN');

    // Create base schema if tables don't exist (idempotent)
    await client.query(createSQL);

    // Migrations run BEFORE seeding: migration 012 replaces the username unique
    // constraint with a functional index, and the seed must match whichever
    // shape is current.
    await runMigrations(client);

    // Seed the admin on first-time setup, or to recover a database whose admin
    // accounts were all removed.
    const { rows } = await client.query(
      "SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin' LIMIT 1"
    );
    if (rows.length === 0) {
      const adminUsername = 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (adminPassword) {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(adminPassword, saltRounds);
        // WHERE NOT EXISTS rather than ON CONFLICT (username): after migration 012
        // uniqueness is a functional index on LOWER(username), which ON CONFLICT
        // cannot infer — it raises 42P10 at plan time and aborts startup.
        // $1 is cast explicitly: used bare in the SELECT list and inside LOWER()
        // it deduces two types and Postgres rejects it (42P08).
        await client.query(
          `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, enabled)
           SELECT $1::varchar, $2::varchar, $3::varchar, 'Admin', 'User',
                  (SELECT id FROM roles WHERE name = 'admin'), true
           WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER($1::varchar))`,
          [adminUsername, 'admin@gap.local', passwordHash]
        );
        console.log('Admin user created.');
      } else {
        console.warn('WARNING: no admin account exists and ADMIN_PASSWORD is not set; skipping admin seed.');
      }
    }

    await client.query('COMMIT');
    console.log('Incremental migrations completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
// Usage: node migrate.js              - create tables if needed, apply pending migrations (safe)
//        node migrate.js up           - same as above (alias)
//        node migrate.js reset        - full reset: DROP + CREATE + seed + migrations (destructive)
//        node migrate.js reset --force - full reset, skip production confirmation
if (require.main === module) {
  const command = process.argv[2];
  if (command === 'reset') {
    migrate();
  } else {
    migrateUp();
  }
}

module.exports = { migrate, createSQL };
