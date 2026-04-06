'use strict';

/**
 * Direct database helpers for e2e test setup and cleanup.
 * Reads connection config from the state file written by global-setup.js.
 */

const { Pool } = require('pg');
const path = require('path');
const os = require('os');
const fs = require('fs');

const STATE_FILE = path.join(os.tmpdir(), 'gap-e2e-state.json');

let pool;

function getPool() {
  if (!pool) {
    if (!fs.existsSync(STATE_FILE)) {
      throw new Error('E2E state file not found. Ensure globalSetup ran successfully.');
    }
    const { dbConfig } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    pool = new Pool(dbConfig);
    pool.on('error', () => {});
  }
  return pool;
}

/**
 * Truncates test data, preserving the seeded admin user.
 * Call in beforeEach to guarantee a clean slate between tests.
 */
async function cleanDatabase() {
  const db = getPool();
  await db.query(`
    DELETE FROM password_reset_tokens WHERE TRUE;
    DELETE FROM users WHERE LOWER(username) != 'admin';
    DELETE FROM groups WHERE TRUE;
    DELETE FROM config WHERE TRUE;
  `);
}

/**
 * Create a user directly in the DB (bypasses the email setup flow).
 */
async function createUser({
  username,
  email,
  password = 'TestPass123!',
  role = 'user',
  firstName = 'Test',
  lastName = 'User',
  studentId = null,
  enabled = true,
}) {
  const bcrypt = require('bcryptjs');
  const db = getPool();
  const hash = await bcrypt.hash(password, 4);

  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, first_name, last_name, student_id, role_id, enabled, status)
     VALUES ($1, $2, $3, $4, $5, $6,
             (SELECT id FROM roles WHERE name = $7),
             $8, 'active')
     RETURNING id, username, email, first_name, last_name, student_id, enabled`,
    [username, email, hash, firstName, lastName, studentId, role, enabled]
  );
  return { ...rows[0], password };
}

/**
 * Create a group directly in the DB.
 */
async function createGroup({ name, enabled = true, maxMembers = null }) {
  const db = getPool();
  const { rows } = await db.query(
    'INSERT INTO groups (name, enabled, max_members) VALUES ($1, $2, $3) RETURNING *',
    [name, enabled, maxMembers]
  );
  return rows[0];
}

/**
 * Assign a user to a group directly in the DB.
 */
async function assignUserToGroup(username, groupId) {
  const db = getPool();
  await db.query('UPDATE users SET group_id = $1 WHERE LOWER(username) = LOWER($2)', [groupId, username]);
}

/**
 * Insert a password_reset_token row for a user identified by email.
 * Returns the token string so tests can construct the reset URL.
 */
async function createPasswordResetToken(userEmail, options = {}) {
  const crypto = require('crypto');
  const db = getPool();
  const rawToken = options.token || crypto.randomBytes(32).toString('hex');
  // The backend hashes tokens before storing (see PasswordResetToken.create).
  // We must store the same hash so findByToken(rawToken) can find it.
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = options.expiresAt || new Date(Date.now() + 3600 * 1000);
  const tokenType = options.tokenType || 'reset';
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, token_type, expires_at)
     SELECT id, $1, $2, $3 FROM users WHERE LOWER(email) = LOWER($4)`,
    [tokenHash, tokenType, expiresAt, userEmail]
  );
  return rawToken;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { cleanDatabase, createUser, createGroup, assignUserToGroup, createPasswordResetToken, closePool };
