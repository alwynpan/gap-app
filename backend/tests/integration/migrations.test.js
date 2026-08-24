'use strict';

/**
 * Legacy-upgrade tests.
 *
 * The rest of the integration suite builds the CURRENT schema and then applies
 * migrations to it, so it can never catch a migration that only breaks when
 * older objects are already present. Two real outages were shipped that way:
 * hierarchy tables with UUID foreign keys to a still-INTEGER `users.id`
 * (SQLSTATE 42804), and `createSQL` seeding the `assignment_manager` role
 * before migration 001 renames `team_manager` onto that name (SQLSTATE 23505).
 *
 * These tests use their own throwaway containers rather than the suite's shared
 * one, because they need a database that does NOT already have the schema.
 */

const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const { createSQL } = require('../../src/db/schema');

const MIGRATIONS_DIR = path.join(__dirname, '../../src/db/migrations');

// The flat, pre-hierarchy schema as it shipped before migration 001: integer
// primary keys, a `team_manager` role, and group membership on users.group_id.
const LEGACY_SCHEMA = `
  CREATE TABLE roles (
    id SERIAL PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE groups (
    id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, enabled BOOLEAN DEFAULT true,
    max_members INTEGER DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE users (
    id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, first_name VARCHAR(100), last_name VARCHAR(100),
    student_id VARCHAR(50) UNIQUE,
    role_id INTEGER REFERENCES roles(id) ON DELETE RESTRICT,
    group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO roles (name) VALUES ('admin'), ('team_manager'), ('user');
  INSERT INTO groups (name) VALUES ('Legacy Group A'), ('Legacy Group B');
  INSERT INTO users (username, email, password_hash, role_id, group_id) VALUES
    ('legacyadmin', 'la@example.com', 'x', 1, 1),
    ('legacytm',    'tm@example.com', 'x', 2, 1),
    ('legacystu',   'ls@example.com', 'x', 3, 2);
`;

/** Applies createSQL then every migration, in the order src/db/migrate.js uses. */
async function upgrade(client) {
  await client.query(createSQL);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  }
}

async function startDatabase() {
  const container = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('gap_db')
    .withUsername('gap_user')
    .withPassword('test_pw')
    .start();
  const pool = new Pool({
    host: container.getHost(),
    port: container.getPort(),
    database: 'gap_db',
    user: 'gap_user',
    password: 'test_pw',
  });
  return { container, pool };
}

const columnsOf = async (pool) =>
  (
    await pool.query(
      `SELECT table_name || '.' || column_name
                || ':' || udt_name
                || '(' || COALESCE(character_maximum_length::text, numeric_precision::text, '-') || ')'
                || ' null=' || is_nullable
                || ' default=' || COALESCE(column_default, '-') AS sig
       FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1`
    )
  ).rows.map((r) => r.sig);

/** Unique/primary-key/foreign-key constraints, so "indistinguishable" means it. */
const constraintsOf = async (pool) =>
  (
    await pool.query(
      `SELECT tc.table_name || ':' || tc.constraint_type || ':' ||
              COALESCE(string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position), '-') AS sig
       FROM information_schema.table_constraints tc
       LEFT JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       WHERE tc.table_schema = 'public' AND tc.constraint_type <> 'CHECK'
       GROUP BY tc.table_name, tc.constraint_type, tc.constraint_name
       ORDER BY 1`
    )
  ).rows.map((r) => r.sig);

const indexesOf = async (pool) =>
  (await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`)).rows.map(
    (r) => r.indexname
  );

describe('Legacy database upgrade', () => {
  jest.setTimeout(180000);

  let legacy;
  let fresh;

  beforeAll(async () => {
    [legacy, fresh] = await Promise.all([startDatabase(), startDatabase()]);
    await legacy.pool.query(LEGACY_SCHEMA);
  });

  afterAll(async () => {
    await Promise.all(
      [legacy, fresh].filter(Boolean).map(async (db) => {
        await db.pool.end();
        await db.container.stop();
      })
    );
  });

  it('upgrades a pre-UUID legacy database without failing', async () => {
    await expect(upgrade(legacy.pool)).resolves.not.toThrow();
  });

  it('converts integer ids to UUID and keeps every account', async () => {
    const idType = (
      await legacy.pool.query(
        `SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'`
      )
    ).rows[0].data_type;
    expect(idType).toBe('uuid');

    const { rows } = await legacy.pool.query(
      `SELECT username FROM users WHERE username LIKE 'legacy%' ORDER BY username`
    );
    expect(rows.map((r) => r.username)).toEqual(['legacyadmin', 'legacystu', 'legacytm']);
  });

  // Migration 001 renames team_manager; createSQL must not have already taken
  // that name, or the rename collides on roles_name_key.
  it('renames team_manager to assignment_manager without duplicating the role', async () => {
    const { rows } = await legacy.pool.query('SELECT name FROM roles ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(['admin', 'assignment_manager', 'user']);

    const managed = await legacy.pool.query(
      `SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = 'legacytm'`
    );
    expect(managed.rows[0].name).toBe('assignment_manager');
  });

  it('creates the hierarchy tables and drops the legacy group column', async () => {
    const { rows } = await legacy.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('subjects', 'assignments', 'user_subjects', 'user_groups', 'assignment_managers')
       ORDER BY table_name`
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'assignment_managers',
      'assignments',
      'subjects',
      'user_groups',
      'user_subjects',
    ]);

    const legacyColumn = await legacy.pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'group_id'`
    );
    expect(legacyColumn.rows).toHaveLength(0);
  });

  // A migrated database and a brand-new one must be indistinguishable, or
  // behaviour silently diverges between upgraded and fresh deployments.
  it('converges to the same columns and indexes as a fresh install', async () => {
    await upgrade(fresh.pool);

    const [freshColumns, legacyColumns] = await Promise.all([columnsOf(fresh.pool), columnsOf(legacy.pool)]);
    // The legacy fixture carries no extra columns of its own, so these match exactly.
    expect(legacyColumns).toEqual(freshColumns);

    const [freshIndexes, legacyIndexes] = await Promise.all([indexesOf(fresh.pool), indexesOf(legacy.pool)]);
    expect(legacyIndexes).toEqual(freshIndexes);

    const [freshConstraints, legacyConstraints] = await Promise.all([
      constraintsOf(fresh.pool),
      constraintsOf(legacy.pool),
    ]);
    expect(legacyConstraints.sort()).toEqual(freshConstraints.sort());
  });

  // A width that survived the upgrade but not the fresh install would silently
  // reject values the product accepts. data_type alone cannot see that.
  it('keeps the shipped column widths after upgrading', async () => {
    const { rows } = await legacy.pool.query(
      `SELECT column_name, character_maximum_length AS len
       FROM information_schema.columns
       WHERE table_name = 'users' AND column_name IN ('username', 'email', 'student_id')
       ORDER BY column_name`
    );
    expect(rows).toEqual([
      { column_name: 'email', len: 255 },
      { column_name: 'student_id', len: 50 },
      { column_name: 'username', len: 100 },
    ]);
  });

  it('is idempotent when createSQL is applied a second time', async () => {
    const before = await columnsOf(legacy.pool);
    await expect(legacy.pool.query(createSQL)).resolves.toBeDefined();
    expect(await columnsOf(legacy.pool)).toEqual(before);
  });
});
