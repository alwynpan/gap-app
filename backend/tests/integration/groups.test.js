'use strict';

const { buildTestServer, closeTestServer } = require('./helpers/server');
const {
  cleanDatabase,
  createUser,
  createSubject,
  createAssignment,
  createGroup,
  addUserToSubject,
  assignManager,
  addUserToGroup,
  loginAs,
  getPool,
} = require('./helpers/db');

let app;
let adminToken;
let amToken; // manages `assignment`
let am2Token; // manages nothing
let userToken; // member of `subject`
let am1;
let am2;
let user1;
let subject;
let assignment;

beforeAll(async () => {
  app = await buildTestServer();
});

afterAll(async () => {
  await closeTestServer(app);
});

beforeEach(async () => {
  await cleanDatabase();
  adminToken = await loginAs(app, 'admin', 'AdminPass123!');

  subject = await createSubject({ name: 'BaseSubject' });
  assignment = await createAssignment({ subjectId: subject.id, name: 'A1' });

  am1 = await createUser({ username: 'am1', email: 'am1@test.com', role: 'assignment_manager' });
  await assignManager(am1.id, assignment.id);
  amToken = await loginAs(app, 'am1', 'TestPass123!');

  am2 = await createUser({ username: 'am2', email: 'am2@test.com', role: 'assignment_manager' });
  am2Token = await loginAs(app, 'am2', 'TestPass123!');

  user1 = await createUser({ username: 'user1', email: 'user1@test.com', role: 'user' });
  await addUserToSubject(user1.id, subject.id);
  userToken = await loginAs(app, 'user1', 'TestPass123!');
});

