'use strict';

/**
 * Direct database helpers for e2e test setup and cleanup.
 * Reads connection config from the state file written by global-setup.js.
 *
 * Hierarchy: subjects → assignments → groups. Users enrol in subjects
 * (user_subjects); group membership is per assignment (user_groups).
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
    pool.on('error', (err) => {
      console.error('[e2e] Unexpected pg pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Run an arbitrary parameterised query against the e2e database.
 * Used by specs that need to assert DB state directly (e.g. cascade deletes).
 */
async function query(text, params = []) {
  const db = getPool();
  const result = await db.query(text, params);
  return result.rows;
}

/**
 * Deletes test data in FK-safe order, preserving the seeded admin user.
 * Call in beforeEach to guarantee a clean slate between tests.
 */
async function cleanDatabase() {
  const db = getPool();
  await db.query(`
    DELETE FROM password_reset_tokens WHERE TRUE;
    DELETE FROM user_groups WHERE TRUE;
    DELETE FROM assignment_managers WHERE TRUE;
    DELETE FROM user_subjects WHERE TRUE;
    DELETE FROM users WHERE LOWER(username) != 'admin';
    DELETE FROM groups WHERE TRUE;
    DELETE FROM assignments WHERE TRUE;
    DELETE FROM subjects WHERE TRUE;
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

  const roleRow = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
  if (!roleRow.rows[0]) {
    throw new Error(`createUser: unknown role "${role}"`);
  }

  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, first_name, last_name, student_id, role_id, enabled, status)
     VALUES ($1, $2, $3, $4, $5, $6,
             $7, $8, 'active')
     RETURNING id, username, email, first_name, last_name, student_id, enabled`,
    [username, email, hash, firstName, lastName, studentId, roleRow.rows[0].id, enabled]
  );
  return { ...rows[0], password };
}

/**
 * Create a subject directly in the DB.
 */
async function createSubject({ name }) {
  const db = getPool();
  const { rows } = await db.query('INSERT INTO subjects (name) VALUES ($1) RETURNING *', [name]);
  return rows[0];
}

/**
 * Create an assignment under a subject directly in the DB.
 */
async function createAssignment({ subjectId, name }) {
  const db = getPool();
  const { rows } = await db.query('INSERT INTO assignments (subject_id, name) VALUES ($1, $2) RETURNING *', [
    subjectId,
    name,
  ]);
  return rows[0];
}

/**
 * Enrol a user in a subject (idempotent).
 * `enabled` seeds the per-subject suspension flag (false = suspended).
 */
async function addUserToSubject(userId, subjectId, enabled = true) {
  const db = getPool();
  const { rows } = await db.query(
    `INSERT INTO user_subjects (user_id, subject_id, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, subject_id) DO NOTHING
     RETURNING *`,
    [userId, subjectId, enabled]
  );
  return rows[0] || null;
}

/**
 * Make a user a manager of an assignment (idempotent).
 */
async function assignManager(userId, assignmentId) {
  const db = getPool();
  const { rows } = await db.query(
    `INSERT INTO assignment_managers (user_id, assignment_id) VALUES ($1, $2)
     ON CONFLICT (user_id, assignment_id) DO NOTHING
     RETURNING *`,
    [userId, assignmentId]
  );
  return rows[0] || null;
}

/**
 * Create a group under an assignment directly in the DB.
 */
async function createGroup({ assignmentId, name, enabled = true, maxMembers = null }) {
  const db = getPool();
  const { rows } = await db.query(
    'INSERT INTO groups (assignment_id, name, enabled, max_members) VALUES ($1, $2, $3, $4) RETURNING *',
    [assignmentId, name, enabled, maxMembers]
  );
  return rows[0];
}

/**
 * Composite fixture: one subject with one assignment and optional groups.
 * `groups` is an array of group specs ({ name, enabled?, maxMembers? }).
 * Returns { subject, assignment, groups }.
 */
async function createHierarchy({ subjectName = 'Subject 1', assignmentName = 'Assignment 1', groups = [] } = {}) {
  const subject = await createSubject({ name: subjectName });
  const assignment = await createAssignment({ subjectId: subject.id, name: assignmentName });
  const createdGroups = [];
  for (const groupSpec of groups) {
    createdGroups.push(await createGroup({ assignmentId: assignment.id, ...groupSpec }));
  }
  return { subject, assignment, groups: createdGroups };
}

/**
 * Assign a user (by username, case-insensitive) to a group directly in the DB.
 * Replaces any existing membership for the group's assignment and enrols the
 * user in the parent subject as ACTIVE, so the fixture satisfies the universal
 * subject-membership rule enforced by the backend. An already-suspended
 * membership is re-enabled — a suspended member holding a group is a state the
 * backend forbids, so seeding one would test nothing real.
 */
async function assignUserToGroup(username, groupId) {
  const db = getPool();

  const userResult = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  const user = userResult.rows[0];
  if (!user) {
    throw new Error(`assignUserToGroup: no user found for username ${username}`);
  }

  const groupResult = await db.query(
    `SELECT g.id, g.assignment_id, a.subject_id
     FROM groups g
     JOIN assignments a ON a.id = g.assignment_id
     WHERE g.id = $1`,
    [groupId]
  );
  const group = groupResult.rows[0];
  if (!group) {
    throw new Error(`assignUserToGroup: no group found for id ${groupId}`);
  }

  await db.query(
    `INSERT INTO user_subjects (user_id, subject_id, enabled) VALUES ($1, $2, true)
     ON CONFLICT (user_id, subject_id) DO UPDATE SET enabled = true`,
    [user.id, group.subject_id]
  );
  await db.query('DELETE FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [user.id, group.assignment_id]);
  await db.query('INSERT INTO user_groups (user_id, assignment_id, group_id) VALUES ($1, $2, $3)', [
    user.id,
    group.assignment_id,
    group.id,
  ]);
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
  const result = await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, token_type, expires_at)
     SELECT id, $1, $2, $3 FROM users WHERE LOWER(email) = LOWER($4)`,
    [tokenHash, tokenType, expiresAt, userEmail]
  );
  if (result.rowCount !== 1) {
    throw new Error(`createPasswordResetToken: no user found for email ${userEmail}`);
  }
  return rawToken;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  query,
  cleanDatabase,
  createUser,
  createSubject,
  createAssignment,
  addUserToSubject,
  assignManager,
  createGroup,
  createHierarchy,
  assignUserToGroup,
  createPasswordResetToken,
  closePool,
};
