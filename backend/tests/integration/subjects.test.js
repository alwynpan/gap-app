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
});

// ---------------------------------------------------------------------------
// GET /api/subjects
// ---------------------------------------------------------------------------
describe('GET /api/subjects', () => {
  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/subjects' });
    expect(res.statusCode).toBe(401);
  });

  it('admin sees all subjects with counts', async () => {
    const s1 = await createSubject({ name: 'COMP10001' });
    await createSubject({ name: 'COMP20002' });
    await createAssignment({ subjectId: s1.id, name: 'A1' });
    await addUserToSubject(user1.id, s1.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.subjects).toHaveLength(2);
    const comp1 = body.subjects.find((s) => s.name === 'COMP10001');
    expect(comp1.assignment_count).toBe(1);
    expect(comp1.member_count).toBe(1);
  });

  it('assignment manager sees only subjects with managed assignments or own membership', async () => {
    const managed = await createSubject({ name: 'ManagedSubject' });
    const memberOf = await createSubject({ name: 'MemberSubject' });
    await createSubject({ name: 'UnrelatedSubject' });
    const a1 = await createAssignment({ subjectId: managed.id, name: 'A1' });
    await assignManager(am1.id, a1.id);
    await addUserToSubject(am1.id, memberOf.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).subjects.map((s) => s.name);
    expect(names).toContain('ManagedSubject');
    expect(names).toContain('MemberSubject');
    expect(names).not.toContain('UnrelatedSubject');
  });

  it('regular user sees only subjects they are a member of', async () => {
    const mine = await createSubject({ name: 'MySubject' });
    await createSubject({ name: 'OtherSubject' });
    await addUserToSubject(user1.id, mine.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).subjects.map((s) => s.name);
    expect(names).toEqual(['MySubject']);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subjects/:id
// ---------------------------------------------------------------------------
describe('GET /api/subjects/:id', () => {
  it('admin gets subject with its assignments', async () => {
    const s = await createSubject({ name: 'DetailSubject' });
    await createAssignment({ subjectId: s.id, name: 'A1' });
    await createAssignment({ subjectId: s.id, name: 'A2' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.subject.name).toBe('DetailSubject');
    expect(body.assignments).toHaveLength(2);
    expect(body.assignments.map((a) => a.name).sort()).toEqual(['A1', 'A2']);
  });

  it('subject member can view the subject', async () => {
    const s = await createSubject({ name: 'MemberViewSubject' });
    await addUserToSubject(user1.id, s.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('non-member user gets 403', async () => {
    const s = await createSubject({ name: 'PrivateSubject' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('AM managing an assignment in the subject can view it', async () => {
    const s = await createSubject({ name: 'AMViewSubject' });
    const a = await createAssignment({ subjectId: s.id, name: 'A1' });
    await assignManager(am1.id, a.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('AM with no managed assignment in the subject gets 403', async () => {
    const s = await createSubject({ name: 'AMNoAccessSubject' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/subjects/not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent subject', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/subjects/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subjects
// ---------------------------------------------------------------------------
describe('POST /api/subjects', () => {
  it('admin creates a subject', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NewSubject' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.subject.name).toBe('NewSubject');
    expect(body.subject.id).toBeDefined();
  });

  it('returns 409 for duplicate name', async () => {
    await createSubject({ name: 'DupSubject' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'DupSubject' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('duplicate check is case-insensitive', async () => {
    await createSubject({ name: 'CaseSubject' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'casesubject' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 for missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for assignment manager', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { name: 'AMSubject' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for regular user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'UserSubject' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/subjects', payload: { name: 'NoAuth' } });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/subjects/:id
// ---------------------------------------------------------------------------
describe('PUT /api/subjects/:id', () => {
  it('admin renames a subject', async () => {
    const s = await createSubject({ name: 'OldSubjectName' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'NewSubjectName' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).subject.name).toBe('NewSubjectName');
  });

  it('renaming to an existing name (case-insensitive) returns 409', async () => {
    await createSubject({ name: 'TakenName' });
    const s = await createSubject({ name: 'RenameMe' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'takenname' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('updating with the unchanged name succeeds', async () => {
    const s = await createSubject({ name: 'SameName' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'SameName' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/subjects/not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid body', async () => {
    const s = await createSubject({ name: 'BadBodySubject' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent subject', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/subjects/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for assignment manager', async () => {
    const s = await createSubject({ name: 'AMUpdateSubject' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { name: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/subjects/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/subjects/:id', () => {
  it('admin deletes a subject', async () => {
    const s = await createSubject({ name: 'DeleteMe' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('cascades assignments, groups and memberships but NOT users', async () => {
    const s = await createSubject({ name: 'CascadeSubject' });
    const a = await createAssignment({ subjectId: s.id, name: 'A1' });
    const g = await createGroup({ assignmentId: a.id, name: 'G1' });
    await addUserToSubject(user1.id, s.id);
    await addUserToGroup(user1.id, g.id, a.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const db = getPool();
    const assignments = await db.query('SELECT COUNT(*)::int AS c FROM assignments WHERE subject_id = $1', [s.id]);
    expect(assignments.rows[0].c).toBe(0);
    const groups = await db.query('SELECT COUNT(*)::int AS c FROM groups WHERE id = $1', [g.id]);
    expect(groups.rows[0].c).toBe(0);
    const userGroups = await db.query('SELECT COUNT(*)::int AS c FROM user_groups WHERE user_id = $1', [user1.id]);
    expect(userGroups.rows[0].c).toBe(0);
    const userSubjects = await db.query('SELECT COUNT(*)::int AS c FROM user_subjects WHERE subject_id = $1', [s.id]);
    expect(userSubjects.rows[0].c).toBe(0);
    // The user itself survives
    const users = await db.query('SELECT COUNT(*)::int AS c FROM users WHERE id = $1', [user1.id]);
    expect(users.rows[0].c).toBe(1);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/subjects/not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent subject', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/subjects/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for regular user', async () => {
    const s = await createSubject({ name: 'ProtectedSubject' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/subjects/${s.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subjects/:id/users
// ---------------------------------------------------------------------------
describe('GET /api/subjects/:id/users', () => {
  it('admin lists subject members', async () => {
    const s = await createSubject({ name: 'MembersSubject' });
    await addUserToSubject(user1.id, s.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].username).toBe('user1');
  });

  it('AM managing an assignment in the subject can list members', async () => {
    const s = await createSubject({ name: 'AMMembersSubject' });
    const a = await createAssignment({ subjectId: s.id, name: 'A1' });
    await assignManager(am1.id, a.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('AM not managing in the subject gets 403', async () => {
    const s = await createSubject({ name: 'ForeignSubject' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('regular user (even a member) gets 403', async () => {
    const s = await createSubject({ name: 'MemberButNoList' });
    await addUserToSubject(user1.id, s.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent subject', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/subjects/00000000-0000-0000-0000-000000000000/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subjects/:id/users
// ---------------------------------------------------------------------------
describe('POST /api/subjects/:id/users', () => {
  it('admin adds users to a subject', async () => {
    const s = await createSubject({ name: 'AddUsersSubject' });
    const u2 = await createUser({ username: 'user2', email: 'user2@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [user1.id, u2.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).added).toBe(2);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const usernames = JSON.parse(listRes.body).users.map((u) => u.username);
    expect(usernames.sort()).toEqual(['user1', 'user2']);
  });

  it('re-adding an existing member is idempotent (added 0)', async () => {
    const s = await createSubject({ name: 'IdempotentSubject' });
    await addUserToSubject(user1.id, s.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [user1.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).added).toBe(0);
  });

  it('returns 400 when a user does not exist', async () => {
    const s = await createSubject({ name: 'GhostUserSubject' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/do not exist/i);
  });

  it('returns 400 for empty userIds', async () => {
    const s = await createSubject({ name: 'EmptyIdsSubject' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent subject', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subjects/00000000-0000-0000-0000-000000000000/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [user1.id] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for assignment manager', async () => {
    const s = await createSubject({ name: 'AMAddSubject' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/subjects/${s.id}/users`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { userIds: [user1.id] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/subjects/:id/users/:userId
// ---------------------------------------------------------------------------
describe('DELETE /api/subjects/:id/users/:userId', () => {
  it('admin removes a member; group memberships within the subject are deleted', async () => {
    const s1 = await createSubject({ name: 'RemovalSubject' });
    const s2 = await createSubject({ name: 'KeptSubject' });
    const a1 = await createAssignment({ subjectId: s1.id, name: 'A1' });
    const a2 = await createAssignment({ subjectId: s2.id, name: 'A2' });
    const g1 = await createGroup({ assignmentId: a1.id, name: 'G1' });
    const g2 = await createGroup({ assignmentId: a2.id, name: 'G2' });
    await addUserToSubject(user1.id, s1.id);
    await addUserToSubject(user1.id, s2.id);
    await addUserToGroup(user1.id, g1.id, a1.id);
    await addUserToGroup(user1.id, g2.id, a2.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/subjects/${s1.id}/users/${user1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const db = getPool();
    // Membership in s1's assignment group removed…
    const inS1 = await db.query(
      'SELECT COUNT(*)::int AS c FROM user_groups WHERE user_id = $1 AND assignment_id = $2',
      [user1.id, a1.id]
    );
    expect(inS1.rows[0].c).toBe(0);
    // …but the membership in the other subject's assignment survives
    const inS2 = await db.query(
      'SELECT COUNT(*)::int AS c FROM user_groups WHERE user_id = $1 AND assignment_id = $2',
      [user1.id, a2.id]
    );
    expect(inS2.rows[0].c).toBe(1);
    // Subject enrolment removed
    const enrolled = await db.query(
      'SELECT COUNT(*)::int AS c FROM user_subjects WHERE user_id = $1 AND subject_id = $2',
      [user1.id, s1.id]
    );
    expect(enrolled.rows[0].c).toBe(0);
  });

  it('returns 404 when the user is not a member', async () => {
    const s = await createSubject({ name: 'NotMemberSubject' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/subjects/${s.id}/users/${user1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not a member/i);
  });

  it('returns 400 for invalid user UUID', async () => {
    const s = await createSubject({ name: 'BadUserIdSubject' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/subjects/${s.id}/users/not-a-uuid`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for assignment manager', async () => {
    const s = await createSubject({ name: 'AMRemoveSubject' });
    await addUserToSubject(user1.id, s.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/subjects/${s.id}/users/${user1.id}`,
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
