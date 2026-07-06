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
let amToken;
let userToken;
let am1;
let user1;
let subject;

beforeAll(async () => {
  app = await buildTestServer();
});

afterAll(async () => {
  await closeTestServer(app);
});

beforeEach(async () => {
  await cleanDatabase();
  adminToken = await loginAs(app, 'admin', 'AdminPass123!');

  am1 = await createUser({ username: 'am1', email: 'am1@test.com', role: 'assignment_manager' });
  amToken = await loginAs(app, 'am1', 'TestPass123!');

  user1 = await createUser({ username: 'user1', email: 'user1@test.com', role: 'user' });
  userToken = await loginAs(app, 'user1', 'TestPass123!');

  subject = await createSubject({ name: 'BaseSubject' });
});

// ---------------------------------------------------------------------------
// GET /api/assignments
// ---------------------------------------------------------------------------
describe('GET /api/assignments', () => {
  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/assignments' });
    expect(res.statusCode).toBe(401);
  });

  it('admin lists all assignments', async () => {
    await createAssignment({ subjectId: subject.id, name: 'A1' });
    await createAssignment({ subjectId: subject.id, name: 'A2' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.assignments).toHaveLength(2);
    expect(body.assignments[0].subject_name).toBe('BaseSubject');
  });

  it('filters by subjectId', async () => {
    const other = await createSubject({ name: 'OtherSubject' });
    await createAssignment({ subjectId: subject.id, name: 'InBase' });
    await createAssignment({ subjectId: other.id, name: 'InOther' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments?subjectId=${subject.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).assignments.map((a) => a.name);
    expect(names).toEqual(['InBase']);
  });

  it('returns 400 for invalid subjectId filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/assignments?subjectId=not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('AM sees managed assignments plus assignments of own subjects', async () => {
    const managed = await createAssignment({ subjectId: subject.id, name: 'ManagedA' });
    await createAssignment({ subjectId: subject.id, name: 'UnmanagedA' });
    const memberSubject = await createSubject({ name: 'AMMemberSubject' });
    await createAssignment({ subjectId: memberSubject.id, name: 'MemberSubjectA' });
    await assignManager(am1.id, managed.id);
    await addUserToSubject(am1.id, memberSubject.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).assignments.map((a) => a.name);
    expect(names).toContain('ManagedA');
    expect(names).toContain('MemberSubjectA');
    expect(names).not.toContain('UnmanagedA');
  });

  it('regular user sees only assignments of subjects they belong to', async () => {
    await createAssignment({ subjectId: subject.id, name: 'MineA' });
    const other = await createSubject({ name: 'NotMineSubject' });
    await createAssignment({ subjectId: other.id, name: 'NotMineA' });
    await addUserToSubject(user1.id, subject.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).assignments.map((a) => a.name);
    expect(names).toEqual(['MineA']);
  });
});

