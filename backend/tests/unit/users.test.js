// Mock models at the top level
jest.mock('../../src/models/User');
jest.mock('../../src/models/Group');
jest.mock('../../src/models/Role');
jest.mock('../../src/models/Subject');
jest.mock('../../src/models/Assignment');
jest.mock('../../src/models/UserGroup');
jest.mock('../../src/models/PasswordResetToken', () => ({
  create: jest.fn(),
  findByToken: jest.fn(),
  markUsed: jest.fn(),
  deleteStaleForUser: jest.fn(),
  deleteExpired: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../src/services/email', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendPasswordSetupEmail: jest.fn(),
  sendEmail: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn() },
  maskEmail: (e) => e,
  maskName: (n) => n,
  maskToken: (t) => t,
  maskStudentId: (s) => s,
  redactMeta: (m) => m,
}));

const User = require('../../src/models/User');
const Group = require('../../src/models/Group');
const Role = require('../../src/models/Role');
const Subject = require('../../src/models/Subject');
const Assignment = require('../../src/models/Assignment');
const UserGroup = require('../../src/models/UserGroup');
const PasswordResetToken = require('../../src/models/PasswordResetToken');
const { sendPasswordResetEmail, sendPasswordSetupEmail } = require('../../src/services/email');

describe('Users Routes', () => {
  const SUBJECT_ID = '30000000-0000-4000-8000-000000000001';
  const SUBJECT_ID_2 = '30000000-0000-4000-8000-000000000002';
  const ASSIGNMENT_ID = '40000000-0000-4000-8000-000000000001';
  const ASSIGNMENT_ID_2 = '40000000-0000-4000-8000-000000000002';
  const GROUP_ID = '10000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockFastify = (options = {}) => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    checkRole: jest.fn().mockResolvedValue(options.checkRoleResult ?? true),
    requireAdmin: jest.fn().mockResolvedValue(options.requireAdminResult ?? true),
    requireAssignmentManager: jest.fn().mockResolvedValue(options.requireAssignmentManagerResult ?? true),
    assertManagesAssignment: jest.fn().mockResolvedValue(options.assertManagesAssignmentResult ?? true),
  });

  const captureHandlers = (mockFastify) => {
    const handlers = {};
    const wrapMethod = (method) => {
      mockFastify[method].mockImplementation((path, ...args) => {
        const config = args[0];
        const handler = args.find((a) => typeof a === 'function');
        if (config && config.preHandler) {
          handlers[`${path}_${method}_pre`] = config.preHandler;
        }
        if (handler) {
          handlers[`${path}_${method}`] = handler;
        }
      });
    };
    wrapMethod('get');
    wrapMethod('post');
    wrapMethod('put');
    wrapMethod('delete');
    return handlers;
  };

  describe('GET /users', () => {
    it('rejects unauthenticated request', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/users_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('rejects non-admin callers (assignment managers included) via requireAdmin', async () => {
      const mockFastify = createMockFastify({ requireAdminResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { role: 'assignment_manager' } };
      const result = await handlers['/users_get_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns all users enriched with subjects and memberships (batch queries)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockResolvedValue([
        { id: '00000000-0000-4000-8000-000000000001', username: 'user1', email: 'user1@test.com' },
        { id: '00000000-0000-4000-8000-000000000002', username: 'user2', email: 'user2@test.com' },
      ]);
      Subject.findForUsers.mockResolvedValue([
        { user_id: '00000000-0000-4000-8000-000000000001', id: SUBJECT_ID, name: 'Subject A' },
      ]);
      UserGroup.findMembershipsForUsers.mockResolvedValue([
        {
          user_id: '00000000-0000-4000-8000-000000000001',
          assignment_id: ASSIGNMENT_ID,
          assignment_name: 'A1',
          subject_id: SUBJECT_ID,
          subject_name: 'Subject A',
          group_id: GROUP_ID,
          group_name: 'Team Alpha',
        },
      ]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({ user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' } }, mockReply);
      expect(User.findAll).toHaveBeenCalled();
      expect(Subject.findForUsers).toHaveBeenCalledWith([
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ]);
      expect(UserGroup.findMembershipsForUsers).toHaveBeenCalledWith([
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ]);
      expect(mockReply.send).toHaveBeenCalledWith({
        users: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'user1',
            email: 'user1@test.com',
            subjects: [{ id: SUBJECT_ID, name: 'Subject A' }],
            memberships: [
              {
                assignment_id: ASSIGNMENT_ID,
                assignment_name: 'A1',
                subject_id: SUBJECT_ID,
                subject_name: 'Subject A',
                group_id: GROUP_ID,
                group_name: 'Team Alpha',
              },
            ],
          },
          {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'user2',
            email: 'user2@test.com',
            subjects: [],
            memberships: [],
          },
        ],
      });
    });

    it('passes subjectId, assignmentId and groupId filters through to User.findAll', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockResolvedValue([]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          query: { subjectId: SUBJECT_ID, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID },
        },
        mockReply
      );
      expect(User.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: SUBJECT_ID, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID })
      );
    });

    it('rejects invalid subjectId filter', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' }, query: { subjectId: 'not-a-uuid' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subjectId filter' });
      expect(User.findAll).not.toHaveBeenCalled();
    });

    it('rejects invalid assignmentId filter', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' }, query: { assignmentId: 'nope' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid assignmentId filter' });
      expect(User.findAll).not.toHaveBeenCalled();
    });

    it("returns 400 when groupId is 'none' without assignmentId", async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' }, query: { groupId: 'none' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'assignmentId is required when filtering ungrouped users' });
      expect(User.findAll).not.toHaveBeenCalled();
    });

    it("allows groupId 'none' when assignmentId is provided", async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockResolvedValue([]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          query: { groupId: 'none', assignmentId: ASSIGNMENT_ID },
        },
        mockReply
      );
      expect(User.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'none', assignmentId: ASSIGNMENT_ID })
      );
      expect(mockReply.send).toHaveBeenCalledWith({ users: [] });
    });

    it('never sets managedBy — the route is admin-only since the AM authorization tightening', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockResolvedValue([]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      // Even if a request with an AM role reached the handler, no scoping is applied
      await handlers['/users_get'](
        { user: { id: '00000000-0000-4000-8000-000000000042', role: 'assignment_manager' }, query: {} },
        mockReply
      );
      const filters = User.findAll.mock.calls[0][0];
      expect(filters.managedBy).toBeUndefined();
    });

    it('does not set managedBy for admin callers', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockResolvedValue([]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' }, query: {} },
        mockReply
      );
      const filters = User.findAll.mock.calls[0][0];
      expect(filters.managedBy).toBeUndefined();
    });

    it('rejects invalid status filter', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({ query: { status: 'invalid_status' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid status filter' });
      expect(User.findAll).not.toHaveBeenCalled();
    });

    it('rejects invalid role filter', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({ query: { role: 'superuser' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid role filter' });
      expect(User.findAll).not.toHaveBeenCalled();
    });

    it('rejects invalid groupId filter', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({ query: { groupId: 'not-a-uuid' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid groupId filter' });
      expect(User.findAll).not.toHaveBeenCalled();
    });

    it('handles error when fetching users', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_get']({}, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /users/:id', () => {
    const SELF_ID = '00000000-0000-4000-8000-000000000001';
    const OTHER_ID = '00000000-0000-4000-8000-000000000002';

    /** Run the GET /users/:id preHandler for one caller/target pair. */
    const runGetPreHandler = async (user, targetId = OTHER_ID) => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get_pre']({ user, params: { id: targetId } }, mockReply);
      return mockReply;
    };

    it('lets a user view their own profile', async () => {
      const reply = await runGetPreHandler({ id: SELF_ID, role: 'user' }, SELF_ID);
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('forbids a regular user from viewing another user', async () => {
      const reply = await runGetPreHandler({ id: SELF_ID, role: 'user' });
      expect(reply.code).toHaveBeenCalledWith(403);
    });

    it('lets an admin view any user', async () => {
      const reply = await runGetPreHandler({ id: SELF_ID, role: 'admin' });
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('lets an assignment_manager view a user inside a subject they manage', async () => {
      Assignment.managesAnySubjectOfUser.mockResolvedValue(true);
      const reply = await runGetPreHandler({ id: SELF_ID, role: 'assignment_manager' });
      expect(Assignment.managesAnySubjectOfUser).toHaveBeenCalledWith(SELF_ID, OTHER_ID);
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('forbids an assignment_manager from viewing an out-of-scope user', async () => {
      Assignment.managesAnySubjectOfUser.mockResolvedValue(false);
      const reply = await runGetPreHandler({ id: SELF_ID, role: 'assignment_manager' });
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: Insufficient permissions' });
    });

    it('returns user by id enriched with subjects and memberships', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'hash',
      });
      const subjects = [{ id: SUBJECT_ID, name: 'Subject 1' }];
      const memberships = [
        {
          assignment_id: ASSIGNMENT_ID,
          assignment_name: 'Assignment 1',
          subject_id: SUBJECT_ID,
          subject_name: 'Subject 1',
          group_id: GROUP_ID,
          group_name: 'Group 1',
        },
      ];
      Subject.findForUser.mockResolvedValue(subjects);
      UserGroup.findMembershipsForUser.mockResolvedValue(memberships);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '00000000-0000-4000-8000-000000000001' } }, mockReply);
      expect(User.findById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(Subject.findForUser).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(UserGroup.findMembershipsForUser).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
      expect(mockReply.send).toHaveBeenCalledWith({
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'testuser',
          email: 'test@test.com',
          subjects,
          memberships,
        },
      });
    });

    it('returns 404 when user does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '00000000-0000-4000-8000-000000000999' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('handles error when fetching user by id', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: '00000000-0000-4000-8000-000000000001' } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('returns 400 for invalid UUID in :id param (M5)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_get']({ params: { id: 'not-a-uuid' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });
  });

  describe('GET /users/:id - own profile', () => {
    it('allows user to view own profile', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000001' },
      };

      handlers['/users/:id_get_pre'](request, mockReply);

      expect(mockFastify.checkRole).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated request for /users/:id', () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      handlers['/users/:id_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });

  describe('POST /users', () => {
    beforeEach(() => {
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'Subject 1' });
      Subject.addUsers.mockResolvedValue(1);
      UserGroup.assignUserToGroup.mockResolvedValue();
      Assignment.managesAnyInSubject.mockResolvedValue(true);
    });

    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns reply when role check fails in preHandler', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' } };
      const result = await handlers['/users_post_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
      expect(result).toBe(mockReply);
    });

    it('rejects when required fields are missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { username: 'u1' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    const validCreateBody = {
      username: 'newuser',
      email: 'new@test.com',
      firstName: 'Test',
      lastName: 'User',
      subjectIds: ['30000000-0000-4000-8000-000000000001'],
    };

    it('rejects when firstName is missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { username: 'u1', email: 'u1@test.com', lastName: 'User' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when lastName is missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { username: 'u1', email: 'u1@test.com', firstName: 'Test' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('ignores password field — does not reject or use it', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, password: 'password123' } },
        mockReply
      );

      // Request succeeds — password is stripped by schema, not rejected
      expect(mockReply.code).toHaveBeenCalledWith(201);
      // User is always created with password: null regardless of what was submitted
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ password: null }));
    });

    it('rejects when username already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'existing',
      });
      User.findByEmail.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { ...validCreateBody, username: 'existing' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username already exists' });
    });

    it('rejects when email already exists', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        email: 'existing@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { ...validCreateBody, email: 'existing@test.com' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Email already exists' });
    });

    it('creates user as pending with null password and always sends setup email', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: 'S123',
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'setup-token' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { ...validCreateBody, studentId: 'S123' } }, mockReply);

      // Always creates with null password (no password allowed at creation time)
      expect(User.create).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@test.com',
        password: null,
        firstName: 'Test',
        lastName: 'User',
        studentId: 'S123',
        roleId: '20000000-0000-4000-8000-000000000003',
      });
      // Enrols the new user in every selected subject
      expect(Subject.addUsers).toHaveBeenCalledWith(SUBJECT_ID, ['00000000-0000-4000-8000-000000000001']);
      // Always sends setup email
      expect(PasswordResetToken.create).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'setup', 24);
      expect(sendPasswordSetupEmail).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('does not send setup email when sendSetupEmail is false', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, sendSetupEmail: false } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ password: null }));
      expect(PasswordResetToken.create).not.toHaveBeenCalled();
      expect(sendPasswordSetupEmail).not.toHaveBeenCalled();
    });

    it('sends setup email when sendSetupEmail is true', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, sendSetupEmail: true } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(PasswordResetToken.create).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'setup', 24);
      expect(sendPasswordSetupEmail).toHaveBeenCalled();
    });

    it('always sends setup email when creator is assignment_manager even if sendSetupEmail is false', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'assignment_manager' }, body: { ...validCreateBody, sendSetupEmail: false } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(sendPasswordSetupEmail).toHaveBeenCalled();
    });

    it('creates user with custom role when requester is admin', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000001', name: 'admin' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'adminuser',
        email: 'admin@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: { username: 'adminuser', email: 'admin@test.com', firstName: 'Test', lastName: 'User', role: 'admin' },
        },
        mockReply
      );

      expect(Role.findByName).toHaveBeenCalledWith('admin');
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('allows assignment_manager to create user with role user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          body: { ...validCreateBody, role: 'user' },
        },
        mockReply
      );

      expect(User.create).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('rejects assignment_manager from creating admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          body: { username: 'newadmin', email: 'admin@test.com', firstName: 'Test', lastName: 'User', role: 'admin' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Only admins can create admin or assignment manager users',
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('rejects assignment_manager from creating assignment_manager user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          body: {
            username: 'newam',
            email: 'am@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'assignment_manager',
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Only admins can create admin or assignment manager users',
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('rejects user creation with an invalid role', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: { ...validCreateBody, role: 'unknown' } }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.stringContaining('Invalid') });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('rejects role user without subjectIds', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const { subjectIds: _subjectIds, ...bodyWithoutSubjects } = validCreateBody;
      await handlers['/users_post']({ user: { role: 'admin' }, body: bodyWithoutSubjects }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject is required' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('rejects role user with empty subjectIds array', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, subjectIds: [] } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject is required' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 404 when a subject does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Subject.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ user: { role: 'admin' }, body: validCreateBody }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject not found' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 403 when an assignment manager creates a user in a subject they do not manage', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.managesAnyInSubject.mockResolvedValue(false);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'assignment_manager' }, body: validCreateBody },
        mockReply
      );

      expect(Assignment.managesAnyInSubject).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000099',
        validCreateBody.subjectIds[0]
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden: You do not manage any assignment in this subject',
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('allows an assignment manager to create a user in a subject they manage', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.managesAnyInSubject.mockResolvedValue(true);
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'setup-token' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'assignment_manager' }, body: validCreateBody },
        mockReply
      );

      expect(User.create).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('returns 400 when groupId is provided without assignmentId', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, groupId: GROUP_ID } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'assignmentId is required when groupId is provided' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the placement assignment does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Assignment not found' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 400 when the assignment does not belong to the selected subjects', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID_2 });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Assignment does not belong to the selected subjects' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the placement group does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Group.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group not found' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 400 when the group does not belong to the selected assignment', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Group.findById.mockResolvedValue({ id: GROUP_ID, assignment_id: ASSIGNMENT_ID_2 });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group does not belong to the selected assignment' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('creates user and places them in the requested group', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Group.findById.mockResolvedValue({ id: GROUP_ID, assignment_id: ASSIGNMENT_ID });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID } },
        mockReply
      );

      expect(UserGroup.assignUserToGroup).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', GROUP_ID, {
        replace: true,
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(expect.not.objectContaining({ warning: expect.anything() }));
    });

    it('returns 201 with a warning when group placement fails', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Group.findById.mockResolvedValue({ id: GROUP_ID, assignment_id: ASSIGNMENT_ID });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });
      const fullErr = new Error('Group is full');
      fullErr.statusCode = 409;
      UserGroup.assignUserToGroup.mockRejectedValue(fullErr);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        { user: { role: 'admin' }, body: { ...validCreateBody, assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User created successfully',
          warning: 'User created but group placement failed: Group is full',
        })
      );
    });

    it('creates assignment manager with assignmentIds and calls Assignment.addManagers', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000002', name: 'assignment_manager' });
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Assignment.addManagers.mockResolvedValue(1);
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000005',
        username: 'newam',
        email: 'am@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: {
            username: 'newam',
            email: 'am@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'assignment_manager',
            assignmentIds: [ASSIGNMENT_ID],
          },
        },
        mockReply
      );

      expect(Assignment.findById).toHaveBeenCalledWith(ASSIGNMENT_ID);
      expect(Assignment.addManagers).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000005', [ASSIGNMENT_ID]);
      expect(Subject.addUsers).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('returns 404 when an assignment manager assignmentId does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000002', name: 'assignment_manager' });
      Assignment.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: {
            username: 'newam',
            email: 'am@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'assignment_manager',
            assignmentIds: [ASSIGNMENT_ID],
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Assignment not found' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('ignores subjectIds and placement fields for assignment_manager role', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000002', name: 'assignment_manager' });
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000005',
        username: 'newam',
        email: 'am@test.com',
        student_id: null,
      });
      PasswordResetToken.create.mockResolvedValue({ token: 'tok' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          body: {
            username: 'newam',
            email: 'am@test.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'assignment_manager',
            subjectIds: [SUBJECT_ID],
            assignmentId: ASSIGNMENT_ID,
            groupId: GROUP_ID,
          },
        },
        mockReply
      );

      expect(Subject.addUsers).not.toHaveBeenCalled();
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('handles error when creating user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      User.create.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post']({ body: validCreateBody }, mockReply);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('returns 409 when User.create throws Postgres 23505 unique violation on student_id', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      User.findByStudentId.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_student_id_key' });
      User.create.mockRejectedValue(pgError);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            studentId: 'S12345',
            subjectIds: [SUBJECT_ID],
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Student ID already exists' });
    });

    it('returns 409 with generic message when User.create throws 23505 on unknown constraint', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findByUsername.mockResolvedValue(null);
      User.findByEmail.mockResolvedValue(null);
      Role.findByName.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000003', name: 'user' });
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_some_other_key' });
      User.create.mockRejectedValue(pgError);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users_post'](
        {
          body: {
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            subjectIds: [SUBJECT_ID],
          },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'A user with these details already exists' });
    });
  });

  describe('PUT /users/:id/group', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    const TARGET_USER_ID = '00000000-0000-4000-8000-000000000001';

    const makeGroupRequest = (body) => ({
      user: { id: '00000000-0000-4000-8000-000000000009', role: 'assignment_manager' },
      params: { id: TARGET_USER_ID },
      body,
    });

    const setupGroupMocks = () => {
      User.findById.mockResolvedValue({ id: TARGET_USER_ID, username: 'test' });
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'Assignment 1' });
      Group.findById.mockResolvedValue({ id: GROUP_ID, assignment_id: ASSIGNMENT_ID, name: 'Group 1' });
      UserGroup.assignUserToGroup.mockResolvedValue();
      UserGroup.remove.mockResolvedValue({ user_id: TARGET_USER_ID, assignment_id: ASSIGNMENT_ID });
    };

    it('returns 400 for invalid UUID in :id param', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        { params: { id: 'not-a-uuid' }, body: { assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });

    it('returns 400 when assignmentId is missing from the body', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](makeGroupRequest({ groupId: GROUP_ID }), mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('returns 400 when groupId is a non-null non-UUID string', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: 'not-a-uuid' }),
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid group ID' });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('returns 404 when target user not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      User.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns reply when requireAssignmentManager fails', async () => {
      const mockFastify = createMockFastify({ requireAssignmentManagerResult: false });
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID });
      const result = await handlers['/users/:id/group_put'](request, mockReply);

      expect(mockFastify.requireAssignmentManager).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('returns reply when assertManagesAssignment fails', async () => {
      const mockFastify = createMockFastify({ assertManagesAssignmentResult: false });
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID });
      const result = await handlers['/users/:id/group_put'](request, mockReply);

      expect(mockFastify.assertManagesAssignment).toHaveBeenCalledWith(request, mockReply, ASSIGNMENT_ID);
      expect(result).toBe(mockReply);
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('returns 404 when assignment not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      Assignment.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Assignment not found' });
    });

    it('removes user from group when groupId is null', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: null }),
        mockReply
      );

      expect(UserGroup.remove).toHaveBeenCalledWith(TARGET_USER_ID, ASSIGNMENT_ID);
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User removed from group',
        user: { id: TARGET_USER_ID, username: 'test', assignmentId: ASSIGNMENT_ID, groupId: null },
      });
    });

    it('returns 404 when group not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      Group.findById.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group not found' });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('returns 400 when group belongs to a different assignment', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      Group.findById.mockResolvedValue({ id: GROUP_ID, assignment_id: ASSIGNMENT_ID_2, name: 'Other Group' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group does not belong to the selected assignment' });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('assigns user to group successfully with replace semantics', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(UserGroup.assignUserToGroup).toHaveBeenCalledWith(TARGET_USER_ID, GROUP_ID, { replace: true });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User group updated successfully',
        user: { id: TARGET_USER_ID, username: 'test', assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID },
      });
    });

    it('maps 403 subject-membership error from assignUserToGroup', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      const err = new Error('User is not an active member of this subject');
      err.statusCode = 403;
      UserGroup.assignUserToGroup.mockRejectedValue(err);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User is not an active member of this subject' });
    });

    it('maps 409 group-full error from assignUserToGroup', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      const err = new Error('Group is full');
      err.statusCode = 409;
      UserGroup.assignUserToGroup.mockRejectedValue(err);
      const { logger: mockLogger } = require('../../src/utils/logger');

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group is full' });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('maps 404 error from assignUserToGroup', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      const err = new Error('Group not found');
      err.statusCode = 404;
      UserGroup.assignUserToGroup.mockRejectedValue(err);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('returns 500 on unexpected error', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      setupGroupMocks();
      UserGroup.assignUserToGroup.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/group_put'](
        makeGroupRequest({ assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }),
        mockReply
      );

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to update user group' });
    });
  });

  describe('PUT /users/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('allows user to edit own profile', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        role_name: 'user',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000001' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects non-admin editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: You can only edit your own profile' });
    });

    it('rejects assignment_manager editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        role_name: 'admin',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden: Assignment managers can only edit regular users',
      });
    });

    it('allows admin to edit another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        role_name: 'user',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      await handlers['/users/:id_put_pre'](request, mockReply);
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('returns 404 when user not found (targetUser missing)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000999' },
          body: {},
          // targetUser not set — simulates preHandler short-circuit
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('admin can update all fields including role and enabled', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'a0000000-0000-0000-0000-000000000001' });
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'oldname',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: { id: '00000000-0000-4000-8000-000000000002', username: 'oldname', role_name: 'user' },
          body: {
            email: 'new@test.com',
            firstName: undefined,
            lastName: undefined,
            studentId: undefined,
            role: 'admin',
            enabled: false,
          },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
        studentId: undefined,
        roleId: 'a0000000-0000-0000-0000-000000000001',
        enabled: false,
        status: 'inactive',
      });
    });

    it('assignment_manager can update basic fields of an in-scope user but not role/groupId', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.managesAnySubjectOfUser.mockResolvedValue(true);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'oldname',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'oldname',
            role_name: 'user',
            status: 'active',
          },
          body: {
            email: 'new@test.com',
            firstName: undefined,
            lastName: undefined,
            studentId: undefined,
            role: 'admin',
            groupId: '10000000-0000-4000-8000-000000000005',
          },
        },
        mockReply
      );

      // Scope check is a single query and counts suspended enrolments too
      expect(Assignment.managesAnySubjectOfUser).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002'
      );
      // role and groupId must be excluded
      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
        studentId: undefined,
      });
    });

    it('assignment_manager editing a user outside their managed subjects gets 403', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Subject.findForUser.mockResolvedValue([{ id: SUBJECT_ID_2, name: 'Subject B', membership_enabled: true }]);
      Assignment.managesAnyInSubject.mockResolvedValue(false);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: { id: '00000000-0000-4000-8000-000000000002', username: 'victim', role_name: 'user' },
          body: { email: 'new@test.com' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: user is not in a subject you manage' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('assignment_manager editing a user with zero subject enrolments gets 403', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Subject.findForUser.mockResolvedValue([]);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: { id: '00000000-0000-4000-8000-000000000002', username: 'nosubjects', role_name: 'user' },
          body: { email: 'new@test.com' },
        },
        mockReply
      );

      expect(Assignment.managesAnyInSubject).not.toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: user is not in a subject you manage' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('assignment_manager self-edit skips the managed-subject scope check', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'am1',
        email: 'me@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'am1',
            role_name: 'assignment_manager',
            status: 'active',
          },
          body: { email: 'me@test.com' },
        },
        mockReply
      );

      expect(Subject.findForUser).not.toHaveBeenCalled();
      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        expect.objectContaining({ email: 'me@test.com' })
      );
    });

    it('assignment_manager cannot set enabled — explicit 403 (admins only)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.managesAnySubjectOfUser.mockResolvedValue(true);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'oldname',
            role_name: 'user',
            status: 'active',
          },
          body: { email: 'new@test.com', enabled: false },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Only admins can enable or disable accounts' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('regular user self-edit can update studentId', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        student_id: 'S99999',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'testuser',
            role_name: 'user',
            status: 'active',
          },
          body: {
            email: 'test@test.com',
            studentId: 'S99999',
          },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        expect.objectContaining({ studentId: 'S99999' })
      );
      expect(mockReply.code).not.toHaveBeenCalledWith(expect.stringMatching(/^4/));
    });

    it('regular user self-edit cannot update role', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'testuser',
            role_name: 'user',
            status: 'active',
          },
          body: {
            email: 'test@test.com',
            role: 'admin',
          },
        },
        mockReply
      );

      // role must not be passed through for a regular user caller
      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        expect.not.objectContaining({ roleId: expect.anything(), enabled: expect.anything() })
      );
    });

    it('regular user self-edit with enabled in the body gets an explicit 403', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'testuser',
            role_name: 'user',
            status: 'active',
          },
          body: { email: 'test@test.com', enabled: false },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Only admins can enable or disable accounts' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('handles error when updating user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'oldname', role_name: 'user' },
          body: { email: 'new@test.com' },
        },
        mockReply
      );

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('prevents disabling the built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'admin',
            role_id: '20000000-0000-4000-8000-000000000001',
          },
          body: { enabled: false },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot disable the built-in admin account' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('prevents changing role of the built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'admin',
            role_name: 'admin',
            role_id: 'a0000000-0000-0000-0000-000000000001',
          },
          body: { role: 'user' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot change role of the built-in admin account' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('allows disabling a non-built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'otheradmin',
        enabled: false,
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'otheradmin',
            role_id: '20000000-0000-4000-8000-000000000001',
          },
          body: { enabled: false },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000002',
          username: 'otheradmin',
          enabled: false,
        }),
      });
    });

    it('sets status to inactive when disabling a user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        enabled: false,
        status: 'inactive',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'someuser',
            role_name: 'user',
            status: 'active',
          },
          body: { enabled: false },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({
          enabled: false,
          status: 'inactive',
        })
      );
    });

    it('restores status to active when re-enabling a previously inactive user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        enabled: true,
        status: 'active',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'someuser',
            role_name: 'user',
            status: 'inactive',
          },
          body: { enabled: true },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({
          enabled: true,
          status: 'active',
        })
      );
    });

    it('does not change status when re-enabling a pending user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        enabled: true,
        status: 'pending',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'pendinguser',
            role_name: 'user',
            status: 'pending',
          },
          body: { enabled: true },
        },
        mockReply
      );

      // status should not be changed for pending users
      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.not.objectContaining({
          status: 'active',
        })
      );
    });

    it('allows changing role of a non-built-in admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'b0000000-0000-0000-0000-000000000003' });
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'otheradmin',
        role_id: 'b0000000-0000-0000-0000-000000000003',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000002',
            username: 'otheradmin',
            role_name: 'admin',
            role_id: 'a0000000-0000-0000-0000-000000000001',
          },
          body: { role: 'user' },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({
          roleId: 'b0000000-0000-0000-0000-000000000003',
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000002',
          username: 'otheradmin',
          role_id: 'b0000000-0000-0000-0000-000000000003',
        }),
      });
    });

    it('allows updating built-in admin user email and name (but not role or enabled)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'admin',
        email: 'newadmin@example.com',
        first_name: 'New',
        last_name: 'Admin',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: {
            id: '00000000-0000-4000-8000-000000000001',
            username: 'admin',
            role_id: '20000000-0000-4000-8000-000000000001',
            role_name: 'admin',
          },
          body: {
            email: 'newadmin@example.com',
            firstName: 'New',
            lastName: 'Admin',
          },
        },
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        email: 'newadmin@example.com',
        firstName: 'New',
        lastName: 'Admin',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({
          username: 'admin',
          email: 'newadmin@example.com',
        }),
      });
    });

    it('prevents username change', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'oldusername', role_name: 'user' },
          body: { username: 'newusername' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Username cannot be changed' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('ignores student ID for admin users (only sets for regular users)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'adminuser',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'adminuser', role_name: 'admin' },
          body: { email: 'new@test.com', studentId: 'S12345' },
        },
        mockReply
      );

      // Should succeed but not include studentId in updates
      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001' }),
      });
    });

    it('ignores group ID for admin users (only sets for regular users)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'adminuser',
        email: 'new@test.com',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'adminuser', role_name: 'admin' },
          body: { email: 'new@test.com', groupId: '10000000-0000-4000-8000-000000000001' },
        },
        mockReply
      );

      // Should succeed but not include groupId in updates
      expect(User.update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        email: 'new@test.com',
        firstName: undefined,
        lastName: undefined,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'User updated successfully',
        user: expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001' }),
      });
    });

    it('returns 400 for invalid UUID in :id param (validated in preHandler)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put_pre'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: 'not-a-uuid' },
          body: {},
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });

    it('strips password_hash from PUT /users/:id response (C2)', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.update.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'secret-hash',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          targetUser: { id: '00000000-0000-4000-8000-000000000001', username: 'testuser', role_name: 'user' },
          body: { email: 'test@test.com' },
        },
        mockReply
      );

      const sentUser = mockReply.send.mock.calls[0][0].user;
      expect(sentUser).not.toHaveProperty('password_hash');
    });
  });

  describe('DELETE /users/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns reply when admin check fails in preHandler', async () => {
      const mockFastify = createMockFastify({ requireAdminResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };
      const result = await handlers['/users/:id_delete_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('rejects attempt to delete own account', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000002', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
      expect(User.delete).not.toHaveBeenCalled();
    });

    it('deletes user successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'otheruser',
      });
      User.delete.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'otheruser',
      });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(User.delete).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'User deleted successfully' });
    });

    it('refuses to delete the built-in admin account', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', username: 'admin' });

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot delete the built-in admin account' });
      expect(User.delete).not.toHaveBeenCalled();
    });

    it('returns 404 when user not found for deletion', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.delete.mockResolvedValue(null);

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000999' },
        },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('handles error when deleting user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', username: 'otheruser' });
      User.delete.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /users/:id - error handling', () => {
    it('handles database error when fetching user in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('Database error'));

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await expect(
        handlers['/users/:id_put_pre'](
          {
            user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
            params: { id: '00000000-0000-4000-8000-000000000001' },
          },
          mockReply
        )
      ).rejects.toThrow('Database error');

      expect(User.findById).toHaveBeenCalled();
    });
  });

  describe('PUT /users/:id/password', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('allows user to change own password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
        },
        mockReply
      );
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects non-admin changing another users password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('rejects admin changing another users password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put_pre'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: You can only change your own password' });
    });

    it('rejects password shorter than 6 characters', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'old', newPassword: '12345' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'New password must be at least 6 characters' });
    });

    it('rejects when current password is not provided', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when admin does not provide current password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'admin',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('rejects when current password is incorrect', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        password_hash: 'hashed',
      });
      User.verifyPassword.mockResolvedValue(false);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'wrong', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
    });

    it('successfully changes password with correct current password', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      User.findByUsername.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        password_hash: 'hashed',
      });
      User.verifyPassword.mockResolvedValue(true);
      User.updatePassword.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000001',
        username: 'testuser',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'correct', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(User.updatePassword).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'newpass123');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Password updated successfully' });
    });

    it('returns 404 when user not found', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000999' },
          body: { currentPassword: 'currentpass', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('handles server error', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockRejectedValue(new Error('Database error'));
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id/password_put'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000001' },
          body: { currentPassword: 'currentpass', newPassword: 'newpass123' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('registers with a per-route rate limit to prevent brute-force (code scanning alert #10)', () => {
      const mockFastify = createMockFastify();
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const putCall = mockFastify.put.mock.calls.find(([path]) => path === '/users/:id/password');
      expect(putCall).toBeDefined();
      const routeConfig = putCall[1];
      expect(routeConfig.config).toBeDefined();
      expect(routeConfig.config.rateLimit).toBeDefined();
      expect(routeConfig.config.rateLimit.max).toBeGreaterThan(0);
      expect(routeConfig.config.rateLimit.timeWindow).toBeDefined();
    });
  });

  describe('DELETE /users/:id - error handling', () => {
    it('handles error when deleting user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', username: 'otheruser' });
      User.delete.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');

      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});

      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/:id_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
          params: { id: '00000000-0000-4000-8000-000000000002' },
        },
        mockReply
      );

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /users/:id - preHandler permissions', () => {
    it('rejects regular user from editing another user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: You can only edit your own profile' });
    });

    it('allows admin to edit any user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', role_name: 'admin' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('allows assignment manager to edit regular user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', role_name: 'user' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('rejects assignment manager from editing admin user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', role_name: 'admin' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      const request = {
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'assignment_manager' },
        params: { id: '00000000-0000-4000-8000-000000000002' },
      };

      await handlers['/users/:id_put_pre'](request, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden: Assignment managers can only edit regular users',
      });
    });
  });

  describe('POST /users/import', () => {
    const makeImportRequest = (body, user = { id: '00000000-0000-4000-8000-000000000001', role: 'admin' }) => ({
      user,
      body: { subjectId: SUBJECT_ID, ...body },
    });

    beforeEach(() => {
      User.findByUsernames.mockResolvedValue([]);
      User.findByEmails.mockResolvedValue([]);
      User.findByStudentIds.mockResolvedValue([]);
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'Subject 1' });
      Subject.addUsers.mockResolvedValue(0);
      Assignment.managesAnyInSubject.mockResolvedValue(true);
    });

    it('returns 400 when subjectId is missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](
        makeImportRequest({
          subjectId: undefined,
          users: [{ username: 'u', email: 'e@e.com', firstName: 'F', lastName: 'L' }],
        }),
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject is required' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 400 when subjectId is not a valid UUID', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](
        makeImportRequest({
          subjectId: 'not-a-uuid',
          users: [{ username: 'u', email: 'e@e.com', firstName: 'F', lastName: 'L' }],
        }),
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject is required' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the subject does not exist', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Subject.findById.mockResolvedValue(null);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](
        makeImportRequest({ users: [{ username: 'u', email: 'e@e.com', firstName: 'F', lastName: 'L' }] }),
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject not found' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('returns 403 when assignment manager does not manage any assignment in the subject', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Assignment.managesAnyInSubject.mockResolvedValue(false);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const amUser = { id: '00000000-0000-4000-8000-000000000042', role: 'assignment_manager' };
      await handlers['/users/import_post'](
        makeImportRequest({ users: [{ username: 'u', email: 'e@e.com', firstName: 'F', lastName: 'L' }] }, amUser),
        mockReply
      );
      expect(Assignment.managesAnyInSubject).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000042', SUBJECT_ID);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Forbidden: You do not manage any assignment in this subject',
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('allows assignment manager who manages an assignment in the subject', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create.mockResolvedValue({ id: 'u2', username: 'newuser', email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const amUser = { id: '00000000-0000-4000-8000-000000000042', role: 'assignment_manager' };
      await handlers['/users/import_post'](
        makeImportRequest(
          { users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }] },
          amUser
        ),
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('does not check subject management for admin callers', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create.mockResolvedValue({ id: 'u2', username: 'newuser', email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }],
        }),
        mockReply
      );
      expect(Assignment.managesAnyInSubject).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('enrols created and overwritten users in the subject with a single addUsers call', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: 'u-existing',
        username: 'existing',
        email: 'ex@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      User.create.mockResolvedValue({ id: 'u-new', username: 'newuser', email: 'new@test.com' });
      User.update.mockResolvedValue({ ...existingUser });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' },
            { username: 'existing', email: 'ex@test.com', firstName: 'Ex', lastName: 'User' },
          ],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(Subject.addUsers).toHaveBeenCalledTimes(1);
      expect(Subject.addUsers).toHaveBeenCalledWith(SUBJECT_ID, ['u-new', 'u-existing']);
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 2, skipped: 0, errors: [] });
    });

    it('does not enrol users when nothing was imported', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsernames.mockResolvedValue([
        {
          id: 'u-existing',
          username: 'existing',
          email: 'ex@test.com',
          student_id: null,
          role_name: 'user',
        },
      ]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'ex@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'skip',
        }),
        mockReply
      );

      expect(Subject.addUsers).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 0, skipped: 1, errors: [] });
    });

    it('rejects unauthenticated request', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('rejects user without admin/assignment_manager role', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 'u1', role: 'user' } };
      const result = await handlers['/users/import_post_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
      expect(result).toBe(mockReply);
    });

    it('returns 400 when users array is empty', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](makeImportRequest({ users: [] }), mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No users to import' });
    });

    it('returns 400 when users is not an array', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/import_post'](makeImportRequest({ users: null }), mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('imports new users successfully', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      // Empty batch results — no existing user with this username/email/studentId
      User.create.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000002',
        username: 'newuser',
        email: 'new@test.com',
      });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }],
        }),
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'newuser', email: 'new@test.com', password: null })
      );
      expect(Subject.addUsers).toHaveBeenCalledWith(SUBJECT_ID, ['00000000-0000-4000-8000-000000000002']);
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('performs exactly 3 batch DB queries for a valid import', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create
        .mockResolvedValueOnce({ id: 'u1', username: 'user1', email: 'u1@test.com' })
        .mockResolvedValueOnce({ id: 'u2', username: 'user2', email: 'u2@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'user1', email: 'u1@test.com', firstName: 'A', lastName: 'B' },
            { username: 'user2', email: 'u2@test.com', firstName: 'C', lastName: 'D' },
          ],
        }),
        mockReply
      );

      expect(User.findByUsernames).toHaveBeenCalledTimes(1);
      expect(User.findByEmails).toHaveBeenCalledTimes(1);
      expect(User.findByStudentIds).toHaveBeenCalledTimes(1);
      expect(User.create).toHaveBeenCalledTimes(2);
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 2, skipped: 0, errors: [] });
    });

    it('sends setup email when sendSetupEmail is true', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const newUser = { id: 'u2', username: 'newuser', email: 'new@test.com' };
      User.create.mockResolvedValue(newUser);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'rawtoken123' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }],
          sendSetupEmail: true,
        }),
        mockReply
      );

      expect(PasswordResetToken.deleteStaleForUser).toHaveBeenCalledWith('u2');
      expect(PasswordResetToken.create).toHaveBeenCalledWith('u2', 'setup', 24);
      expect(sendPasswordSetupEmail).toHaveBeenCalledWith(newUser, 'rawtoken123');
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('does not send setup email by default', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create.mockResolvedValue({ id: 'u2', username: 'newuser', email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' }],
        }),
        mockReply
      );

      expect(sendPasswordSetupEmail).not.toHaveBeenCalled();
    });

    it('skips existing user when conflictAction is skip', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsernames.mockResolvedValue([
        {
          id: '00000000-0000-4000-8000-000000000002',
          username: 'existing',
          email: 'existing@test.com',
          student_id: null,
          role_name: 'user',
        },
      ]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'existing@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'skip',
        }),
        mockReply
      );

      expect(User.create).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 0, skipped: 1, errors: [] });
    });

    it('overwrites existing user when conflictAction is overwrite', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'existing',
        email: 'old@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      // No email/studentId conflicts
      User.update.mockResolvedValue({ ...existingUser, email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'new@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({ email: 'new@test.com', firstName: 'Ex', lastName: 'User' })
      );
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('clears studentId when not mapped in CSV during overwrite', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'existing',
        email: 'existing@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      User.update.mockResolvedValue({ ...existingUser, email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      // Row has no studentId property (unmapped column)
      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'new@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({ studentId: null })
      );
    });

    it('preserves studentId when mapped in CSV during overwrite', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'existing',
        email: 'existing@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      User.update.mockResolvedValue({ ...existingUser, email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'existing', email: 'new@test.com', firstName: 'Ex', lastName: 'User', studentId: 'S456' },
          ],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000002',
        expect.objectContaining({ studentId: 'S456' })
      );
    });

    it('protects admin/assignment_manager accounts from overwrite', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsernames.mockResolvedValue([
        {
          id: 'u2',
          username: 'admin',
          email: 'admin@test.com',
          student_id: null,
          role_name: 'admin',
        },
      ]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'admin', email: 'admin@test.com', firstName: 'Ad', lastName: 'Min' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [
          {
            row: 1,
            identifier: 'admin',
            reason: 'Cannot overwrite admin or assignment manager account',
          },
        ],
      });
    });

    it('records error for rows with missing required fields', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'nomail', firstName: 'No', lastName: 'Mail' }],
        }),
        mockReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'nomail', reason: 'Missing or invalid required fields' }],
      });
    });

    it('records error when both firstName and lastName are missing', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'noname', email: 'noname@test.com' }],
        }),
        mockReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'noname', reason: 'Missing or invalid required fields' }],
      });
    });

    it('imports user with only firstName and defaults lastName to "-"', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create.mockResolvedValue({ id: 'u1', username: 'fnonly', email: 'fn@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'fnonly', email: 'fn@test.com', firstName: 'Alice' }],
        }),
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Alice', lastName: '-' }));
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('imports user with only lastName and defaults firstName to "-"', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create.mockResolvedValue({ id: 'u1', username: 'lnonly', email: 'ln@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'lnonly', email: 'ln@test.com', lastName: 'Smith' }],
        }),
        mockReply
      );

      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ firstName: '-', lastName: 'Smith' }));
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('catches within-batch duplicate email via map-sync after create', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      // Batch lookups return empty — neither user exists yet
      User.create.mockResolvedValueOnce({ id: 'u1', username: 'alice', email: 'same@test.com', student_id: null });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'alice', email: 'same@test.com', firstName: 'Alice', lastName: 'A' },
            { username: 'bob', email: 'same@test.com', firstName: 'Bob', lastName: 'B' },
          ],
        }),
        mockReply
      );

      // First row created, second caught by the synced emailMap — not by a DB constraint
      expect(User.create).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 1,
        skipped: 0,
        errors: [{ row: 2, identifier: 'bob', reason: 'Email already in use by another user' }],
      });
    });

    it('catches within-batch duplicate studentId via map-sync after create', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create.mockResolvedValueOnce({ id: 'u1', username: 'alice', email: 'a@test.com', student_id: 'S100' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'alice', email: 'a@test.com', firstName: 'Alice', lastName: 'A', studentId: 'S100' },
            { username: 'bob', email: 'b@test.com', firstName: 'Bob', lastName: 'B', studentId: 'S100' },
          ],
        }),
        mockReply
      );

      expect(User.create).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 1,
        skipped: 0,
        errors: [{ row: 2, identifier: 'bob', reason: 'Student ID already in use by another user' }],
      });
    });

    it('map-sync uses role_name from roleRecord not a hardcoded string', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      // Simulate a role whose name differs from 'user' to confirm no hardcoding
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'student' });
      User.create.mockResolvedValueOnce({ id: 'u1', username: 'alice', email: 'a@test.com', student_id: null });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'alice', email: 'a@test.com', firstName: 'Alice', lastName: 'A' },
            { username: 'bob', email: 'a@test.com', firstName: 'Bob', lastName: 'B' },
          ],
        }),
        mockReply
      );

      // Second row has same email — caught by map-sync; role_name from roleRecord means the
      // 'student' role_name does not accidentally satisfy the admin/AM guard, so the error
      // is the expected duplicate-email reason (not silently skipped or misclassified)
      expect(User.create).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 1,
        skipped: 0,
        errors: [{ row: 2, identifier: 'bob', reason: 'Email already in use by another user' }],
      });
    });

    it('returns errors sorted by row number when validation and processing errors are interleaved', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      // Row 1: valid schema, but User.create throws a duplicate-entry DB error → error row 1 (second pass)
      // Row 2: fails Zod validation → error row 2 (first pass)
      // Without the sort, errors would be [row 2, row 1]; with sort they should be [row 1, row 2]
      const dbError = Object.assign(new Error('unique violation'), { code: '23505' });
      User.create.mockRejectedValueOnce(dbError);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'alice', email: 'a@test.com', firstName: 'Alice', lastName: 'A' }, // row 1: valid but DB error
            { username: '', email: 'not-an-email', firstName: '', lastName: '' }, // row 2: schema error
          ],
        }),
        mockReply
      );

      const result = mockReply.send.mock.calls[0][0];
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].row).toBe(1);
      expect(result.errors[1].row).toBe(2);
    });

    it('detects email conflict after overwrite changes an existing user email', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: 'u2',
        username: 'existing',
        email: 'old@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      User.update.mockResolvedValue({ ...existingUser, email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      // Row 1 overwrites 'existing' to use 'new@test.com'; row 2 tries to create a user with the same email
      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'existing', email: 'new@test.com', firstName: 'Ex', lastName: 'User' },
            { username: 'newcomer', email: 'new@test.com', firstName: 'New', lastName: 'User' },
          ],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).toHaveBeenCalledTimes(1);
      expect(User.create).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 1,
        skipped: 0,
        errors: [{ row: 2, identifier: 'newcomer', reason: 'Email already in use by another user' }],
      });
    });

    it('records error for row-level database failures', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.create.mockRejectedValue(new Error('DB constraint violation'));
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'baduser', email: 'bad@test.com', firstName: 'Bad', lastName: 'User' }],
        }),
        mockReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'baduser', reason: 'Processing failed' }],
      });
    });

    it('handles mix of new, skipped, and errored rows', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      // Batch returns 'existing' user; 'newuser' and invalid row are not in DB
      User.findByUsernames.mockResolvedValue([
        {
          id: 'u2',
          username: 'existing',
          email: 'ex@test.com',
          student_id: null,
          role_name: 'user',
        },
      ]);
      User.create.mockResolvedValue({ id: 'u3', username: 'newuser', email: 'new@test.com' });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User' },
            { username: 'existing', email: 'ex@test.com', firstName: 'Ex', lastName: 'User' },
            { username: 'incomplete' }, // missing email/firstName/lastName
          ],
          conflictAction: 'skip',
        }),
        mockReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 1,
        skipped: 1,
        errors: [{ row: 3, identifier: 'incomplete', reason: 'Missing or invalid required fields' }],
      });
    });

    it('handles top-level errors with 500', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockRejectedValue(new Error('DB down'));
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({ users: [{ username: 'u', email: 'e@e.com', firstName: 'F', lastName: 'L' }] }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('returns 500 when batch lookup fails', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByUsernames.mockRejectedValue(new Error('DB down'));
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({ users: [{ username: 'u', email: 'e@e.com', firstName: 'F', lastName: 'L' }] }),
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('errors when new user email conflicts with existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      // 'newuser' not in usernameMap, but 'taken@test.com' is in emailMap (owned by 'other')
      User.findByEmails.mockResolvedValue([{ id: 'other', email: 'taken@test.com' }]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'newuser', email: 'taken@test.com', firstName: 'New', lastName: 'User' }],
        }),
        mockReply
      );

      expect(User.create).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'newuser', reason: 'Email already in use by another user' }],
      });
    });

    it('errors when new user student ID conflicts with existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      User.findByStudentIds.mockResolvedValue([{ id: 'other', student_id: 'S123' }]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [
            { username: 'newuser', email: 'new@test.com', firstName: 'New', lastName: 'User', studentId: 'S123' },
          ],
        }),
        mockReply
      );

      expect(User.create).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'newuser', reason: 'Student ID already in use by another user' }],
      });
    });

    it('errors when overwrite email conflicts with a different existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: 'u2',
        username: 'existing',
        email: 'old@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      // A different user (u3) owns 'taken@test.com'
      User.findByEmails.mockResolvedValue([{ id: 'u3', email: 'taken@test.com' }]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'taken@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'existing', reason: 'Email already in use by another user' }],
      });
    });

    it('allows overwrite when email belongs to the same existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: 'u2',
        username: 'existing',
        email: 'same@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      // The same user owns 'same@test.com'
      User.findByEmails.mockResolvedValue([{ id: 'u2', email: 'same@test.com' }]);
      User.update.mockResolvedValue({ ...existingUser });
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'same@test.com', firstName: 'Ex', lastName: 'User' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: 0, errors: [] });
    });

    it('errors when overwrite student ID conflicts with a different existing user', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      Role.findByName.mockResolvedValue({ id: 'r1', name: 'user' });
      const existingUser = {
        id: 'u2',
        username: 'existing',
        email: 'ex@test.com',
        student_id: null,
        role_name: 'user',
      };
      User.findByUsernames.mockResolvedValue([existingUser]);
      // A different user (u3) owns student ID 'S123'
      User.findByStudentIds.mockResolvedValue([{ id: 'u3', student_id: 'S123' }]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/import_post'](
        makeImportRequest({
          users: [{ username: 'existing', email: 'ex@test.com', firstName: 'Ex', lastName: 'User', studentId: 'S123' }],
          conflictAction: 'overwrite',
        }),
        mockReply
      );

      expect(User.update).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, identifier: 'existing', reason: 'Student ID already in use by another user' }],
      });
    });
  });

  describe('POST /users/send-setup-emails', () => {
    it('rejects unauthenticated request', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      await handlers['/users/send-setup-emails_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('rejects user without admin/assignment_manager role', async () => {
      const mockFastify = createMockFastify({ checkRoleResult: false });
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const request = { user: { id: 'u1', role: 'user' } };
      const result = await handlers['/users/send-setup-emails_post_pre'](request, mockReply);
      expect(mockFastify.checkRole).toHaveBeenCalledWith(request, mockReply, ['admin', 'assignment_manager']);
      expect(result).toBe(mockReply);
    });

    it('rejects when userIds exceeds 500', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      const userIds = Array.from(
        { length: 501 },
        (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000001`
      );
      await handlers['/users/send-setup-emails_post'](
        { user: { id: 'admin1', role: 'admin' }, body: { userIds } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Cannot send more than 500 setup emails per request' });
    });

    it('sends setup emails to all pending users when no userIds provided', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const pendingUsers = [
        { id: 'u1', username: 'pending1', status: 'pending' },
        { id: 'u2', username: 'pending2', status: 'pending' },
      ];
      User.findAll.mockResolvedValue(pendingUsers);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockResolvedValue(true);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post']({ user: { id: 'admin1', role: 'admin' }, body: {} }, mockReply);

      expect(User.findAll).toHaveBeenCalledWith({ status: 'pending' });
      expect(sendPasswordSetupEmail).toHaveBeenCalledTimes(2);
      expect(mockReply.send).toHaveBeenCalledWith({ sent: 2, errors: [] });
    });

    it('sends setup emails only to specified pending userIds', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const uid1 = '11111111-0000-4000-8000-000000000001';
      const uid2 = '11111111-0000-4000-8000-000000000002';
      User.findByIds.mockResolvedValue([
        { id: uid1, username: 'pending1', status: 'pending' },
        { id: uid2, username: 'active1', status: 'active' },
      ]);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockResolvedValue(true);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post'](
        { user: { id: 'admin1', role: 'admin' }, body: { userIds: [uid1, uid2] } },
        mockReply
      );

      // Only uid1 is pending, so only 1 email sent
      expect(User.findByIds).toHaveBeenCalledWith([uid1, uid2]);
      expect(sendPasswordSetupEmail).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith({ sent: 1, errors: [] });
    });

    it('reports errors for failed email sends', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const pendingUsers = [{ id: 'u1', username: 'pending1', status: 'pending' }];
      User.findAll.mockResolvedValue(pendingUsers);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockRejectedValue(new Error('SMTP down'));
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post']({ user: { id: 'admin1', role: 'admin' }, body: {} }, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        sent: 0,
        errors: [{ userId: 'u1', username: 'pending1', reason: 'Failed to send email' }],
      });
    });

    it('handles top-level errors with 500', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      User.findAll.mockRejectedValue(new Error('DB down'));
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post']({ user: { id: 'admin1', role: 'admin' }, body: {} }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('AM can send to explicit targets when every target is enrolled in a managed subject', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const amId = '22222222-0000-4000-8000-000000000001';
      const uid1 = '11111111-0000-4000-8000-000000000001';
      Assignment.findManagedBy.mockResolvedValue([{ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID }]);
      User.findByIds.mockResolvedValue([{ id: uid1, username: 'pending1', status: 'pending' }]);
      Subject.findForUsers.mockResolvedValue([
        { user_id: uid1, id: SUBJECT_ID, name: 'Subject A', membership_enabled: false },
      ]);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockResolvedValue(true);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post'](
        { user: { id: amId, role: 'assignment_manager' }, body: { userIds: [uid1] } },
        mockReply
      );

      expect(Assignment.findManagedBy).toHaveBeenCalledWith(amId);
      expect(Subject.findForUsers).toHaveBeenCalledWith([uid1]);
      expect(sendPasswordSetupEmail).toHaveBeenCalledTimes(1);
      expect(mockReply.send).toHaveBeenCalledWith({ sent: 1, errors: [] });
    });

    it('AM with any out-of-scope explicit target gets 403 before any email is sent', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const amId = '22222222-0000-4000-8000-000000000001';
      const uid1 = '11111111-0000-4000-8000-000000000001';
      const uid2 = '11111111-0000-4000-8000-000000000002';
      Assignment.findManagedBy.mockResolvedValue([{ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID }]);
      User.findByIds.mockResolvedValue([
        { id: uid1, username: 'pending1', status: 'pending' },
        { id: uid2, username: 'outofscope', status: 'pending' },
      ]);
      Subject.findForUsers.mockResolvedValue([
        { user_id: uid1, id: SUBJECT_ID, name: 'Subject A', membership_enabled: true },
        { user_id: uid2, id: SUBJECT_ID_2, name: 'Subject B', membership_enabled: true },
      ]);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post'](
        { user: { id: amId, role: 'assignment_manager' }, body: { userIds: [uid1, uid2] } },
        mockReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: user is not in a subject you manage' });
      expect(sendPasswordSetupEmail).not.toHaveBeenCalled();
    });

    it('AM all-pending mode only sends to pending users of managed subjects', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const amId = '22222222-0000-4000-8000-000000000001';
      const uid1 = '11111111-0000-4000-8000-000000000001';
      const uid2 = '11111111-0000-4000-8000-000000000002';
      Assignment.findManagedBy.mockResolvedValue([{ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID }]);
      User.findAll.mockResolvedValue([
        { id: uid1, username: 'managedpending', status: 'pending' },
        { id: uid2, username: 'unmanagedpending', status: 'pending' },
      ]);
      Subject.findForUsers.mockResolvedValue([
        { user_id: uid1, id: SUBJECT_ID, name: 'Subject A', membership_enabled: true },
        { user_id: uid2, id: SUBJECT_ID_2, name: 'Subject B', membership_enabled: true },
      ]);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockResolvedValue(true);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post'](
        { user: { id: amId, role: 'assignment_manager' }, body: {} },
        mockReply
      );

      expect(User.findAll).toHaveBeenCalledWith({ status: 'pending' });
      expect(sendPasswordSetupEmail).toHaveBeenCalledTimes(1);
      expect(sendPasswordSetupEmail).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'managedpending' }),
        'tok123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({ sent: 1, errors: [] });
    });

    it('admin all-pending mode is unscoped and never queries managed assignments', async () => {
      const mockFastify = createMockFastify();
      const handlers = captureHandlers(mockFastify);
      const pendingUsers = [{ id: 'u1', username: 'pending1', status: 'pending' }];
      User.findAll.mockResolvedValue(pendingUsers);
      PasswordResetToken.deleteStaleForUser.mockResolvedValue();
      PasswordResetToken.create.mockResolvedValue({ token: 'tok123' });
      sendPasswordSetupEmail.mockResolvedValue(true);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };

      await handlers['/users/send-setup-emails_post']({ user: { id: 'admin1', role: 'admin' }, body: {} }, mockReply);

      expect(Assignment.findManagedBy).not.toHaveBeenCalled();
      expect(Subject.findForUsers).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ sent: 1, errors: [] });
    });
  });

  // ── DELETE /users/bulk ───────────────────────────────────────────────────
  describe('DELETE /users/bulk', () => {
    const setupUsersRoute = (options = {}) => {
      const mockFastify = createMockFastify(options);
      const handlers = captureHandlers(mockFastify);
      const usersRoutes = require('../../src/routes/users');
      usersRoutes(mockFastify, {});
      const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
      return { mockFastify, handlers, reply };
    };

    it('rejects unauthenticated request (401)', async () => {
      const { handlers, reply } = setupUsersRoute();
      await handlers['/users/bulk_delete_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('rejects non-admin user (403)', async () => {
      const { mockFastify, handlers, reply } = setupUsersRoute({ requireAdminResult: false });
      const request = {
        user: { id: '00000000-0000-4000-8000-000000000002', role: 'assignment_manager' },
        body: { ids: ['11111111-0000-4000-8000-000000000001'] },
      };
      const result = await handlers['/users/bulk_delete_pre'](request, reply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, reply);
      expect(result).toBe(reply);
    });

    it('deletes 2 users and returns { deleted: 2 }', async () => {
      const { handlers, reply } = setupUsersRoute();
      User.findByIds.mockResolvedValue([
        { id: 'a', username: 'u1' },
        { id: 'b', username: 'u2' },
      ]);
      User.bulkDelete.mockResolvedValue(2);
      await handlers['/users/bulk_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          body: {
            ids: ['11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002'],
          },
        },
        reply
      );
      expect(User.bulkDelete).toHaveBeenCalledWith([
        '11111111-0000-4000-8000-000000000001',
        '11111111-0000-4000-8000-000000000002',
      ]);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Users deleted successfully', deleted: 2 });
    });

    it('deduplicates ids before deleting', async () => {
      const { handlers, reply } = setupUsersRoute();
      const uid = '11111111-0000-4000-8000-000000000001';
      User.findByIds.mockResolvedValue([{ id: uid, username: 'u1' }]);
      User.bulkDelete.mockResolvedValue(1);
      await handlers['/users/bulk_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          body: { ids: [uid, uid] },
        },
        reply
      );
      expect(User.bulkDelete).toHaveBeenCalledWith([uid]);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Users deleted successfully', deleted: 1 });
    });

    it('refuses to bulk delete the built-in admin account', async () => {
      const { handlers, reply } = setupUsersRoute();
      const adminId = '11111111-0000-4000-8000-0000000000aa';
      User.findByIds.mockResolvedValue([{ id: adminId, username: 'admin' }]);
      await handlers['/users/bulk_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          body: { ids: [adminId] },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Cannot delete the built-in admin account' });
      expect(User.bulkDelete).not.toHaveBeenCalled();
    });

    it('surfaces the last-admin invariant as its own status code', async () => {
      const { handlers, reply } = setupUsersRoute();
      const uid = '11111111-0000-4000-8000-000000000001';
      User.findByIds.mockResolvedValue([{ id: uid, username: 'someadmin' }]);
      const err = new Error('Cannot delete the last enabled admin account');
      err.statusCode = 400;
      User.bulkDelete.mockRejectedValue(err);
      await handlers['/users/bulk_delete'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' }, body: { ids: [uid] } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Cannot delete the last enabled admin account' });
    });

    it('returns 400 when ids is an empty array', async () => {
      const { handlers, reply } = setupUsersRoute();
      await handlers['/users/bulk_delete'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' }, body: { ids: [] } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'ids must be a non-empty array of up to 2000 items' });
    });

    it('returns 400 when ids exceeds 2000', async () => {
      const { handlers, reply } = setupUsersRoute();
      const ids = Array.from({ length: 2001 }, (_, i) => `id-${i}`);
      await handlers['/users/bulk_delete'](
        { user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' }, body: { ids } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'ids must be a non-empty array of up to 2000 items' });
    });

    it('returns 400 when body.ids is not an array', async () => {
      const { handlers, reply } = setupUsersRoute();
      await handlers['/users/bulk_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          body: { ids: 'not-an-array' },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'ids must be a non-empty array of up to 2000 items' });
    });

    it('returns 400 when ids contain non-UUID values', async () => {
      const { handlers, reply } = setupUsersRoute();
      await handlers['/users/bulk_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          body: { ids: ['not-a-uuid', '11111111-0000-4000-8000-000000000001'] },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'One or more IDs have an invalid format' });
      expect(User.bulkDelete).not.toHaveBeenCalled();
    });

    it('returns 400 when the requesting user own ID is in the list', async () => {
      const { handlers, reply } = setupUsersRoute();
      const adminId = '00000000-0000-4000-8000-000000000099';
      await handlers['/users/bulk_delete'](
        {
          user: { id: adminId, role: 'admin' },
          body: { ids: [adminId, '11111111-0000-4000-8000-000000000001'] },
        },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
    });

    it('returns 500 on DB error', async () => {
      const { handlers, reply } = setupUsersRoute();
      User.bulkDelete.mockRejectedValue(new Error('DB exploded'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/users/bulk_delete'](
        {
          user: { id: '00000000-0000-4000-8000-000000000099', role: 'admin' },
          body: { ids: ['11111111-0000-4000-8000-000000000001'] },
        },
        reply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to delete users' });
    });
  });
});