// ---------------------------------------------------------------------------
// GET /api/groups/:id
// ---------------------------------------------------------------------------
describe('GET /api/groups/:id', () => {
  it('subject member gets group with hierarchy info and member list', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'DetailGroup' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.group.name).toBe('DetailGroup');
    expect(body.group.assignmentId).toBe(assignment.id);
    expect(body.group.subjectId).toBe(subject.id);
    expect(Array.isArray(body.members)).toBe(true);
  });

  it('admin and managing AM can view the group', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'StaffGroup' });
    for (const token of [adminToken, amToken]) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/groups/${g.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it('non-member user gets 403', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'PrivateGroup' });
    await createUser({ username: 'outsider', email: 'outsider@test.com' });
    const outsiderToken = await loginAs(app, 'outsider', 'TestPass123!');
    const res = await app.inject({
      method: 'GET',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('non-managing AM (not a subject member) gets 403', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'AMScopedGroup' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${am2Token}` },
    });
    expect(res.statusCode).toBe(403);
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
  it('admin creates a group in an assignment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, name: 'NewGroup' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.name).toBe('NewGroup');
    expect(body.group.enabled).toBe(true);
    expect(body.group.assignmentId).toBe(assignment.id);
  });

  it('admin creates group with maxMembers and disabled state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, name: 'LimitedGroup', maxMembers: 5, enabled: false },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.maxMembers).toBe(5);
    expect(body.group.enabled).toBe(false);
  });

  it('returns 409 for duplicate group name within the assignment', async () => {
    await createGroup({ assignmentId: assignment.id, name: 'DupGroup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, name: 'DupGroup' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('allows the same group name in a different assignment', async () => {
    await createGroup({ assignmentId: assignment.id, name: 'SharedName' });
    const a2 = await createAssignment({ subjectId: subject.id, name: 'A2' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: a2.id, name: 'SharedName' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('managing AM can create a group in their assignment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { assignmentId: assignment.id, name: 'AMGroup' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('AM cannot create a group in an assignment they do not manage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${am2Token}` },
      payload: { assignmentId: assignment.id, name: 'ForbiddenGroup' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('regular user cannot create groups', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { assignmentId: assignment.id, name: 'UserGroup' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for missing name or assignmentId', async () => {
    const noName = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id },
    });
    expect(noName.statusCode).toBe(400);
    const noAssignment = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NoAssignment' },
    });
    expect(noAssignment.statusCode).toBe(400);
  });

  it('returns 404 for unknown assignment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: '00000000-0000-0000-0000-000000000000', name: 'Orphan' },
    });
    expect(res.statusCode).toBe(404);
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
      payload: {
        assignmentId: assignment.id,
        groups: [{ name: 'Bulk1' }, { name: 'Bulk2', maxMembers: 10 }, { name: 'Bulk3', enabled: false }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).groups).toHaveLength(3);
  });

  it('returns 400 for empty groups array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, groups: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for duplicate names within the batch', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, groups: [{ name: 'DupBulk' }, { name: 'dupbulk' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/duplicate/i);
  });

  it('returns 409 when a name conflicts with an existing group', async () => {
    await createGroup({ assignmentId: assignment.id, name: 'ExistingGroup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, groups: [{ name: 'ExistingGroup' }, { name: 'NewOne' }] },
    });
    expect(res.statusCode).toBe(409);
  });

  it('managing AM can bulk create; unmanaged AM gets 403', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { assignmentId: assignment.id, groups: [{ name: 'AMBulk1' }] },
    });
    expect(ok.statusCode).toBe(201);

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${am2Token}` },
      payload: { assignmentId: assignment.id, groups: [{ name: 'AMBulk2' }] },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('regular user cannot bulk create groups', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { assignmentId: assignment.id, groups: [{ name: 'UserBulk' }] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/groups/:id
// ---------------------------------------------------------------------------
describe('PUT /api/groups/:id', () => {
  it('admin updates group name and enabled state', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'OldName' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NewName', enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.group.name).toBe('NewName');
    expect(body.group.enabled).toBe(false);
  });

  it('returns 409 when renaming to an existing name in the assignment', async () => {
    await createGroup({ assignmentId: assignment.id, name: 'TakenName' });
    const g = await createGroup({ assignmentId: assignment.id, name: 'RenameMe' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'TakenName' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when maxMembers is less than current member count', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'ShrinkGroup', maxMembers: 5 });
    for (let i = 0; i < 3; i++) {
      const u = await createUser({ username: `shrink${i}`, email: `shrink${i}@test.com` });
      await addUserToSubject(u.id, subject.id);
      await addUserToGroup(u.id, g.id, assignment.id);
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

  it('setting maxMembers exactly equal to current member count succeeds', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'BoundaryGroup', maxMembers: 10 });
    for (let i = 0; i < 3; i++) {
      const u = await createUser({ username: `bnd${i}`, email: `bnd${i}@test.com` });
      await addUserToSubject(u.id, subject.id);
      await addUserToGroup(u.id, g.id, assignment.id);
    }
    const res = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'BoundaryGroup', enabled: true, maxMembers: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).group.max_members).toBe(3);
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

  it('managing AM can update; unmanaged AM gets 403', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'AMUpdateTarget' });
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { name: 'AMUpdated', enabled: true },
    });
    expect(ok.statusCode).toBe(200);

    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${am2Token}` },
      payload: { name: 'Hacked', enabled: true },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/groups/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/groups/:id', () => {
  it('admin deletes a group; memberships cascade but users survive', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'DeleteMe' });
    await addUserToGroup(user1.id, g.id, assignment.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const db = getPool();
    const memberships = await db.query('SELECT COUNT(*)::int AS c FROM user_groups WHERE group_id = $1', [g.id]);
    expect(memberships.rows[0].c).toBe(0);
    const users = await db.query('SELECT COUNT(*)::int AS c FROM users WHERE id = $1', [user1.id]);
    expect(users.rows[0].c).toBe(1);
  });

  it('managing AM can delete; unmanaged AM gets 403', async () => {
    const g1 = await createGroup({ assignmentId: assignment.id, name: 'AMDel1' });
    const g2 = await createGroup({ assignmentId: assignment.id, name: 'AMDel2' });

    const forbidden = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${g1.id}`,
      headers: { authorization: `Bearer ${am2Token}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${g2.id}`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(ok.statusCode).toBe(200);
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
    const g = await createGroup({ assignmentId: assignment.id, name: 'Protected' });
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
    const g1 = await createGroup({ assignmentId: assignment.id, name: 'BulkDel1' });
    const g2 = await createGroup({ assignmentId: assignment.id, name: 'BulkDel2' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [g1.id, g2.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(2);
  });

  it('returns 400 for empty ids and invalid UUIDs', async () => {
    const empty = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [] },
    });
    expect(empty.statusCode).toBe(400);
    const invalid = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: ['not-valid'] },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('managing AM can bulk delete groups of their assignment', async () => {
    const g1 = await createGroup({ assignmentId: assignment.id, name: 'AMBulkDel1' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { ids: [g1.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(1);
  });

  it('AM bulk delete including a group of an unmanaged assignment returns 403', async () => {
    const a2 = await createAssignment({ subjectId: subject.id, name: 'A2' });
    const managed = await createGroup({ assignmentId: assignment.id, name: 'ManagedG' });
    const unmanaged = await createGroup({ assignmentId: a2.id, name: 'UnmanagedG' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { ids: [managed.id, unmanaged.id] },
    });
    expect(res.statusCode).toBe(403);

    // Nothing was deleted
    const db = getPool();
    const remaining = await db.query('SELECT COUNT(*)::int AS c FROM groups WHERE id = ANY($1)', [
      [managed.id, unmanaged.id],
    ]);
    expect(remaining.rows[0].c).toBe(2);
  });

  it('regular user cannot bulk delete groups', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'UserBulkDel' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/groups/bulk',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { ids: [g.id] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/groups/:id/join
// ---------------------------------------------------------------------------
describe('POST /api/groups/:id/join', () => {
  it('subject member joins an enabled group', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'Joinable' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).groupId).toBe(g.id);
  });

  it('non-subject-member joining returns 403', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'MembersOnly' });
    await createUser({ username: 'stranger', email: 'stranger@test.com' });
    const strangerToken = await loginAs(app, 'stranger', 'TestPass123!');
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/not an active member of this subject/i);
  });

  it('a user disabled after login cannot join (stale JWT) — 403 Account is disabled', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'NoDisabledJoin' });
    // user1 logs in first, then is disabled; the JWT remains valid
    await getPool().query('UPDATE users SET enabled = false WHERE id = $1', [user1.id]);
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Account is disabled');
    const { rows } = await getPool().query('SELECT 1 FROM user_groups WHERE user_id = $1', [user1.id]);
    expect(rows).toHaveLength(0);
  });

  it('returns 400 for disabled group', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'Disabled', enabled: false });
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/disabled/i);
  });

  it('returns 409 when already in a group for the same assignment', async () => {
    const g1 = await createGroup({ assignmentId: assignment.id, name: 'FirstGroup' });
    const g2 = await createGroup({ assignmentId: assignment.id, name: 'SecondGroup' });
    const join1 = await app.inject({
      method: 'POST',
      url: `/api/groups/${g1.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(join1.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g2.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/already in a group/i);
  });

  it('same user can join groups in two different assignments of the subject', async () => {
    const a2 = await createAssignment({ subjectId: subject.id, name: 'A2' });
    const g1 = await createGroup({ assignmentId: assignment.id, name: 'A1Group' });
    const g2 = await createGroup({ assignmentId: a2.id, name: 'A2Group' });

    const join1 = await app.inject({
      method: 'POST',
      url: `/api/groups/${g1.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(join1.statusCode).toBe(200);

    const join2 = await app.inject({
      method: 'POST',
      url: `/api/groups/${g2.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(join2.statusCode).toBe(200);

    const db = getPool();
    const rows = await db.query('SELECT COUNT(*)::int AS c FROM user_groups WHERE user_id = $1', [user1.id]);
    expect(rows.rows[0].c).toBe(2);
  });

  it('returns 409 when group is at capacity', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'FullGroup', maxMembers: 1 });
    const filler = await createUser({ username: 'filler', email: 'filler@test.com' });
    await addUserToSubject(filler.id, subject.id);
    const fToken = await loginAs(app, 'filler', 'TestPass123!');
    const fill = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${fToken}` },
    });
    expect(fill.statusCode).toBe(200);

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

  it('returns 401 without token and 400 for invalid UUID', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'NoAuthGroup' });
    const noAuth = await app.inject({ method: 'POST', url: `/api/groups/${g.id}/join` });
    expect(noAuth.statusCode).toBe(401);
    const badId = await app.inject({
      method: 'POST',
      url: '/api/groups/not-a-uuid/join',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(badId.statusCode).toBe(400);
  });

  it('group_join_locked blocks regular users but not an AM who is a subject member', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'LockedGroup' });
    await addUserToSubject(am1.id, subject.id);
    await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });

    const userRes = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(userRes.statusCode).toBe(403);
    expect(JSON.parse(userRes.body).error).toMatch(/locked/i);

    const amRes = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(amRes.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/groups/:id/leave
// ---------------------------------------------------------------------------
describe('POST /api/groups/:id/leave', () => {
  it('user leaves their group', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'LeaveGroup' });
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

    const db = getPool();
    const rows = await db.query('SELECT COUNT(*)::int AS c FROM user_groups WHERE user_id = $1', [user1.id]);
    expect(rows.rows[0].c).toBe(0);
  });

  it('returns 400 when user is not a member of this group', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'NotMemberGroup' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/leave`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/not a member/i);
  });

  it('a user disabled after login cannot leave (stale JWT) — 403 Account is disabled', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'NoDisabledLeave' });
    await addUserToGroup(user1.id, g.id, assignment.id);
    await getPool().query('UPDATE users SET enabled = false WHERE id = $1', [user1.id]);
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/leave`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Account is disabled');
    const { rows } = await getPool().query('SELECT 1 FROM user_groups WHERE user_id = $1', [user1.id]);
    expect(rows).toHaveLength(1);
  });

  it('returns 400 when the user is in a different group of the same assignment', async () => {
    const g1 = await createGroup({ assignmentId: assignment.id, name: 'ActualGroup' });
    const g2 = await createGroup({ assignmentId: assignment.id, name: 'WrongGroup' });
    await addUserToGroup(user1.id, g1.id, assignment.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g2.id}/leave`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('user attempting to leave when group_join_locked=true returns 403', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'LockedLeaveGroup' });
    await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/join`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    await app.inject({
      method: 'PUT',
      url: '/api/config/group_join_locked',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'true' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g.id}/leave`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/locked/i);
  });

  it('leave with invalid UUID returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups/not-a-uuid/leave',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id/group — universal subject-membership rule & replace
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id/group — placement rules', () => {
  it('admin placing a non-subject-member returns 403 (universal rule)', async () => {
    const g = await createGroup({ assignmentId: assignment.id, name: 'RuleGroup' });
    const outsider = await createUser({ username: 'outsider', email: 'outsider@test.com' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${outsider.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, groupId: g.id },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/not an active member of this subject/i);
  });

  it('admin reassigns a user to another group in the same assignment (replace)', async () => {
    const g1 = await createGroup({ assignmentId: assignment.id, name: 'FromGroup' });
    const g2 = await createGroup({ assignmentId: assignment.id, name: 'ToGroup' });
    await addUserToGroup(user1.id, g1.id, assignment.id);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment.id, groupId: g2.id },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.groupId).toBe(g2.id);

    const db = getPool();
    const rows = await db.query('SELECT group_id FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
      user1.id,
      assignment.id,
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].group_id).toBe(g2.id);
  });
});