// ---------------------------------------------------------------------------
// GET /api/assignments/:id
// ---------------------------------------------------------------------------
describe('GET /api/assignments/:id', () => {
  it('admin gets an assignment', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'DetailA' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.assignment.name).toBe('DetailA');
    expect(body.assignment.subject_id).toBe(subject.id);
  });

  it('subject member can view the assignment', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'MemberA' });
    await addUserToSubject(user1.id, subject.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('managing AM can view the assignment', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'AMViewA' });
    await assignManager(am1.id, a.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('outsider user gets 403', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'PrivateA' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for invalid UUID and 404 for unknown id', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/api/assignments/not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({
      method: 'GET',
      url: '/api/assignments/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(missing.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/assignments
// ---------------------------------------------------------------------------
describe('POST /api/assignments', () => {
  it('admin creates an assignment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { subjectId: subject.id, name: 'NewAssignment' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.assignment.name).toBe('NewAssignment');
    expect(body.assignment.subject_id).toBe(subject.id);
  });

  it('returns 409 for a duplicate name within the same subject (case-insensitive)', async () => {
    await createAssignment({ subjectId: subject.id, name: 'DupA' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { subjectId: subject.id, name: 'dupa' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('allows the same name in a DIFFERENT subject', async () => {
    await createAssignment({ subjectId: subject.id, name: 'SharedName' });
    const other = await createSubject({ name: 'SecondSubject' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { subjectId: other.id, name: 'SharedName' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns 404 when the subject does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { subjectId: '00000000-0000-0000-0000-000000000000', name: 'Orphan' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assignments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NoSubject' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for AM and regular user', async () => {
    for (const token of [amToken, userToken]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assignments',
        headers: { authorization: `Bearer ${token}` },
        payload: { subjectId: subject.id, name: 'Forbidden' },
      });
      expect(res.statusCode).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/assignments/:id
// ---------------------------------------------------------------------------
describe('PUT /api/assignments/:id', () => {
  it('admin renames an assignment', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'OldA' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NewA' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).assignment.name).toBe('NewA');
  });

  it('returns 409 when renaming to an existing name in the subject', async () => {
    await createAssignment({ subjectId: subject.id, name: 'TakenA' });
    const a = await createAssignment({ subjectId: subject.id, name: 'RenameA' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'TakenA' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 404 / 400 for unknown id / invalid uuid', async () => {
    const missing = await app.inject({
      method: 'PUT',
      url: '/api/assignments/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Ghost' },
    });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/assignments/not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Bad' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('returns 403 for AM', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'AMPutA' });
    await assignManager(am1.id, a.id);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/assignments/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/assignments/:id', () => {
  it('admin deletes an assignment; groups and memberships cascade, users survive', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'CascadeA' });
    const g = await createGroup({ assignmentId: a.id, name: 'G1' });
    await addUserToSubject(user1.id, subject.id);
    await addUserToGroup(user1.id, g.id, a.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const db = getPool();
    const groups = await db.query('SELECT COUNT(*)::int AS c FROM groups WHERE assignment_id = $1', [a.id]);
    expect(groups.rows[0].c).toBe(0);
    const memberships = await db.query('SELECT COUNT(*)::int AS c FROM user_groups WHERE assignment_id = $1', [a.id]);
    expect(memberships.rows[0].c).toBe(0);
    const users = await db.query('SELECT COUNT(*)::int AS c FROM users WHERE id = $1', [user1.id]);
    expect(users.rows[0].c).toBe(1);
    // Subject enrolment is untouched
    const enrolment = await db.query('SELECT COUNT(*)::int AS c FROM user_subjects WHERE user_id = $1', [user1.id]);
    expect(enrolment.rows[0].c).toBe(1);
  });

  it('returns 404 for unknown assignment and 403 for non-admin', async () => {
    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/assignments/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(missing.statusCode).toBe(404);

    const a = await createAssignment({ subjectId: subject.id, name: 'ProtectedA' });
    await assignManager(am1.id, a.id);
    const amRes = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${a.id}`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(amRes.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/assignments/:id/groups
// ---------------------------------------------------------------------------
describe('GET /api/assignments/:id/groups', () => {
  it('lists groups of the assignment with member counts', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'GroupsA' });
    const g = await createGroup({ assignmentId: a.id, name: 'Alpha' });
    await createGroup({ assignmentId: a.id, name: 'Beta', enabled: false });
    await addUserToSubject(user1.id, subject.id);
    await addUserToGroup(user1.id, g.id, a.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/groups`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.groups).toHaveLength(2);
    const alpha = body.groups.find((x) => x.name === 'Alpha');
    expect(alpha.member_count).toBe(1);
  });

  it('?enabled=true returns only enabled groups', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'EnabledFilterA' });
    await createGroup({ assignmentId: a.id, name: 'On', enabled: true });
    await createGroup({ assignmentId: a.id, name: 'Off', enabled: false });

    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/groups?enabled=true`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).groups.map((g) => g.name);
    expect(names).toEqual(['On']);
  });

  it('subject member can list; outsider gets 403', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'ScopedGroupsA' });
    await addUserToSubject(user1.id, subject.id);
    const memberRes = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/groups`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(memberRes.statusCode).toBe(200);

    const outsider = await createUser({ username: 'outsider', email: 'outsider@test.com' });
    const outsiderToken = await loginAs(app, outsider.username, 'TestPass123!');
    const outsiderRes = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/groups`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsiderRes.statusCode).toBe(403);
  });

  it('returns 404 for unknown assignment', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/assignments/00000000-0000-0000-0000-000000000000/groups',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET/PUT /api/assignments/:id/managers
// ---------------------------------------------------------------------------
describe('GET/PUT /api/assignments/:id/managers', () => {
  it('admin sets and reads managers; replace semantics; empty clears', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'ManagersA' });
    const am2 = await createUser({ username: 'am2', email: 'am2@test.com', role: 'assignment_manager' });

    // Set [am1]
    const set1 = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [am1.id] },
    });
    expect(set1.statusCode).toBe(200);
    expect(JSON.parse(set1.body).managers.map((m) => m.username)).toEqual(['am1']);

    // Replace with [am2] — am1 must be gone
    const set2 = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [am2.id] },
    });
    expect(set2.statusCode).toBe(200);
    expect(JSON.parse(set2.body).managers.map((m) => m.username)).toEqual(['am2']);

    const get = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body).managers.map((m) => m.username)).toEqual(['am2']);

    // Empty clears
    const clear = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [] },
    });
    expect(clear.statusCode).toBe(200);
    expect(JSON.parse(clear.body).managers).toEqual([]);
  });

  it('PUT rejects userIds whose role is not assignment_manager', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'BadManagerA' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [user1.id] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/assignment_manager role/i);
  });

  it('PUT rejects unknown userIds', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'GhostManagerA' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/do not exist/i);
  });

  it('GET and PUT are admin-only (403 for AM)', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'AdminOnlyManagersA' });
    await assignManager(am1.id, a.id);
    const get = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(get.statusCode).toBe(403);
    const put = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${a.id}/managers`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { userIds: [] },
    });
    expect(put.statusCode).toBe(403);
  });

  it('returns 404 for unknown assignment', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/assignments/00000000-0000-0000-0000-000000000000/managers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [] },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/assignments/:id/export-mappings
// ---------------------------------------------------------------------------
describe('GET /api/assignments/:id/export-mappings', () => {
  it('exports email/groupName pairs for the assignment only', async () => {
    const a1 = await createAssignment({ subjectId: subject.id, name: 'ExportA1' });
    const a2 = await createAssignment({ subjectId: subject.id, name: 'ExportA2' });
    const g1 = await createGroup({ assignmentId: a1.id, name: 'TeamOne' });
    const g2 = await createGroup({ assignmentId: a2.id, name: 'TeamTwo' });
    const u2 = await createUser({ username: 'exporter2', email: 'exporter2@test.com' });
    await addUserToSubject(user1.id, subject.id);
    await addUserToSubject(u2.id, subject.id);
    await addUserToGroup(user1.id, g1.id, a1.id);
    await addUserToGroup(u2.id, g2.id, a2.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a1.id}/export-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.mappings).toEqual([{ email: 'user1@test.com', groupName: 'TeamOne' }]);
  });

  it('managing AM can export; non-managing AM gets 403; user gets 403', async () => {
    const a = await createAssignment({ subjectId: subject.id, name: 'ExportScopeA' });
    await assignManager(am1.id, a.id);
    const ok = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/export-mappings`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).mappings).toEqual([]);

    const am2 = await createUser({ username: 'am2', email: 'am2@test.com', role: 'assignment_manager' });
    const am2Token = await loginAs(app, am2.username, 'TestPass123!');
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/export-mappings`,
      headers: { authorization: `Bearer ${am2Token}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const userRes = await app.inject({
      method: 'GET',
      url: `/api/assignments/${a.id}/export-mappings`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(userRes.statusCode).toBe(403);
  });

  it('returns 404 for unknown assignment', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/assignments/00000000-0000-0000-0000-000000000000/export-mappings',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/assignments/:id/import-mappings
// ---------------------------------------------------------------------------
describe('POST /api/assignments/:id/import-mappings', () => {
  let assignment;
  let group;

  beforeEach(async () => {
    assignment = await createAssignment({ subjectId: subject.id, name: 'ImportA' });
    group = await createGroup({ assignmentId: assignment.id, name: 'ImportGroup' });
  });

  it('admin imports a mapping for a subject member', async () => {
    await addUserToSubject(user1.id, subject.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'ImportGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(1);
    expect(body.skipped).toEqual([]);
    expect(body.errors).toEqual([]);

    const db = getPool();
    const rows = await db.query('SELECT group_id FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
      user1.id,
      assignment.id,
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].group_id).toBe(group.id);
  });

  it('replaces an existing membership for the assignment', async () => {
    const g2 = await createGroup({ assignmentId: assignment.id, name: 'SecondGroup' });
    await addUserToSubject(user1.id, subject.id);
    await addUserToGroup(user1.id, group.id, assignment.id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'SecondGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).imported).toBe(1);

    const db = getPool();
    const rows = await db.query('SELECT group_id FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
      user1.id,
      assignment.id,
    ]);
    expect(rows.rows[0].group_id).toBe(g2.id);
  });

  it('skips unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'ghost@test.com', groupName: 'ImportGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(0);
    expect(body.skipped[0].reason).toBe('User not found');
  });

  it('skips unknown group', async () => {
    await addUserToSubject(user1.id, subject.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'GhostGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).skipped[0].reason).toBe('Group not found');
  });

  it('skips a user who is not a member of the subject', async () => {
    // user1 exists but is NOT enrolled in the subject
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'ImportGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(0);
    expect(body.skipped[0].reason).toBe('User is not a member of this subject');
  });

  it('skips admin accounts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'admin@gap.local', groupName: 'ImportGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(0);
    expect(body.skipped[0].reason).toMatch(/admin/i);
  });

  it('skips a mapping into a full group', async () => {
    const full = await createGroup({ assignmentId: assignment.id, name: 'FullGroup', maxMembers: 1 });
    const filler = await createUser({ username: 'filler', email: 'filler@test.com' });
    await addUserToSubject(filler.id, subject.id);
    await addUserToSubject(user1.id, subject.id);
    await addUserToGroup(filler.id, full.id, assignment.id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'FullGroup' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(0);
    expect(body.skipped[0].reason).toBe('Group is full');
  });

  it('rows with action=skip are echoed into skipped', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        rows: [{ email: 'skipme@test.com', groupName: 'ImportGroup', action: 'skip', skipReason: 'Duplicate entry' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].reason).toBe('Duplicate entry');
  });

  it('returns 400 for empty rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rows: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('managing AM can import; non-managing AM gets 403', async () => {
    await assignManager(am1.id, assignment.id);
    await addUserToSubject(user1.id, subject.id);
    const ok = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'ImportGroup' }] },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).imported).toBe(1);

    const am2 = await createUser({ username: 'am2', email: 'am2@test.com', role: 'assignment_manager' });
    const am2Token = await loginAs(app, am2.username, 'TestPass123!');
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${am2Token}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'ImportGroup' }] },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('returns 403 for regular user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignment.id}/import-mappings`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { rows: [{ email: 'user1@test.com', groupName: 'ImportGroup' }] },
    });
    expect(res.statusCode).toBe(403);
  });
});
