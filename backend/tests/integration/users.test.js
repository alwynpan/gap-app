'use strict';

const { buildTestServer, closeTestServer } = require('./helpers/server');
const { cleanDatabase, createUser, createGroup, loginAs } = require('./helpers/db');

let app;
let adminToken;
let amToken; // assignment_manager token
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

  // Seed a fresh assignment_manager and regular user for each test
  await createUser({ username: 'am1', email: 'am1@test.com', role: 'assignment_manager' });
  amToken = await loginAs(app, 'am1', 'TestPass123!');

  await createUser({ username: 'user1', email: 'user1@test.com', role: 'user' });
  userToken = await loginAs(app, 'user1', 'TestPass123!');
});

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
describe('GET /api/users', () => {
  it('admin can list all users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThanOrEqual(1);
  });

  it('assignment_manager can list users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('regular user cannot list all users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });

  it('filters by role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users.every((u) => u.role_name === 'admin')).toBe(true);
  });

  it('returns 400 for invalid role filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=superadmin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('filters by status=active', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?status=active',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users.every((u) => u.status === 'active')).toBe(true);
  });

  it('filters by combined role + status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?role=user&status=active',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users.every((u) => u.role_name === 'user' && u.status === 'active')).toBe(true);
    expect(body.users.length).toBeGreaterThan(0);
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?status=unknown',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------
describe('GET /api/users/:id', () => {
  it('admin can get any user', async () => {
    const u = await createUser({ username: 'target', email: 'target@test.com' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.username).toBe('target');
  });

  it('user can get their own profile', async () => {
    // Get the user1 id
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const users = JSON.parse(listRes.body).users;
    const user1 = users.find((u) => u.username === 'user1');

    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${user1.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('user cannot get another user profile', async () => {
    const other = await createUser({ username: 'other', email: 'other@test.com' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${other.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('password_hash is not exposed in response', async () => {
    const u = await createUser({ username: 'safe', email: 'safe@test.com' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.user).not.toHaveProperty('password_hash');
  });
});

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------
describe('POST /api/users', () => {
  it('admin creates user with role=user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'newuser',
        email: 'new@test.com',
        firstName: 'New',
        lastName: 'User',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe('newuser');
    expect(body.user.status).toBe('pending');
  });

  it('admin creates assignment_manager', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'newam',
        email: 'newam@test.com',
        firstName: 'AM',
        lastName: 'User',
        role: 'assignment_manager',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('assignment_manager cannot create admin user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        username: 'badAdmin',
        email: 'bad@test.com',
        firstName: 'B',
        lastName: 'A',
        role: 'admin',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('regular user cannot create users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { username: 'x', email: 'x@test.com', firstName: 'X', lastName: 'Y', sendSetupEmail: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 for duplicate username', async () => {
    await createUser({ username: 'dup', email: 'dup@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'dup', email: 'other@test.com', firstName: 'D', lastName: 'U', sendSetupEmail: false },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 409 for duplicate email', async () => {
    await createUser({ username: 'uniqueuser', email: 'shared@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'anotheruser',
        email: 'shared@test.com',
        firstName: 'A',
        lastName: 'B',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 404 when specified group does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'withgroup',
        email: 'withgroup@test.com',
        firstName: 'W',
        lastName: 'G',
        groupId: '00000000-0000-0000-0000-000000000000',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when group is full', async () => {
    const group = await createGroup({ name: 'FullGroup', maxMembers: 1 });
    await createUser({ username: 'member1', email: 'member1@test.com' });

    // Assign member1 to group
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const member1 = JSON.parse(listRes.body).users.find((u) => u.username === 'member1');
    await app.inject({
      method: 'PUT',
      url: `/api/users/${member1.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { groupId: group.id },
    });

    // Now try to create another user in the same full group
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'member2',
        email: 'member2@test.com',
        firstName: 'M',
        lastName: '2',
        groupId: group.id,
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/full/i);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id', () => {
  it('admin updates user email', async () => {
    const u = await createUser({ username: 'editme', email: 'editme@test.com' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'updated@test.com', firstName: 'Edit', lastName: 'Me' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.email).toBe('updated@test.com');
  });

  it('admin can disable a user', async () => {
    const u = await createUser({ username: 'disableme', email: 'disable@test.com' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: u.email, firstName: 'D', lastName: 'U', enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.enabled).toBe(false);
  });

  it('cannot disable the built-in admin account', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminUser = JSON.parse(listRes.body).users.find((u) => u.username === 'admin');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${adminUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: adminUser.email, firstName: 'Admin', lastName: 'User', enabled: false },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/admin/i);
  });

  it('assignment_manager cannot edit admin user', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminUser = JSON.parse(listRes.body).users.find((u) => u.username === 'admin');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${adminUser.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { email: 'newadmin@test.com', firstName: 'Admin', lastName: 'User' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('user can edit their own non-role fields', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const user1 = JSON.parse(listRes.body).users.find((u) => u.username === 'user1');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { email: 'user1updated@test.com', firstName: 'Updated', lastName: 'Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.email).toBe('user1updated@test.com');
  });

  it('prevents username change', async () => {
    const u = await createUser({ username: 'fixedname', email: 'fixed@test.com' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'newname', email: u.email, firstName: 'F', lastName: 'N' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/username/i);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id/group
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id/group', () => {
  it('admin assigns user to group', async () => {
    const u = await createUser({ username: 'groupable', email: 'groupable@test.com' });
    const g = await createGroup({ name: 'TestGroup' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { groupId: g.id },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.groupId).toBe(g.id);
  });

  it('admin removes user from group by setting groupId to null', async () => {
    const u = await createUser({ username: 'removable', email: 'removable@test.com' });
    const g = await createGroup({ name: 'RemovableGroup' });
    await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { groupId: g.id },
    });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { groupId: null },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when groupId is missing from body', async () => {
    const u = await createUser({ username: 'nogroup', email: 'nogroup@test.com' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('regular user cannot update group assignment', async () => {
    const u = await createUser({ username: 'victim', email: 'victim@test.com' });
    const g = await createGroup({ name: 'VictimGroup' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}/group`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { groupId: g.id },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id/password
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id/password', () => {
  it('user can change their own password', async () => {
    // Get user1 id
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const user1 = JSON.parse(listRes.body).users.find((u) => u.username === 'user1');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'TestPass123!', newPassword: 'NewPass456!' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for wrong current password', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const user1 = JSON.parse(listRes.body).users.find((u) => u.username === 'user1');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'WrongPass!', newPassword: 'NewPass456!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for too-short new password', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const user1 = JSON.parse(listRes.body).users.find((u) => u.username === 'user1');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'TestPass123!', newPassword: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('user cannot change another user password', async () => {
    const other = await createUser({ username: 'otherpass', email: 'otherpass@test.com' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${other.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'TestPass123!', newPassword: 'NewPass456!' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/users/:id', () => {
  it('admin deletes a user', async () => {
    const u = await createUser({ username: 'deleteme', email: 'deleteme@test.com' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('admin cannot delete their own account', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminUser = JSON.parse(listRes.body).users.find((u) => u.username === 'admin');
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${adminUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/own account/i);
  });

  it('regular user cannot delete users', async () => {
    const u = await createUser({ username: 'protected', email: 'protected@test.com' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/bulk
// ---------------------------------------------------------------------------
describe('DELETE /api/users/bulk', () => {
  it('admin bulk deletes users', async () => {
    const u1 = await createUser({ username: 'bulk1', email: 'bulk1@test.com' });
    const u2 = await createUser({ username: 'bulk2', email: 'bulk2@test.com' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [u1.id, u2.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(2);
  });

  it('returns 400 for empty ids array', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when ids contain invalid UUIDs', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: ['not-a-uuid'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when admin id is in the list', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminUser = JSON.parse(listRes.body).users.find((u) => u.username === 'admin');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [adminUser.id] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/import
// ---------------------------------------------------------------------------
describe('POST /api/users/import', () => {
  it('admin imports new users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [
          { username: 'imp1', email: 'imp1@test.com', firstName: 'Imp', lastName: 'One' },
          { username: 'imp2', email: 'imp2@test.com', firstName: 'Imp', lastName: 'Two' },
        ],
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.errors).toHaveLength(0);
  });

  it('skips existing users when conflictAction=skip', async () => {
    await createUser({ username: 'existing', email: 'existing@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'existing', email: 'existing@test.com', firstName: 'E', lastName: 'X' }],
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skipped).toBe(1);
    expect(body.imported).toBe(0);
  });

  it('overwrites existing users when conflictAction=overwrite', async () => {
    await createUser({ username: 'overwriteuser', email: 'overwrite@test.com', firstName: 'Old', lastName: 'Name' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'overwriteuser', email: 'overwrite@test.com', firstName: 'New', lastName: 'Name' }],
        conflictAction: 'overwrite',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).imported).toBe(1);
  });

  it('cannot overwrite admin account via import', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'admin', email: 'admin@test.com', firstName: 'H', lastName: 'K' }],
        conflictAction: 'overwrite',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.errors[0].reason).toMatch(/admin/i);
  });

  it('AM importing skips admin/AM accounts on overwrite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        users: [
          { username: 'admin', email: 'admin@test.com', firstName: 'H', lastName: 'K' },
          { username: 'am1', email: 'am1@test.com', firstName: 'A', lastName: 'M' },
          { username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' },
        ],
        conflictAction: 'overwrite',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(1);
    expect(body.errors.length).toBeGreaterThanOrEqual(2);
    expect(body.errors.some((e) => e.reason.match(/admin|assignment manager/i))).toBe(true);
  });

  it('returns 400 for empty users array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { users: [], conflictAction: 'skip', sendSetupEmail: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('assignment_manager can import users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        users: [{ username: 'amimp1', email: 'amimp1@test.com', firstName: 'AM', lastName: 'Imp' }],
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(1);
  });

  it('regular user cannot import', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        users: [{ username: 'x', email: 'x@test.com', firstName: 'X', lastName: 'Y' }],
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
