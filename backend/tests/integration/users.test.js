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
let amToken; // manages assignment1 (in subject1)
let userToken;
let am1;
let user1;
let subject1;
let subject2;
let assignment1;
let assignment2;

beforeAll(async () => {
  app = await buildTestServer();
});

afterAll(async () => {
  await closeTestServer(app);
});

beforeEach(async () => {
  await cleanDatabase();
  adminToken = await loginAs(app, 'admin', 'AdminPass123!');

  subject1 = await createSubject({ name: 'Subject1' });
  subject2 = await createSubject({ name: 'Subject2' });
  assignment1 = await createAssignment({ subjectId: subject1.id, name: 'A1' });
  assignment2 = await createAssignment({ subjectId: subject2.id, name: 'A2' });

  am1 = await createUser({ username: 'am1', email: 'am1@test.com', role: 'assignment_manager' });
  await assignManager(am1.id, assignment1.id);
  amToken = await loginAs(app, 'am1', 'TestPass123!');

  user1 = await createUser({ username: 'user1', email: 'user1@test.com', role: 'user' });
  await addUserToSubject(user1.id, subject1.id);
  userToken = await loginAs(app, 'user1', 'TestPass123!');
});

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
describe('GET /api/users', () => {
  it('admin can list all users with subjects and memberships enrichment', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'EnrichGroup' });
    await addUserToGroup(user1.id, g.id, assignment1.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.users)).toBe(true);

    const u1 = body.users.find((u) => u.username === 'user1');
    expect(u1.subjects.map((s) => s.name)).toEqual(['Subject1']);
    expect(u1.memberships).toHaveLength(1);
    expect(u1.memberships[0].group_id).toBe(g.id);
    expect(u1.memberships[0].assignment_id).toBe(assignment1.id);
    expect(u1.memberships[0].group_name).toBe('EnrichGroup');

    const admin = body.users.find((u) => u.username === 'admin');
    expect(admin.subjects).toEqual([]);
    expect(admin.memberships).toEqual([]);
  });

  it('assignment manager cannot list users — the route is admin-only', async () => {
    const s2only = await createUser({ username: 's2only', email: 's2only@test.com' });
    await addUserToSubject(s2only.id, subject2.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${amToken}` },
    });
    expect(res.statusCode).toBe(403);

    // Admin still sees everyone
    const adminRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminRes.statusCode).toBe(200);
    const allUsernames = JSON.parse(adminRes.body).users.map((u) => u.username);
    expect(allUsernames).toContain('user1');
    expect(allUsernames).toContain('s2only');
  });

  it('regular user cannot list users and 401 without token', async () => {
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
    const noToken = await app.inject({ method: 'GET', url: '/api/users' });
    expect(noToken.statusCode).toBe(401);
  });

  it('filters by role and status; rejects invalid values', async () => {
    const byRole = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(byRole.statusCode).toBe(200);
    expect(JSON.parse(byRole.body).users.every((u) => u.role_name === 'admin')).toBe(true);

    const byStatus = await app.inject({
      method: 'GET',
      url: '/api/users?role=user&status=active',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(byStatus.statusCode).toBe(200);
    const users = JSON.parse(byStatus.body).users;
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.role_name === 'user' && u.status === 'active')).toBe(true);

    const badRole = await app.inject({
      method: 'GET',
      url: '/api/users?role=superadmin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(badRole.statusCode).toBe(400);
    const badStatus = await app.inject({
      method: 'GET',
      url: '/api/users?status=unknown',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(badStatus.statusCode).toBe(400);
  });

  it('filters by subjectId', async () => {
    const s2user = await createUser({ username: 's2user', email: 's2user@test.com' });
    await addUserToSubject(s2user.id, subject2.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/users?subjectId=${subject1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const usernames = JSON.parse(res.body).users.map((u) => u.username);
    expect(usernames).toEqual(['user1']);

    const bad = await app.inject({
      method: 'GET',
      url: '/api/users?subjectId=not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('filters by groupId=<uuid>', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'FilterGroup' });
    await addUserToGroup(user1.id, g.id, assignment1.id);
    const ungrouped = await createUser({ username: 'ungrouped', email: 'ungrouped@test.com' });
    await addUserToSubject(ungrouped.id, subject1.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/users?groupId=${g.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const usernames = JSON.parse(res.body).users.map((u) => u.username);
    expect(usernames).toEqual(['user1']);

    const bad = await app.inject({
      method: 'GET',
      url: '/api/users?groupId=not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('groupId=none with assignmentId returns enrolled-but-ungrouped users', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'SomeGroup' });
    await addUserToGroup(user1.id, g.id, assignment1.id);
    const ungrouped = await createUser({ username: 'ungrouped', email: 'ungrouped@test.com' });
    await addUserToSubject(ungrouped.id, subject1.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/users?groupId=none&assignmentId=${assignment1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const usernames = JSON.parse(res.body).users.map((u) => u.username);
    expect(usernames).toContain('ungrouped');
    expect(usernames).not.toContain('user1');
  });

  it('groupId=none without assignmentId returns 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?groupId=none',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
    const badAssignment = await app.inject({
      method: 'GET',
      url: '/api/users?groupId=none&assignmentId=not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(badAssignment.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------
describe('GET /api/users/:id', () => {
  it('admin can get any user, enriched with subjects and memberships', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'ProfileGroup' });
    await addUserToGroup(user1.id, g.id, assignment1.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${user1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe('user1');
    expect(body.user.subjects.map((s) => s.name)).toEqual(['Subject1']);
    expect(body.user.memberships).toHaveLength(1);
    expect(body.user.memberships[0].group_name).toBe('ProfileGroup');
    expect(body.user).not.toHaveProperty('password_hash');
  });

  it('user can get their own profile but not another user', async () => {
    const own = await app.inject({
      method: 'GET',
      url: `/api/users/${user1.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(own.statusCode).toBe(200);

    const other = await createUser({ username: 'other', email: 'other@test.com' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${other.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent user and 400 for invalid UUID', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({
      method: 'GET',
      url: '/api/users/not-a-uuid',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(bad.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------
describe('POST /api/users', () => {
  it('admin creates user with subjectIds; user is pending and enrolled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'newuser',
        email: 'new@test.com',
        firstName: 'New',
        lastName: 'User',
        subjectIds: [subject1.id],
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe('newuser');
    expect(body.user.status).toBe('pending');

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/users/${body.user.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(getRes.body).user.subjects.map((s) => s.id)).toEqual([subject1.id]);
  });

  it('role user without subjectIds returns 400 "Subject is required"', async () => {
    for (const subjectIds of [undefined, []]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'nosubject',
          email: 'nosubject@test.com',
          firstName: 'No',
          lastName: 'Subject',
          subjectIds,
          sendSetupEmail: false,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Subject is required');
    }
  });

  it('AM cannot create a user in a subject they do not manage (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        username: 'scoped1',
        email: 'scoped1@test.com',
        firstName: 'Scoped',
        lastName: 'User',
        subjectIds: [subject2.id],
      },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Forbidden: You do not manage any assignment in this subject');
  });

  it('AM can create a user in a subject they manage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        username: 'scoped2',
        email: 'scoped2@test.com',
        firstName: 'Scoped',
        lastName: 'User',
        subjectIds: [subject1.id],
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns 404 for unknown subject in subjectIds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'ghostsubject',
        email: 'ghostsubject@test.com',
        firstName: 'G',
        lastName: 'S',
        subjectIds: ['00000000-0000-0000-0000-000000000000'],
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('creates user with immediate group placement', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'PlacementGroup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'placed',
        email: 'placed@test.com',
        firstName: 'P',
        lastName: 'L',
        subjectIds: [subject1.id],
        assignmentId: assignment1.id,
        groupId: g.id,
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.warning).toBeUndefined();

    const db = getPool();
    const rows = await db.query('SELECT group_id FROM user_groups WHERE user_id = $1', [body.user.id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].group_id).toBe(g.id);
  });

  it('groupId without assignmentId returns 400', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'NoAssignmentGroup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'noassignment',
        email: 'noassignment@test.com',
        firstName: 'N',
        lastName: 'A',
        subjectIds: [subject1.id],
        groupId: g.id,
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/assignmentId is required/i);
  });

  it('assignment not in selected subjects returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'wrongsubject',
        email: 'wrongsubject@test.com',
        firstName: 'W',
        lastName: 'S',
        subjectIds: [subject1.id],
        assignmentId: assignment2.id,
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/does not belong to the selected subjects/i);
  });

  it('group not in the selected assignment returns 400', async () => {
    const g2 = await createGroup({ assignmentId: assignment2.id, name: 'OtherAssignmentGroup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'wronggroup',
        email: 'wronggroup@test.com',
        firstName: 'W',
        lastName: 'G',
        subjectIds: [subject1.id],
        assignmentId: assignment1.id,
        groupId: g2.id,
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/does not belong to the selected assignment/i);
  });

  it('returns 404 when placement group does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'withghostgroup',
        email: 'withghostgroup@test.com',
        firstName: 'W',
        lastName: 'G',
        subjectIds: [subject1.id],
        assignmentId: assignment1.id,
        groupId: '00000000-0000-0000-0000-000000000000',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('placement into a full group still creates the user with a warning', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'FullGroup', maxMembers: 1 });
    await addUserToGroup(user1.id, g.id, assignment1.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'overflow',
        email: 'overflow@test.com',
        firstName: 'O',
        lastName: 'F',
        subjectIds: [subject1.id],
        assignmentId: assignment1.id,
        groupId: g.id,
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.warning).toMatch(/full/i);

    const db = getPool();
    const rows = await db.query('SELECT COUNT(*)::int AS c FROM user_groups WHERE user_id = $1', [body.user.id]);
    expect(rows.rows[0].c).toBe(0);
  });

  it('admin creates assignment_manager with managed assignmentIds', async () => {
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
        assignmentIds: [assignment1.id, assignment2.id],
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
    const newAmId = JSON.parse(res.body).user.id;

    const managers = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignment2.id}/managers`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(managers.body).managers.map((m) => m.id)).toContain(newAmId);
  });

  it('AM cannot create admin or assignment_manager users', async () => {
    for (const role of ['admin', 'assignment_manager']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${amToken}` },
        payload: {
          username: `bad-${role}`,
          email: `bad-${role}@test.com`,
          firstName: 'B',
          lastName: 'A',
          role,
          sendSetupEmail: false,
        },
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('AM can create a regular user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        username: 'amcreated',
        email: 'amcreated@test.com',
        firstName: 'AM',
        lastName: 'Created',
        subjectIds: [subject1.id],
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('regular user cannot create users', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        username: 'x',
        email: 'x@test.com',
        firstName: 'X',
        lastName: 'Y',
        subjectIds: [subject1.id],
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 for duplicate username, email and studentId', async () => {
    await createUser({ username: 'dup', email: 'dup@test.com', studentId: 'S123' });
    const base = { firstName: 'D', lastName: 'U', subjectIds: [subject1.id], sendSetupEmail: false };

    const dupUsername = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...base, username: 'dup', email: 'unique1@test.com' },
    });
    expect(dupUsername.statusCode).toBe(409);

    const dupEmail = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...base, username: 'unique1', email: 'dup@test.com' },
    });
    expect(dupEmail.statusCode).toBe(409);

    const dupStudentId = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...base, username: 'unique2', email: 'unique2@test.com', studentId: 'S123' },
    });
    expect(dupStudentId.statusCode).toBe(409);
    expect(JSON.parse(dupStudentId.body).error).toMatch(/student id/i);
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
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { email: 'user1updated@test.com', firstName: 'Updated', lastName: 'Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.email).toBe('user1updated@test.com');
  });

  it('regular user editing another user returns 403', async () => {
    const other = await createUser({ username: 'editvictim', email: 'editvictim@test.com' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${other.id}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { email: 'hijacked@test.com', firstName: 'H', lastName: 'J' },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/your own profile/i);
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

  it('AM can edit a user enrolled in a managed subject; out-of-scope user returns 403', async () => {
    const inScope = await createUser({ username: 'inscope', email: 'inscope@test.com' });
    await addUserToSubject(inScope.id, subject1.id);
    const outScope = await createUser({ username: 'outscope', email: 'outscope@test.com' });
    await addUserToSubject(outScope.id, subject2.id);

    const okRes = await app.inject({
      method: 'PUT',
      url: `/api/users/${inScope.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { email: 'inscope-new@test.com', firstName: 'In', lastName: 'Scope' },
    });
    expect(okRes.statusCode).toBe(200);
    expect(JSON.parse(okRes.body).user.email).toBe('inscope-new@test.com');

    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/users/${outScope.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { email: 'outscope-new@test.com', firstName: 'Out', lastName: 'Scope' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(JSON.parse(forbidden.body).error).toBe('Forbidden: user is not in a subject you manage');
  });

  it('AM can still edit a user whose managed-subject membership is suspended (includeDisabled scope)', async () => {
    const suspended = await createUser({ username: 'suspscope', email: 'suspscope@test.com' });
    await addUserToSubject(suspended.id, subject1.id, false);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${suspended.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { email: 'suspscope-new@test.com', firstName: 'Still', lastName: 'Editable' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.email).toBe('suspscope-new@test.com');
  });

  it('AM cannot enable or disable accounts; admin can', async () => {
    const u = await createUser({ username: 'amdisable', email: 'amdisable@test.com' });
    await addUserToSubject(u.id, subject1.id);

    const amRes = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { email: u.email, firstName: 'A', lastName: 'M', enabled: false },
    });
    expect(amRes.statusCode).toBe(403);
    expect(JSON.parse(amRes.body).error).toBe('Only admins can enable or disable accounts');

    const adminRes = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: u.email, firstName: 'A', lastName: 'M', enabled: false },
    });
    expect(adminRes.statusCode).toBe(200);
    expect(JSON.parse(adminRes.body).user.enabled).toBe(false);
  });

  it('AM cannot escalate a user role; admin can change roles', async () => {
    const u = await createUser({ username: 'rolechange', email: 'rolechange@test.com' });
    // The target must be enrolled in a subject the AM manages, or the AM gets 403
    await addUserToSubject(u.id, subject1.id);

    const amRes = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { email: u.email, firstName: 'No', lastName: 'Change', role: 'admin' },
    });
    expect(amRes.statusCode).toBe(200);
    let getRes = await app.inject({
      method: 'GET',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(getRes.body).user.role_name).toBe('user');

    const adminRes = await app.inject({
      method: 'PUT',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: u.email, firstName: 'Role', lastName: 'Change', role: 'assignment_manager' },
    });
    expect(adminRes.statusCode).toBe(200);
    getRes = await app.inject({
      method: 'GET',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(getRes.body).user.role_name).toBe('assignment_manager');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id/group
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id/group', () => {
  it('admin assigns a subject member to a group', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'TestGroup' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment1.id, groupId: g.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.groupId).toBe(g.id);
    expect(body.user.assignmentId).toBe(assignment1.id);
  });

  it('admin removes user from group with groupId null', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'RemovableGroup' });
    await addUserToGroup(user1.id, g.id, assignment1.id);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment1.id, groupId: null },
    });
    expect(res.statusCode).toBe(200);
    const db = getPool();
    const rows = await db.query('SELECT COUNT(*)::int AS c FROM user_groups WHERE user_id = $1', [user1.id]);
    expect(rows.rows[0].c).toBe(0);
  });

  it('managing AM can place users; unmanaged AM gets 403', async () => {
    const g1 = await createGroup({ assignmentId: assignment1.id, name: 'AMGroup1' });
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { assignmentId: assignment1.id, groupId: g1.id },
    });
    expect(ok.statusCode).toBe(200);

    // am1 does not manage assignment2
    const g2 = await createGroup({ assignmentId: assignment2.id, name: 'AMGroup2' });
    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${amToken}` },
      payload: { assignmentId: assignment2.id, groupId: g2.id },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('returns 400 when body is missing assignmentId or groupId', async () => {
    for (const payload of [{}, { groupId: null }, { assignmentId: assignment1.id }]) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/users/${user1.id}/group`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('returns 400 when the group belongs to a different assignment', async () => {
    const g2 = await createGroup({ assignmentId: assignment2.id, name: 'MismatchGroup' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment1.id, groupId: g2.id },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/does not belong/i);
  });

  it('returns 404 for non-existent group or assignment', async () => {
    const missingGroup = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment1.id, groupId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(missingGroup.statusCode).toBe(404);

    const missingAssignment = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: '00000000-0000-0000-0000-000000000000', groupId: null },
    });
    expect(missingAssignment.statusCode).toBe(404);
  });

  it('regular user cannot update group placements', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'VictimGroup' });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/group`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { assignmentId: assignment1.id, groupId: g.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when the target group is full', async () => {
    const g = await createGroup({ assignmentId: assignment1.id, name: 'TxnFullGroup', maxMembers: 1 });
    const second = await createUser({ username: 'txnsecond', email: 'txnsecond@test.com' });
    await addUserToSubject(second.id, subject1.id);
    await addUserToGroup(user1.id, g.id, assignment1.id);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${second.id}/group`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignmentId: assignment1.id, groupId: g.id },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/full/i);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id/password
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id/password', () => {
  it('user can change their own password', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'TestPass123!', newPassword: 'NewPass456!' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for wrong current password', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'WrongPass!', newPassword: 'NewPass456!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for too-short new password', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${user1.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'TestPass123!', newPassword: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('user cannot change another user password (admin included)', async () => {
    const other = await createUser({ username: 'otherpass', email: 'otherpass@test.com' });
    const asUser = await app.inject({
      method: 'PUT',
      url: `/api/users/${other.id}/password`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { currentPassword: 'TestPass123!', newPassword: 'NewPass456!' },
    });
    expect(asUser.statusCode).toBe(403);

    const asAdmin = await app.inject({
      method: 'PUT',
      url: `/api/users/${other.id}/password`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { currentPassword: 'TestPass123!', newPassword: 'NewPass456!' },
    });
    expect(asAdmin.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id and /api/users/bulk
// ---------------------------------------------------------------------------
describe('DELETE /api/users', () => {
  it('admin deletes a user', async () => {
    const u = await createUser({ username: 'deleteme', email: 'deleteme@test.com' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('deleting a user cascades reset tokens', async () => {
    const PasswordResetToken = require('../../src/models/PasswordResetToken');
    const u = await createUser({ username: 'tokenowner', email: 'tokenowner@test.com' });
    await PasswordResetToken.create(u.id, 'reset', 1);

    const db = getPool();
    const before = await db.query('SELECT COUNT(*)::int AS c FROM password_reset_tokens WHERE user_id = $1', [u.id]);
    expect(before.rows[0].c).toBe(1);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/users/${u.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(200);

    const after = await db.query('SELECT COUNT(*)::int AS c FROM password_reset_tokens WHERE user_id = $1', [u.id]);
    expect(after.rows[0].c).toBe(0);
  });

  it('returns 404 for non-existent user; admin cannot delete self; AM/user get 403', async () => {
    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/users/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(missing.statusCode).toBe(404);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminUser = JSON.parse(listRes.body).users.find((u) => u.username === 'admin');
    const self = await app.inject({
      method: 'DELETE',
      url: `/api/users/${adminUser.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(self.statusCode).toBe(400);
    expect(JSON.parse(self.body).error).toMatch(/own account/i);

    const u = await createUser({ username: 'protected', email: 'protected@test.com' });
    for (const token of [amToken, userToken]) {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/users/${u.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('admin bulk deletes users; validation errors covered', async () => {
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

    const empty = await app.inject({
      method: 'DELETE',
      url: '/api/users/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [] },
    });
    expect(empty.statusCode).toBe(400);

    const invalid = await app.inject({
      method: 'DELETE',
      url: '/api/users/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: ['not-a-uuid'] },
    });
    expect(invalid.statusCode).toBe(400);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/users?role=admin',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const adminUser = JSON.parse(listRes.body).users.find((u) => u.username === 'admin');
    const withSelf = await app.inject({
      method: 'DELETE',
      url: '/api/users/bulk',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ids: [adminUser.id] },
    });
    expect(withSelf.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/import
// ---------------------------------------------------------------------------
describe('POST /api/users/import', () => {
  it('requires a valid subjectId', async () => {
    for (const subjectId of [undefined, 'not-a-uuid']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/users/import',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          users: [{ username: 'imp1', email: 'imp1@test.com', firstName: 'Imp', lastName: 'One' }],
          subjectId,
          sendSetupEmail: false,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Subject is required');
    }
  });

  it('returns 404 for unknown subject', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'imp1', email: 'imp1@test.com', firstName: 'Imp', lastName: 'One' }],
        subjectId: '00000000-0000-0000-0000-000000000000',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('admin imports new users and they are enrolled in the subject', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [
          { username: 'imp1', email: 'imp1@test.com', firstName: 'Imp', lastName: 'One' },
          { username: 'imp2', email: 'imp2@test.com', firstName: 'Imp', lastName: 'Two' },
        ],
        subjectId: subject1.id,
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.errors).toHaveLength(0);

    const db = getPool();
    const rows = await db.query(
      `SELECT COUNT(*)::int AS c FROM user_subjects us
       JOIN users u ON u.id = us.user_id
       WHERE us.subject_id = $1 AND u.username IN ('imp1', 'imp2')`,
      [subject1.id]
    );
    expect(rows.rows[0].c).toBe(2);
  });

  it('skips existing users when conflictAction=skip', async () => {
    await createUser({ username: 'existing', email: 'existing@test.com' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'existing', email: 'existing@test.com', firstName: 'E', lastName: 'X' }],
        subjectId: subject1.id,
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skipped).toBe(1);
    expect(body.imported).toBe(0);
  });

  it('overwrites existing users when conflictAction=overwrite and enrols them', async () => {
    const existing = await createUser({ username: 'overwriteuser', email: 'overwrite@test.com', firstName: 'Old' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'overwriteuser', email: 'overwrite@test.com', firstName: 'New', lastName: 'Name' }],
        subjectId: subject1.id,
        conflictAction: 'overwrite',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).imported).toBe(1);

    const db = getPool();
    const rows = await db.query('SELECT COUNT(*)::int AS c FROM user_subjects WHERE user_id = $1 AND subject_id = $2', [
      existing.id,
      subject1.id,
    ]);
    expect(rows.rows[0].c).toBe(1);
  });

  it('cannot overwrite admin account via import', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'admin', email: 'admin@test.com', firstName: 'H', lastName: 'K' }],
        subjectId: subject1.id,
        conflictAction: 'overwrite',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).errors[0].reason).toMatch(/admin/i);
  });

  it('AM managing an assignment in the subject can import; unmanaged subject returns 403', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        users: [{ username: 'amimp1', email: 'amimp1@test.com', firstName: 'AM', lastName: 'Imp' }],
        subjectId: subject1.id,
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).imported).toBe(1);

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {
        users: [{ username: 'amimp2', email: 'amimp2@test.com', firstName: 'AM', lastName: 'Imp' }],
        subjectId: subject2.id,
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('returns 400 for empty users array and invalid conflictAction; 403 for regular user', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { users: [], subjectId: subject1.id, sendSetupEmail: false },
    });
    expect(empty.statusCode).toBe(400);

    const badAction = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'x', email: 'x@test.com', firstName: 'X', lastName: 'Y' }],
        subjectId: subject1.id,
        conflictAction: 'merge',
        sendSetupEmail: false,
      },
    });
    expect(badAction.statusCode).toBe(400);
    expect(JSON.parse(badAction.body).error).toMatch(/conflictAction/i);

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        users: [{ username: 'x', email: 'x@test.com', firstName: 'X', lastName: 'Y' }],
        subjectId: subject1.id,
        sendSetupEmail: false,
      },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('detects duplicate emails within the same batch', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [
          { username: 'dup1', email: 'same@test.com', firstName: 'Dup', lastName: 'One' },
          { username: 'dup2', email: 'same@test.com', firstName: 'Dup', lastName: 'Two' },
        ],
        subjectId: subject1.id,
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(1);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0].reason).toMatch(/email/i);
  });

  it('detects within-batch duplicate studentId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [
          { username: 'sidnew1', email: 'sidnew1@test.com', firstName: 'S', lastName: 'One', studentId: 'SBATCH1' },
          { username: 'sidnew2', email: 'sidnew2@test.com', firstName: 'S', lastName: 'Two', studentId: 'SBATCH1' },
        ],
        subjectId: subject1.id,
        conflictAction: 'skip',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(1);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0].reason).toMatch(/student id/i);
  });

  it('rejects overwrite when the new email belongs to another existing user', async () => {
    const userA = await createUser({ username: 'ovrA', email: 'a@test.com' });
    await createUser({ username: 'ovrB', email: 'b@test.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        users: [{ username: 'ovrA', email: 'b@test.com', firstName: 'A', lastName: 'Overwrite' }],
        subjectId: subject1.id,
        conflictAction: 'overwrite',
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.imported).toBe(0);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0].reason).toMatch(/email already in use/i);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/users/${userA.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(getRes.body).user.email).toBe('a@test.com');
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/send-setup-emails
// ---------------------------------------------------------------------------
describe('POST /api/users/send-setup-emails', () => {
  async function createPendingUser(username, email, subjectId = null) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username,
        email,
        firstName: 'P',
        lastName: 'User',
        subjectIds: [subjectId || subject1.id],
        sendSetupEmail: false,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).user;
  }

  it('admin can send setup emails to all pending users', async () => {
    await createPendingUser('pending1', 'pending1@test.com');
    await createPendingUser('pending2', 'pending2@test.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).sent).toBeGreaterThanOrEqual(2);
  });

  it('admin can send to specific userIds list', async () => {
    const u = await createPendingUser('specific1', 'specific1@test.com');
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [u.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).sent).toBe(1);
  });

  it('silently skips non-pending users in userIds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [user1.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).sent).toBe(0);
  });

  it('returns 401 without token and 403 for regular user', async () => {
    const noToken = await app.inject({ method: 'POST', url: '/api/users/send-setup-emails', payload: {} });
    expect(noToken.statusCode).toBe(401);
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {},
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('AM can send to explicit targets in managed subjects; any out-of-scope target returns 403', async () => {
    const inScope = await createPendingUser('ampendin', 'ampendin@test.com');
    const outScope = await createPendingUser('ampendout', 'ampendout@test.com', subject2.id);

    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { userIds: [inScope.id, outScope.id] },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(JSON.parse(forbidden.body).error).toBe('Forbidden: user is not in a subject you manage');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${amToken}` },
      payload: { userIds: [inScope.id] },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).sent).toBe(1);
  });

  it('AM all-pending mode only sends to pending users of managed subjects', async () => {
    await createPendingUser('ampendall1', 'ampendall1@test.com');
    await createPendingUser('ampendall2', 'ampendall2@test.com', subject2.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${amToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).sent).toBe(1);
  });

  it('validates userIds (max 500, valid UUIDs)', async () => {
    const fakeIds = Array.from({ length: 501 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    const tooMany = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: fakeIds },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(JSON.parse(tooMany.body).error).toMatch(/500/);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/users/send-setup-emails',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: ['not-a-uuid'] },
    });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body).error).toMatch(/invalid/i);
  });
});
