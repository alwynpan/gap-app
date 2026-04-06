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
// GET /api/groups
// ---------------------------------------------------------------------------
describe('GET /api/groups', () => {
  it('authenticated user can list groups', async () => {
    await createGroup({ name: 'Alpha' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/groups',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.groups)).toBe(true);
    expect(body.groups.some((g) => g.name === 'Alpha')).toBe(true);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/groups' });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/groups/enabled
// ---------------------------------------------------------------------------
describe('GET /api/groups/enabled', () => {
  it('returns only enabled groups', async () => {
    await createGroup({ name: 'EnabledGroup', enabled: true });
    await createGroup({ name: 'DisabledGroup', enabled: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/enabled',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.groups.every((g) => g.enabled === true)).toBe(true);
    expect(body.groups.some((g) => g.name === 'DisabledGroup')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/groups/:id
// ---------------------------------------------------------------------------
describe('GET /api/groups/:id', () => {
  it('returns group with member list', async () => {
    const g = await createGroup({ name: 'DetailGroup' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.group.name).toBe('DetailGroup');
    expect(Array.isArray(body.members)).toBe(true);
  });

  it('returns 404 for non-existent group', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/not-a-uuid',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/groups
// ---------------------------------------------------------------------------
describe('POST /api/groups', () => {
  it('admin creates a group', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NewGroup' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.name).toBe('NewGroup');
    expect(body.group.enabled).toBe(true);
  });

  it('admin creates group with maxMembers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'LimitedGroup', maxMembers: 5 },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).group.maxMembers).toBe(5);
  });

  it('admin creates disabled group', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'DisabledAtCreate', enabled: false },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).group.enabled).toBe(false);
  });

  it('returns 409 for duplicate group name', async () => {
    await createGroup({ name: 'DupGroup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'DupGroup' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('assignment_manager cannot create groups', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { name: 'AMGroup' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/groups/bulk
// ---------------------------------------------------------------------------
describe('POST /api/groups/bulk', () => {
  it('admin bulk creates groups', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: [{ name: 'Bulk1' }, { name: 'Bulk2', maxMembers: 10 }, { name: 'Bulk3', enabled: false }],
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.groups).toHaveLength(3);
  });

  it('returns 400 for empty array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: [],
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for duplicate names within the batch', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: [{ name: 'DupBulk' }, { name: 'DupBulk' }],
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/duplicate/i);
  });

  it('returns 409 when a name conflicts with an existing group', async () => {
    await createGroup({ name: 'ExistingGroup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: [{ name: 'ExistingGroup' }, { name: 'NewOne' }],
    });
    expect(res.statusCode).toBe(409);
  });

  it('regular user cannot bulk create groups', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${userToken}` },
      payload: [{ name: 'UserGroup' }],
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/groups/:id
// ---------------------------------------------------------------------------
describe('PUT /api/groups/:id', () => {
  it('admin updates group name', async () => {
    const g = await createGroup({ name: 'OldName' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NewName', enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).group.name).toBe('NewName');
  });

  it('admin disables a group', async () => {
    const g = await createGroup({ name: 'Disableable' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Disableable', enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).group.enabled).toBe(false);
  });

  it('returns 400 when maxMembers is less than current member count', async () => {
    const g = await createGroup({ name: 'ShrinkGroup', maxMembers: 5 });
    // Add 3 members directly
    for (let i = 0; i < 3; i++) {
      const u = await createUser({ username: `shrink${i}`, email: `shrink${i}@test.com` });
      await app.inject({
        method: 'PUT',
        url: `/api/users/${u.id}/group`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { groupId: g.id },
      });
    }
    const res = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'ShrinkGroup', enabled: true, maxMembers: 2 },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/members/i);
  });

  it('returns 404 for non-existent group', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/groups/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'X', enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('assignment_manager cannot update groups', async () => {
    const g = await createGroup({ name: 'AMUpdateTarget' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { name: 'Hacked', enabled: true },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/groups/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/groups/:id', () => {
  it('admin deletes a group', async () => {
    const g = await createGroup({ name: 'DeleteMe' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for non-existent group', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('regular user cannot delete groups', async () => {
    const g = await createGroup({ name: 'Protected' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/groups/bulk
// ---------------------------------------------------------------------------
describe('DELETE /api/groups/bulk', () => {
  it('admin bulk deletes groups', async () => {
    const g1 = await createGroup({ name: 'BulkDel1' });
    const g2 = await createGroup({ name: 'BulkDel2' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [g1.id, g2.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(2);
  });

  it('returns 400 for empty ids', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid UUIDs', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: ['not-valid'] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/groups/:id/join
// ---------------------------------------------------------------------------
describe('POST /api/groups/:id/join', () => {
  it('user joins an enabled group', async () => {
    const g = await createGroup({ name: 'Joinable', enabled: true });
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).groupId).toBe(g.id);
  });

  it('returns 400 for disabled group', async () => {
    const g = await createGroup({ name: 'Disabled', enabled: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/disabled/i);
  });

  it('returns 400 when user is already in a group', async () => {
    const g1 = await createGroup({ name: 'FirstGroup' });
    const g2 = await createGroup({ name: 'SecondGroup' });
    // Join first group
    await app.inject({
      method: 'POST',
      url: `/api/groups/${g1.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    // Try to join second group
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g2.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/already in a group/i);
  });

  it('returns 409 when group is at capacity', async () => {
    const g = await createGroup({ name: 'FullGroup', maxMembers: 1 });
    // First user fills the group
    await createUser({ username: 'filler', email: 'filler@test.com' });
    const fToken = await loginAs(app, 'filler', 'TestPass123!');
    await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${fToken}` },
    });

    // user1 tries to join full group
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/full/i);
  });

  it('returns 404 for non-existent group', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/00000000-0000-0000-0000-000000000000/join',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 without token', async () => {
    const g = await createGroup({ name: 'NoAuthGroup' });
    const res = await app.inject({ method: 'POST', url: `/api/groups/${g.id}/join` });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/groups/:id/leave
// ---------------------------------------------------------------------------
describe('POST /api/groups/:id/leave', () => {
  it('user leaves their group', async () => {
    const g = await createGroup({ name: 'LeaveGroup', enabled: true });
    await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/leave`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 when user is not a member of this group', async () => {
    const g = await createGroup({ name: 'NotMemberGroup' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/leave`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/not a member/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/groups/import-mappings
// ---------------------------------------------------------------------------
describe('POST /api/groups/import-mappings', () => {
  it('admin imports user-group mappings', async () => {
    const g = await createGroup({ name: 'MappingGroup', enabled: true });
    await createUser({ username: 'mapuser', email: 'mapuser@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/import-mappings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        rows: [{ email: 'mapuser@test.com', groupName: 'MappingGroup' }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).imported).toBe(1);
  });

  it('skips row when user not found', async () => {
    await createGroup({ name: 'SkipGroup', enabled: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/import-mappings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'ghost@test.com', groupName: 'SkipGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(0);
    expect(body.skipped.some((s) => s.reason === 'User not found')).toBe(true);
  });

  it('skips row when group not found', async () => {
    await createUser({ username: 'orphan', email: 'orphan@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/import-mappings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'orphan@test.com', groupName: 'GhostGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).skipped.some((s) => s.reason === 'Group not found')).toBe(true);
  });

  it('skips admin users in mappings', async () => {
    const g = await createGroup({ name: 'AdminMap' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/import-mappings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'admin@gap.local', groupName: g.name }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(0);
    expect(body.skipped[0].reason).toMatch(/admin/i);
  });

  it('returns 400 for empty rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/import-mappings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('regular user cannot import mappings', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/import-mappings',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { rows: [{ email: 'a@test.com', groupName: 'G' }] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/groups/export-mappings
// ---------------------------------------------------------------------------
describe('GET /api/groups/export-mappings', () => {
  it('admin exports user-group mappings', async () => {
    const g = await createGroup({ name: 'ExportGroup', enabled: true });
    const u = await createUser({ username: 'exportuser', email: 'export@test.com' });
    await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { groupId: g.id },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/export-mappings',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.mappings)).toBe(true);
    expect(body.mappings.some((m) => m.email === 'export@test.com' && m.groupName === 'ExportGroup')).toBe(true);
  });

  it('assignment_manager can export mappings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/export-mappings',
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('regular user cannot export mappings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/groups/export-mappings',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
