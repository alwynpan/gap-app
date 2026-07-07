// Mock models at the top level
jest.mock('../../src/models/Assignment');
jest.mock('../../src/models/Subject');
jest.mock('../../src/models/Group');
jest.mock('../../src/models/UserGroup');
jest.mock('../../src/models/User');

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn() },
  maskEmail: (e) => e,
  maskName: (n) => n,
  maskToken: (t) => t,
  maskStudentId: (s) => s,
  redactMeta: (m) => m,
}));

const Assignment = require('../../src/models/Assignment');
const Subject = require('../../src/models/Subject');
const Group = require('../../src/models/Group');
const UserGroup = require('../../src/models/UserGroup');
const User = require('../../src/models/User');

const SUBJECT_ID = '30000000-0000-4000-8000-000000000001';
const ASSIGNMENT_ID = '40000000-0000-4000-8000-000000000001';
const ASSIGNMENT_ID_2 = '40000000-0000-4000-8000-000000000002';
const GROUP_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID_2 = '00000000-0000-4000-8000-000000000002';
const ADMIN_ID = '00000000-0000-4000-8000-00000000000a';

describe('Assignments Routes', () => {
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
    assertManagesAssignment: jest.fn().mockResolvedValue(options.assertManagesResult ?? true),
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

  const setup = (options = {}) => {
    const mockFastify = createMockFastify(options);
    const handlers = captureHandlers(mockFastify);
    const assignmentsRoutes = require('../../src/routes/assignments');
    assignmentsRoutes(mockFastify, {});
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
    return { mockFastify, handlers, mockReply };
  };

  describe('GET /assignments', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns 400 for invalid subjectId query', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, query: { subjectId: 'bad' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
      expect(Assignment.findAll).not.toHaveBeenCalled();
    });

    it('returns all assignments for admin, passing subjectId filter', async () => {
      const { handlers, mockReply } = setup();
      const rows = [{ id: ASSIGNMENT_ID, name: 'A1', subject_id: SUBJECT_ID }];
      Assignment.findAll.mockResolvedValue(rows);
      await handlers['/assignments_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, query: { subjectId: SUBJECT_ID } },
        mockReply
      );
      expect(Assignment.findAll).toHaveBeenCalledWith({ subjectId: SUBJECT_ID });
      expect(mockReply.send).toHaveBeenCalledWith({ assignments: rows });
    });

    it('filters assignments for assignment_manager to managed union own-subject assignments', async () => {
      const { handlers, mockReply } = setup();
      const rows = [
        { id: ASSIGNMENT_ID, name: 'Managed', subject_id: SUBJECT_ID },
        { id: ASSIGNMENT_ID_2, name: 'OwnSubject', subject_id: SUBJECT_ID },
        { id: '40000000-0000-4000-8000-000000000003', name: 'Other', subject_id: SUBJECT_ID },
      ];
      Assignment.findAll.mockResolvedValue(rows);
      Assignment.findManagedBy.mockResolvedValue([{ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID }]);
      Assignment.findForUser.mockResolvedValue([{ id: ASSIGNMENT_ID_2, subject_id: SUBJECT_ID }]);
      await handlers['/assignments_get']({ user: { id: USER_ID, role: 'assignment_manager' }, query: {} }, mockReply);
      expect(Assignment.findManagedBy).toHaveBeenCalledWith(USER_ID);
      expect(Assignment.findForUser).toHaveBeenCalledWith(USER_ID);
      expect(mockReply.send).toHaveBeenCalledWith({
        assignments: [
          { id: ASSIGNMENT_ID, name: 'Managed', subject_id: SUBJECT_ID },
          { id: ASSIGNMENT_ID_2, name: 'OwnSubject', subject_id: SUBJECT_ID },
        ],
      });
    });

    it('filters assignments for regular user to own subjects only', async () => {
      const { handlers, mockReply } = setup();
      const rows = [
        { id: ASSIGNMENT_ID, name: 'Mine', subject_id: SUBJECT_ID },
        { id: ASSIGNMENT_ID_2, name: 'NotMine', subject_id: SUBJECT_ID },
      ];
      Assignment.findAll.mockResolvedValue(rows);
      Assignment.findForUser.mockResolvedValue([{ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID }]);
      await handlers['/assignments_get']({ user: { id: USER_ID, role: 'user' }, query: {} }, mockReply);
      expect(Assignment.findManagedBy).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        assignments: [{ id: ASSIGNMENT_ID, name: 'Mine', subject_id: SUBJECT_ID }],
      });
    });

    it('handles error when fetching assignments', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findAll.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments_get']({ user: { id: ADMIN_ID, role: 'admin' }, query: {} }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /assignments/:id', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: 'bad' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid assignment ID' });
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Assignment not found' });
    });

    it('returns 403 for non-member regular user', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Subject.isMember.mockResolvedValue(false);
      await handlers['/assignments/:id_get'](
        { user: { id: USER_ID, role: 'user' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(Subject.isMember).toHaveBeenCalledWith(SUBJECT_ID, USER_ID);
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('returns 403 for assignment_manager who neither is member nor manages', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Subject.isMember.mockResolvedValue(false);
      Assignment.isManager.mockResolvedValue(false);
      await handlers['/assignments/:id_get'](
        { user: { id: USER_ID, role: 'assignment_manager' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(Assignment.isManager).toHaveBeenCalledWith(USER_ID, ASSIGNMENT_ID);
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('allows member user', async () => {
      const { handlers, mockReply } = setup();
      const assignment = { id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'A1' };
      Assignment.findById.mockResolvedValue(assignment);
      Subject.isMember.mockResolvedValue(true);
      await handlers['/assignments/:id_get'](
        { user: { id: USER_ID, role: 'user' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({ assignment });
    });

    it('allows managing assignment_manager who is not a member', async () => {
      const { handlers, mockReply } = setup();
      const assignment = { id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'A1' };
      Assignment.findById.mockResolvedValue(assignment);
      Subject.isMember.mockResolvedValue(false);
      Assignment.isManager.mockResolvedValue(true);
      await handlers['/assignments/:id_get'](
        { user: { id: USER_ID, role: 'assignment_manager' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({ assignment });
    });

    it('allows admin without membership checks', async () => {
      const { handlers, mockReply } = setup();
      const assignment = { id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'A1' };
      Assignment.findById.mockResolvedValue(assignment);
      await handlers['/assignments/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(Subject.isMember).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ assignment });
    });

    it('handles error when fetching assignment', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /assignments', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/assignments_post_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('rejects invalid body', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments_post']({ body: { name: 'A1' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
      expect(Assignment.create).not.toHaveBeenCalled();
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/assignments_post']({ body: { subjectId: SUBJECT_ID, name: 'A1' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject not found' });
    });

    it('rejects duplicate assignment name within subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Assignment.findByName.mockResolvedValue({ id: ASSIGNMENT_ID, name: 'A1' });
      await handlers['/assignments_post']({ body: { subjectId: SUBJECT_ID, name: 'A1' } }, mockReply);
      expect(Assignment.findByName).toHaveBeenCalledWith(SUBJECT_ID, 'A1');
      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(Assignment.create).not.toHaveBeenCalled();
    });

    it('creates assignment successfully', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Assignment.findByName.mockResolvedValue(null);
      const created = { id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'A1' };
      Assignment.create.mockResolvedValue(created);
      await handlers['/assignments_post']({ body: { subjectId: SUBJECT_ID, name: 'A1' } }, mockReply);
      expect(Assignment.create).toHaveBeenCalledWith(SUBJECT_ID, 'A1');
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Assignment created successfully',
        assignment: created,
      });
    });

    it('handles error when creating assignment', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Assignment.findByName.mockResolvedValue(null);
      Assignment.create.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments_post']({ body: { subjectId: SUBJECT_ID, name: 'A1' } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /assignments/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'user' } };
      const result = await handlers['/assignments/:id_put_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id_put']({ params: { id: 'bad' }, body: { name: 'A1' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid assignment ID' });
    });

    it('rejects invalid body', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id_put']({ params: { id: ASSIGNMENT_ID }, body: { name: '' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id_put']({ params: { id: ASSIGNMENT_ID }, body: { name: 'New' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('rejects duplicate name owned by a different assignment in the same subject', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'Old' });
      Assignment.findByName.mockResolvedValue({ id: ASSIGNMENT_ID_2, name: 'New' });
      await handlers['/assignments/:id_put']({ params: { id: ASSIGNMENT_ID }, body: { name: 'New' } }, mockReply);
      expect(Assignment.findByName).toHaveBeenCalledWith(SUBJECT_ID, 'New');
      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(Assignment.update).not.toHaveBeenCalled();
    });

    it('updates assignment successfully', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'Old' });
      Assignment.findByName.mockResolvedValue(null);
      const updated = { id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'New' };
      Assignment.update.mockResolvedValue(updated);
      await handlers['/assignments/:id_put']({ params: { id: ASSIGNMENT_ID }, body: { name: 'New' } }, mockReply);
      expect(Assignment.update).toHaveBeenCalledWith(ASSIGNMENT_ID, { name: 'New' });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Assignment updated successfully',
        assignment: updated,
      });
    });

    it('handles error when updating assignment', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id_put']({ params: { id: ASSIGNMENT_ID }, body: { name: 'New' } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /assignments/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id_delete_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/assignments/:id_delete_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id_delete']({ params: { id: 'bad' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id_delete']({ params: { id: ASSIGNMENT_ID } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(Assignment.delete).not.toHaveBeenCalled();
    });

    it('deletes assignment successfully', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      Assignment.delete.mockResolvedValue({ id: ASSIGNMENT_ID });
      await handlers['/assignments/:id_delete']({ params: { id: ASSIGNMENT_ID } }, mockReply);
      expect(Assignment.delete).toHaveBeenCalledWith(ASSIGNMENT_ID);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Assignment deleted successfully' });
    });

    it('handles error when deleting assignment', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      Assignment.delete.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id_delete']({ params: { id: ASSIGNMENT_ID } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /assignments/:id/groups', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/groups_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/groups_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: 'bad' }, query: {} },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id/groups_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID }, query: {} },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns 403 for non-member regular user', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Subject.isMember.mockResolvedValue(false);
      await handlers['/assignments/:id/groups_get'](
        { user: { id: USER_ID, role: 'user' }, params: { id: ASSIGNMENT_ID }, query: {} },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(Group.findAllByAssignment).not.toHaveBeenCalled();
    });

    it('returns groups with enabledOnly=false by default', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      Subject.isMember.mockResolvedValue(true);
      const groups = [{ id: GROUP_ID, name: 'G1' }];
      Group.findAllByAssignment.mockResolvedValue(groups);
      await handlers['/assignments/:id/groups_get'](
        { user: { id: USER_ID, role: 'user' }, params: { id: ASSIGNMENT_ID }, query: {} },
        mockReply
      );
      expect(Group.findAllByAssignment).toHaveBeenCalledWith(ASSIGNMENT_ID, { enabledOnly: false });
      expect(mockReply.send).toHaveBeenCalledWith({ groups });
    });

    it('passes enabledOnly=true when ?enabled=true', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID });
      const groups = [{ id: GROUP_ID, name: 'G1', enabled: true }];
      Group.findAllByAssignment.mockResolvedValue(groups);
      await handlers['/assignments/:id/groups_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID }, query: { enabled: 'true' } },
        mockReply
      );
      expect(Group.findAllByAssignment).toHaveBeenCalledWith(ASSIGNMENT_ID, { enabledOnly: true });
      expect(mockReply.send).toHaveBeenCalledWith({ groups });
    });

    it('handles error when fetching groups', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id/groups_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID }, query: {} },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /assignments/:id/managers', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/managers_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/assignments/:id/managers_get_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/managers_get']({ params: { id: 'bad' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id/managers_get']({ params: { id: ASSIGNMENT_ID } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns managers successfully', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      const managers = [{ id: USER_ID, username: 'am1' }];
      Assignment.getManagers.mockResolvedValue(managers);
      await handlers['/assignments/:id/managers_get']({ params: { id: ASSIGNMENT_ID } }, mockReply);
      expect(Assignment.getManagers).toHaveBeenCalledWith(ASSIGNMENT_ID);
      expect(mockReply.send).toHaveBeenCalledWith({ managers });
    });

    it('handles error when fetching managers', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id/managers_get']({ params: { id: ASSIGNMENT_ID } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /assignments/:id/managers', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/managers_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/assignments/:id/managers_put_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/managers_put']({ params: { id: 'bad' }, body: { userIds: [] } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid assignment ID' });
    });

    it('rejects invalid body', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/managers_put'](
        { params: { id: ASSIGNMENT_ID }, body: { userIds: 'not-an-array' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(Assignment.setManagers).not.toHaveBeenCalled();
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id/managers_put'](
        { params: { id: ASSIGNMENT_ID }, body: { userIds: [USER_ID] } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns 400 when one or more users do not exist', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByIds.mockResolvedValue([]);
      await handlers['/assignments/:id/managers_put'](
        { params: { id: ASSIGNMENT_ID }, body: { userIds: [USER_ID] } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'One or more users do not exist' });
      expect(Assignment.setManagers).not.toHaveBeenCalled();
    });

    it('returns 400 when a user does not have the assignment_manager role', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByIds.mockResolvedValue([
        { id: USER_ID, role_name: 'assignment_manager' },
        { id: USER_ID_2, role_name: 'user' },
      ]);
      await handlers['/assignments/:id/managers_put'](
        { params: { id: ASSIGNMENT_ID }, body: { userIds: [USER_ID, USER_ID_2] } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'All managers must have the assignment_manager role' });
      expect(Assignment.setManagers).not.toHaveBeenCalled();
    });

    it('sets managers successfully', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByIds.mockResolvedValue([{ id: USER_ID, role_name: 'assignment_manager' }]);
      Assignment.setManagers.mockResolvedValue();
      const managers = [{ id: USER_ID, username: 'am1' }];
      Assignment.getManagers.mockResolvedValue(managers);
      await handlers['/assignments/:id/managers_put'](
        { params: { id: ASSIGNMENT_ID }, body: { userIds: [USER_ID] } },
        mockReply
      );
      expect(Assignment.setManagers).toHaveBeenCalledWith(ASSIGNMENT_ID, [USER_ID]);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Assignment managers updated successfully',
        managers,
      });
    });

    it('clears managers with an empty userIds array without user lookup', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      Assignment.setManagers.mockResolvedValue();
      Assignment.getManagers.mockResolvedValue([]);
      await handlers['/assignments/:id/managers_put'](
        { params: { id: ASSIGNMENT_ID }, body: { userIds: [] } },
        mockReply
      );
      expect(User.findByIds).not.toHaveBeenCalled();
      expect(Assignment.setManagers).toHaveBeenCalledWith(ASSIGNMENT_ID, []);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Assignment managers updated successfully',
        managers: [],
      });
    });

    it('handles error when setting managers', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByIds.mockResolvedValue([{ id: USER_ID, role_name: 'assignment_manager' }]);
      Assignment.setManagers.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id/managers_put'](
        { params: { id: ASSIGNMENT_ID }, body: { userIds: [USER_ID] } },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /assignments/:id/export-mappings', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/export-mappings_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/export-mappings_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: 'bad' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id/export-mappings_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns reply when assertManagesAssignment fails', async () => {
      const { mockFastify, handlers, mockReply } = setup({ assertManagesResult: false });
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      const request = { user: { id: USER_ID, role: 'assignment_manager' }, params: { id: ASSIGNMENT_ID } };
      const result = await handlers['/assignments/:id/export-mappings_get'](request, mockReply);
      expect(mockFastify.assertManagesAssignment).toHaveBeenCalledWith(request, mockReply, ASSIGNMENT_ID);
      expect(result).toBe(mockReply);
      expect(UserGroup.getExportMappings).not.toHaveBeenCalled();
    });

    it('returns mappings with group_name mapped to groupName', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      UserGroup.getExportMappings.mockResolvedValue([
        { email: 'a@test.com', group_name: 'G1' },
        { email: 'b@test.com', group_name: 'G2' },
      ]);
      await handlers['/assignments/:id/export-mappings_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(UserGroup.getExportMappings).toHaveBeenCalledWith(ASSIGNMENT_ID);
      expect(mockReply.send).toHaveBeenCalledWith({
        mappings: [
          { email: 'a@test.com', groupName: 'G1' },
          { email: 'b@test.com', groupName: 'G2' },
        ],
      });
    });

    it('handles error when exporting mappings', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      UserGroup.getExportMappings.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id/export-mappings_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: ASSIGNMENT_ID } },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /assignments/:id/import-mappings', () => {
    const adminReq = (body) => ({
      user: { id: ADMIN_ID, role: 'admin' },
      params: { id: ASSIGNMENT_ID },
      body,
    });

    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/import-mappings_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/assignments/:id/import-mappings_post'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: 'bad' }, body: { rows: [] } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid assignment ID' });
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue(null);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns reply when assertManagesAssignment fails', async () => {
      const { mockFastify, handlers, mockReply } = setup({ assertManagesResult: false });
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      const request = {
        user: { id: USER_ID, role: 'assignment_manager' },
        params: { id: ASSIGNMENT_ID },
        body: { rows: [{ email: 'a@test.com', groupName: 'G1' }] },
      };
      const result = await handlers['/assignments/:id/import-mappings_post'](request, mockReply);
      expect(mockFastify.assertManagesAssignment).toHaveBeenCalledWith(request, mockReply, ASSIGNMENT_ID);
      expect(result).toBe(mockReply);
    });

    it('returns 400 when rows is missing or empty', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      await handlers['/assignments/:id/import-mappings_post'](adminReq({ rows: [] }), mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No mappings to import' });
    });

    it('returns 400 when rows exceed the maximum', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      const rows = Array.from({ length: 2001 }, (_, i) => ({ email: `u${i}@test.com`, groupName: 'G1' }));
      await handlers['/assignments/:id/import-mappings_post'](adminReq({ rows }), mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.stringContaining('maximum') });
    });

    it('imports mappings successfully with replace and assignment-scoped group lookup', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([{ id: USER_ID, email: 'a@test.com', role_name: 'user' }]);
      Group.findByNames.mockResolvedValue([{ id: GROUP_ID, name: 'G1' }]);
      UserGroup.assignUserToGroup.mockResolvedValue();
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(Group.findByNames).toHaveBeenCalledWith(ASSIGNMENT_ID, ['G1']);
      expect(UserGroup.assignUserToGroup).toHaveBeenCalledWith(USER_ID, GROUP_ID, { replace: true });
      expect(mockReply.send).toHaveBeenCalledWith({ imported: 1, skipped: [], errors: [] });
    });

    it('skips rows for unknown emails', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([]);
      Group.findByNames.mockResolvedValue([{ id: GROUP_ID, name: 'G1' }]);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'ghost@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: [{ email: 'ghost@test.com', groupName: 'G1', reason: 'User not found' }],
        errors: [],
      });
    });

    it('skips rows for unknown group names', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([{ id: USER_ID, email: 'a@test.com', role_name: 'user' }]);
      Group.findByNames.mockResolvedValue([]);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'Ghost' }] }),
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: [{ email: 'a@test.com', groupName: 'Ghost', reason: 'Group not found' }],
        errors: [],
      });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('skips admin and assignment_manager target users', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([{ id: USER_ID, email: 'admin@test.com', role_name: 'admin' }]);
      Group.findByNames.mockResolvedValue([{ id: GROUP_ID, name: 'G1' }]);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'admin@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: [
          {
            email: 'admin@test.com',
            groupName: 'G1',
            reason: 'Admins and Assignment Managers cannot be assigned to a group',
          },
        ],
        errors: [],
      });
    });

    it('skips rows when the user is not a member of the subject (403)', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([{ id: USER_ID, email: 'a@test.com', role_name: 'user' }]);
      Group.findByNames.mockResolvedValue([{ id: GROUP_ID, name: 'G1' }]);
      // The model now throws 'User is not an active member of this subject';
      // the route maps any 403 to its own hardcoded skip reason.
      const err = new Error('User is not an active member of this subject');
      err.statusCode = 403;
      UserGroup.assignUserToGroup.mockRejectedValue(err);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: [{ email: 'a@test.com', groupName: 'G1', reason: 'User is not a member of this subject' }],
        errors: [],
      });
    });

    it('skips rows when the group is full (409)', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([{ id: USER_ID, email: 'a@test.com', role_name: 'user' }]);
      Group.findByNames.mockResolvedValue([{ id: GROUP_ID, name: 'G1' }]);
      const err = new Error('Group is full');
      err.statusCode = 409;
      UserGroup.assignUserToGroup.mockRejectedValue(err);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: [{ email: 'a@test.com', groupName: 'G1', reason: 'Group is full' }],
        errors: [],
      });
    });

    it('passes through pre-marked skip rows', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([]);
      Group.findByNames.mockResolvedValue([]);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ action: 'skip', email: 'a@test.com', groupName: 'G1', skipReason: 'Duplicate row' }] }),
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: [{ email: 'a@test.com', groupName: 'G1', reason: 'Duplicate row' }],
        errors: [],
      });
    });

    it('records validation errors for invalid rows', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([]);
      Group.findByNames.mockResolvedValue([]);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'not-an-email', groupName: 'G1' }] }),
        mockReply
      );
      const payload = mockReply.send.mock.calls[0][0];
      expect(payload.imported).toBe(0);
      expect(payload.errors).toHaveLength(1);
      expect(payload.errors[0]).toMatchObject({ email: 'not-an-email', groupName: 'G1' });
    });

    it('returns 409 for ambiguous case-insensitive group names', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([{ id: USER_ID, email: 'a@test.com', role_name: 'user' }]);
      Group.findByNames.mockResolvedValue([
        { id: GROUP_ID, name: 'g1' },
        { id: '10000000-0000-4000-8000-000000000002', name: 'G1' },
      ]);
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.stringContaining('Ambiguous group name') });
    });

    it('records generic errors for unexpected row failures', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockResolvedValue([{ id: USER_ID, email: 'a@test.com', role_name: 'user' }]);
      Group.findByNames.mockResolvedValue([{ id: GROUP_ID, name: 'G1' }]);
      UserGroup.assignUserToGroup.mockRejectedValue(new Error('Database error'));
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        imported: 0,
        skipped: [],
        errors: [{ email: 'a@test.com', groupName: 'G1', error: 'Failed to process row' }],
      });
    });

    it('handles error when importing mappings', async () => {
      const { handlers, mockReply } = setup();
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID });
      User.findByEmails.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/assignments/:id/import-mappings_post'](
        adminReq({ rows: [{ email: 'a@test.com', groupName: 'G1' }] }),
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});
