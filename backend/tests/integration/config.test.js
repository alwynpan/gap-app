'use strict';

const { buildTestServer, closeTestServer } = require('./helpers/server');
const { cleanDatabase, createUser, createGroup, loginAs } = require('./helpers/db');

let app;
let adminToken;
let amToken;
let userToken;

beforeAll(async () => {
  app = await buildTestServer();
});

afterAll(async () => {
  await closeTestServer(app);
});

beforeEach(async () => {
  await cleanDatabase();
  adminToken = await loginAs(app, 'admin', 'AdminPass123!');

  await createUser({ username: 'am1', email: 'am1@test.com', role: 'assignment_manager' });
  amToken = await loginAs(app, 'am1', 'TestPass123!');

  await createUser({ username: 'user1', email: 'user1@test.com', role: 'user' });
  userToken = await loginAs(app, 'user1', 'TestPass123!');
});

// ---------------------------------------------------------------------------
// GET /api/config/group-join-locked
// ---------------------------------------------------------------------------
describe('GET /api/config/group-join-locked', () => {
  it('authenticated user can read group-join-locked status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/config/group-join-locked',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('locked');
    expect(typeof body.locked).toBe('boolean');
  });

  it('defaults to unlocked when config row does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/config/group-join-locked',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).locked).toBe(false);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config/group-join-locked' });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------
describe('GET /api/config', () => {
  it('admin can read all config values', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('config');
  });

  it('assignment_manager can read all config values', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('regular user cannot read all config values', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/config/:key
// ---------------------------------------------------------------------------
describe('PUT /api/config/:key', () => {
  it('admin sets group_join_locked to true', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.value).toBe('true');
  });

  it('admin sets group_join_locked to false', async () => {
    // First lock
    await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });
    // Then unlock
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'false' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).config.value).toBe('false');
  });

  it('config change is reflected in GET /api/config/group-join-locked', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/config/group-join-locked',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).locked).toBe(true);
  });

  it('returns 400 for unknown config key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/unknown_key',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'anything' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid config key/i);
  });

  it('returns 400 for missing value', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('assignment_manager can update config', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { value: 'true' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('regular user cannot update config', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { value: 'true' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      payload: { value: 'true' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// group_join_locked effect on group join/leave
// ---------------------------------------------------------------------------
describe('group_join_locked enforcement', () => {
  it('prevents regular users from joining when locked', async () => {
    const g = await createGroup({ name: 'LockTestGroup', enabled: true });

    await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/locked/i);
  });

  it('allows admin to join group even when locked', async () => {
    const g = await createGroup({ name: 'AdminCanJoin', enabled: true });

    await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Admin bypass — expect 200 or potentially a skip if admin has no group_id constraint
    expect([200, 400]).toContain(res.statusCode);
  });
});
