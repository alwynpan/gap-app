'use strict';

/**
 * Database helpers for integration tests.
 * Provides truncation utilities and direct-INSERT factories for the
 * subject → assignment → group hierarchy to keep tests isolated.
 */

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    // Suppress unhandled error events that occur when the testcontainer is
    // stopped and terminates idle client connections.
    pool.on('error', () => {});
  }
  return pool;
}

/**
 * Deletes test data in FK-safe order, preserving seed data (roles, admin user).
 * Call in beforeEach to guarantee a clean state between tests.
 */
async function cleanDatabase() {
  const db = getPool();
  await db.query(`
    DELETE FROM password_reset_tokens WHERE TRUE;
    DELETE FROM user_groups WHERE TRUE;
    DELETE FROM assignment_managers WHERE TRUE;
    DELETE FROM user_subjects WHERE TRUE;
    DELETE FROM users WHERE username != 'admin';
    DELETE FROM groups WHERE TRUE;
    DELETE FROM assignments WHERE TRUE;
    DELETE FROM subjects WHERE TRUE;
    DELETE FROM config WHERE TRUE;
  `);
}

/**
 * Create a user directly in the DB for test setup (bypasses email flow).
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
     RETURNING id, username, email, first_name, last_name, student_id, enabled, status`,
    [username, email, hash, firstName, lastName, studentId, role, enabled]
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
 * Create an assignment directly in the DB.
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
 * Create a group directly in the DB (requires a parent assignment).
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
 * Enrol a user in a subject directly in the DB.
 */
async function addUserToSubject(userId, subjectId) {
  const db = getPool();
  const { rows } = await db.query('INSERT INTO user_subjects (user_id, subject_id) VALUES ($1, $2) RETURNING *', [
    userId,
    subjectId,
  ]);
  return rows[0];
}

/**
 * Make a user the manager of an assignment directly in the DB.
 */
async function assignManager(userId, assignmentId) {
  const db = getPool();
  const { rows } = await db.query(
    'INSERT INTO assignment_managers (user_id, assignment_id) VALUES ($1, $2) RETURNING *',
    [userId, assignmentId]
  );
  return rows[0];
}

/**
 * Place a user in a group for an assignment directly in the DB
 * (bypasses the application-layer subject-membership/capacity checks).
 */
async function addUserToGroup(userId, groupId, assignmentId) {
  const db = getPool();
  const { rows } = await db.query(
    'INSERT INTO user_groups (user_id, group_id, assignment_id) VALUES ($1, $2, $3) RETURNING *',
    [userId, groupId, assignmentId]
  );
  return rows[0];
}

/**
 * Obtain a JWT token by logging in via the app.
 */
async function loginAs(app, username, password) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  const body = JSON.parse(res.body);
  return body.token;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  cleanDatabase,
  createUser,
  createSubject,
  createAssignment,
  createGroup,
  addUserToSubject,
  assignManager,
  addUserToGroup,
  loginAs,
  closePool,
  getPool,
};
