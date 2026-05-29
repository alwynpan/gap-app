'use strict';

const { buildTestServer, closeTestServer } = require('./helpers/server');
const { cleanDatabase, createUser, loginAs, getPool } = require('./helpers/db');
const config = require('../../src/config/index');

let app;
let adminToken;

beforeAll(async () => {
  app = await buildTestServer();
  adminToken = await loginAs(app, 'admin', 'AdminPass123!');
});

afterAll(async () => {
  await closeTestServer(app);
});

beforeEach(async () => {
  await cleanDatabase();
  // Re-obtain admin token after clean (admin user is preserved by cleanDatabase)
  adminToken = await loginAs(app, 'admin', 'AdminPass123!');
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  it('returns 200 and token for valid admin credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'AdminPass123!' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe('admin');
    expect(body.user.role).toBe('admin');
  });

  it('returns 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrongpass' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Invalid credentials');
  });

  it('returns 401 for unknown username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'pass' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for missing username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'pass' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for disabled user', async () => {
    await createUser({ username: 'disableduser', email: 'disabled@test.com', enabled: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'disableduser', password: 'TestPass123!' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/disabled/i);
  });

  it('returns 401 for pending user (no password set)', async () => {
    // Create user via API so they're pending
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'pendinguser',
        email: 'pending@test.com',
        firstName: 'P',
        lastName: 'User',
        sendSetupEmail: false,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'pendinguser', password: 'anything' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/pending/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
describe('POST /api/auth/register', () => {
  it('returns 201 and creates a pending user when registration is enabled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'newstudent',
        email: 'newstudent@test.com',
        firstName: 'New',
        lastName: 'Student',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe('newstudent');
  });

  it('returns 409 when username already exists', async () => {
    await createUser({ username: 'existing', email: 'existing@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'existing', email: 'other@test.com', firstName: 'A', lastName: 'B' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 409 when email already exists', async () => {
    await createUser({ username: 'userA', email: 'taken@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'userB', email: 'taken@test.com', firstName: 'A', lastName: 'B' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 403 when attempting to register as admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'hacker', email: 'h@test.com', firstName: 'H', lastName: 'K', role: 'admin' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'noname' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when registration is disabled', async () => {
    const original = config.app.registrationEnabled;
    config.app.registrationEnabled = false;
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username: 'blocked', email: 'blocked@test.com', firstName: 'B', lastName: 'L' },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toMatch(/disabled/i);
    } finally {
      config.app.registrationEnabled = original;
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout', () => {
  it('returns 200 always (stateless JWT — server-side logout is a no-op)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toMatch(/logout/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  it('returns current user for valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe('admin');
    expect(body.user).not.toHaveProperty('password_hash');
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer invalid.token.here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when JWT belongs to a deleted user', async () => {
    const u = await createUser({ username: 'todelete', email: 'todelete@test.com' });
    const token = await loginAs(app, 'todelete', 'TestPass123!');

    // Delete the user via admin
    await app.inject({
      method: 'DELETE',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Token is still valid JWT, but user no longer exists in DB
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/config
// ---------------------------------------------------------------------------
describe('GET /api/auth/config', () => {
  it('returns registrationEnabled flag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('registrationEnabled');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
describe('POST /api/auth/forgot-password', () => {
  it('returns 200 even for unknown email (prevents enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'nobody@test.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toMatch(/sent/i);
  });

  it('returns 200 for known email (silently creates token)', async () => {
    await createUser({ username: 'resetuser', email: 'reset@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'reset@test.com' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates a setup-type token (not reset) for a pending user', async () => {
    // Create a pending user via the API (sendSetupEmail:false → no token yet, status pending)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'pendingforgot',
        email: 'pendingforgot@test.com',
        firstName: 'Pending',
        lastName: 'Forgot',
        sendSetupEmail: false,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const userId = JSON.parse(createRes.body).user.id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'pendingforgot@test.com' },
    });
    expect(res.statusCode).toBe(200);

    // A single setup-type token should now exist for the pending user
    const db = getPool();
    const { rows } = await db.query('SELECT token_type FROM password_reset_tokens WHERE user_id = $1', [userId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_type).toBe('setup');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/set-password
// ---------------------------------------------------------------------------
describe('POST /api/auth/set-password', () => {
  it('returns 400 for invalid/missing token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token: 'bad-token', password: 'NewPass123!' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid/i);
  });

  it('returns 400 for missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token: 'sometoken' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('full e2e: register → set-password → login', async () => {
    // Enable registration
    await app.inject({
      method: 'PUT',
      url: '/api/config/registration_enabled',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });

    // Register a pending user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'e2euser', email: 'e2e@test.com', firstName: 'E2E', lastName: 'User' },
    });
    expect(regRes.statusCode).toBe(201);

    // Get user id and create a setup token via model (since email delivery is mocked)
    const db = getPool();
    const { rows } = await db.query('SELECT id FROM users WHERE username = $1', ['e2euser']);
    expect(rows).toHaveLength(1);
    const userId = rows[0].id;
    const PasswordResetToken = require('../../src/models/PasswordResetToken');
    const tokenRow = await PasswordResetToken.create(userId, 'setup');
    const rawToken = tokenRow.token;

    // Set password using the token
    const setRes = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token: rawToken, password: 'SecurePass123!' },
    });
    expect(setRes.statusCode).toBe(200);

    // Login with the new password
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'e2euser', password: 'SecurePass123!' },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.token).toBeDefined();
    expect(loginBody.user.username).toBe('e2euser');
  });

  it('rejects a token that has already been used', async () => {
    const db = getPool();
    const PasswordResetToken = require('../../src/models/PasswordResetToken');

    // Create a user and a setup token
    await createUser({ username: 'reuse_user', email: 'reuse@test.com', password: 'OldPass123!' });
    const { rows } = await db.query('SELECT id FROM users WHERE username = $1', ['reuse_user']);
    expect(rows).toHaveLength(1);
    const tokenRow = await PasswordResetToken.create(rows[0].id, 'setup');

    // First use — should succeed
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token: tokenRow.token, password: 'NewPass123!' },
    });
    expect(first.statusCode).toBe(200);

    // Second use — same token should be rejected
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token: tokenRow.token, password: 'AnotherPass1!' },
    });
    expect(second.statusCode).toBe(400);
    expect(JSON.parse(second.body).error).toMatch(/invalid|expired/i);
  });

  it('resets password for an active user with a reset-type token', async () => {
    const db = getPool();
    const PasswordResetToken = require('../../src/models/PasswordResetToken');

    // Create an already-active user
    await createUser({ username: 'reset_user', email: 'reset@test.com', password: 'OldPass123!' });
    const { rows } = await db.query('SELECT id FROM users WHERE username = $1', ['reset_user']);
    expect(rows).toHaveLength(1);
    const tokenRow = await PasswordResetToken.create(rows[0].id, 'reset');

    // Set password using a reset-type token
    const setRes = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { token: tokenRow.token, password: 'ResetPass123!' },
    });
    expect(setRes.statusCode).toBe(200);

    // Verify login with new password works
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'reset_user', password: 'ResetPass123!' },
    });
    expect(loginRes.statusCode).toBe(200);

    // Verify old password no longer works
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'reset_user', password: 'OldPass123!' },
    });
    expect(oldLogin.statusCode).toBe(401);
  });
});
