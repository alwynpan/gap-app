// Mock models at the top level
jest.mock('../../src/models/Subject');
jest.mock('../../src/models/Assignment');
jest.mock('../../src/models/User');
jest.mock('../../src/models/UserGroup');

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn() },
  maskEmail: (e) => e,
  maskName: (n) => n,
  maskToken: (t) => t,
  maskStudentId: (s) => s,
  redactMeta: (m) => m,
}));

const Subject = require('../../src/models/Subject');
const Assignment = require('../../src/models/Assignment');
const User = require('../../src/models/User');
const UserGroup = require('../../src/models/UserGroup');

const SUBJECT_ID = '30000000-0000-4000-8000-000000000001';
const SUBJECT_ID_2 = '30000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID_2 = '00000000-0000-4000-8000-000000000002';
const ADMIN_ID = '00000000-0000-4000-8000-00000000000a';

describe('Subjects Routes', () => {
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
    const subjectsRoutes = require('../../src/routes/subjects');
    subjectsRoutes(mockFastify, {});
    const mockReply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
    return { mockFastify, handlers, mockReply };
  };

  describe('GET /subjects', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns all subjects for admin', async () => {
      const { handlers, mockReply } = setup();
      const rows = [
        { id: SUBJECT_ID, name: 'COMP10001' },
        { id: SUBJECT_ID_2, name: 'COMP20002' },
      ];
      Subject.findAll.mockResolvedValue(rows);
      await handlers['/subjects_get']({ user: { id: ADMIN_ID, role: 'admin' } }, mockReply);
      expect(Subject.findAll).toHaveBeenCalled();
      expect(Subject.findForUser).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ subjects: rows });
    });

    it('filters subjects for assignment_manager to managed union member subjects', async () => {
      const { handlers, mockReply } = setup();
      const rows = [
        { id: SUBJECT_ID, name: 'Managed' },
        { id: SUBJECT_ID_2, name: 'Member' },
        { id: '30000000-0000-4000-8000-000000000003', name: 'Other' },
      ];
      Subject.findAll.mockResolvedValue(rows);
      Assignment.findManagedBy.mockResolvedValue([
        { id: '40000000-0000-4000-8000-000000000001', subject_id: SUBJECT_ID },
      ]);
      Subject.findForUser.mockResolvedValue([{ id: SUBJECT_ID_2, name: 'Member' }]);
      await handlers['/subjects_get']({ user: { id: USER_ID, role: 'assignment_manager' } }, mockReply);
      expect(Assignment.findManagedBy).toHaveBeenCalledWith(USER_ID);
      expect(Subject.findForUser).toHaveBeenCalledWith(USER_ID);
      expect(mockReply.send).toHaveBeenCalledWith({
        subjects: [
          { id: SUBJECT_ID, name: 'Managed' },
          { id: SUBJECT_ID_2, name: 'Member' },
        ],
      });
    });

    it('filters subjects for regular user to member subjects only', async () => {
      const { handlers, mockReply } = setup();
      const rows = [
        { id: SUBJECT_ID, name: 'Mine' },
        { id: SUBJECT_ID_2, name: 'NotMine' },
      ];
      Subject.findAll.mockResolvedValue(rows);
      Subject.findForUser.mockResolvedValue([{ id: SUBJECT_ID, name: 'Mine' }]);
      await handlers['/subjects_get']({ user: { id: USER_ID, role: 'user' } }, mockReply);
      expect(Subject.findForUser).toHaveBeenCalledWith(USER_ID);
      expect(Assignment.findManagedBy).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ subjects: [{ id: SUBJECT_ID, name: 'Mine' }] });
    });

    it('handles error when fetching subjects', async () => {
      const { handlers, mockReply } = setup();
      Subject.findAll.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects_get']({ user: { id: ADMIN_ID, role: 'admin' } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /subjects/:id', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: 'not-a-uuid' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/subjects/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject not found' });
    });

    it('returns 403 for non-member regular user', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'S' });
      Subject.isMember.mockResolvedValue(false);
      await handlers['/subjects/:id_get'](
        { user: { id: USER_ID, role: 'user' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('returns 403 for assignment_manager who neither is member nor manages in subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'S' });
      Subject.isMember.mockResolvedValue(false);
      Assignment.managesAnyInSubject.mockResolvedValue(false);
      await handlers['/subjects/:id_get'](
        { user: { id: USER_ID, role: 'assignment_manager' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(Assignment.managesAnyInSubject).toHaveBeenCalledWith(USER_ID, SUBJECT_ID);
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it('allows member user and returns subject with assignments', async () => {
      const { handlers, mockReply } = setup();
      const subject = { id: SUBJECT_ID, name: 'S' };
      const assignments = [{ id: '40000000-0000-4000-8000-000000000001', name: 'A1', subject_id: SUBJECT_ID }];
      Subject.findById.mockResolvedValue(subject);
      Subject.isMember.mockResolvedValue(true);
      Assignment.findAll.mockResolvedValue(assignments);
      await handlers['/subjects/:id_get'](
        { user: { id: USER_ID, role: 'user' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(Assignment.findAll).toHaveBeenCalledWith({ subjectId: SUBJECT_ID });
      expect(mockReply.send).toHaveBeenCalledWith({ subject, assignments });
    });

    it('allows assignment_manager who manages an assignment in the subject', async () => {
      const { handlers, mockReply } = setup();
      const subject = { id: SUBJECT_ID, name: 'S' };
      Subject.findById.mockResolvedValue(subject);
      Subject.isMember.mockResolvedValue(false);
      Assignment.managesAnyInSubject.mockResolvedValue(true);
      Assignment.findAll.mockResolvedValue([]);
      await handlers['/subjects/:id_get'](
        { user: { id: USER_ID, role: 'assignment_manager' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({ subject, assignments: [] });
    });

    it('allows admin without membership checks', async () => {
      const { handlers, mockReply } = setup();
      const subject = { id: SUBJECT_ID, name: 'S' };
      Subject.findById.mockResolvedValue(subject);
      Assignment.findAll.mockResolvedValue([]);
      await handlers['/subjects/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(Subject.isMember).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ subject, assignments: [] });
    });

    it('handles error when fetching subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects/:id_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /subjects', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/subjects_post_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('rejects invalid body', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects_post']({ body: {} }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
      expect(Subject.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate subject name', async () => {
      const { handlers, mockReply } = setup();
      Subject.findByName.mockResolvedValue({ id: SUBJECT_ID, name: 'COMP10001' });
      await handlers['/subjects_post']({ body: { name: 'COMP10001' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'A subject with this name already exists' });
      expect(Subject.create).not.toHaveBeenCalled();
    });

    it('creates subject successfully', async () => {
      const { handlers, mockReply } = setup();
      Subject.findByName.mockResolvedValue(null);
      const created = { id: SUBJECT_ID, name: 'COMP10001' };
      Subject.create.mockResolvedValue(created);
      await handlers['/subjects_post']({ body: { name: 'COMP10001' } }, mockReply);
      expect(Subject.create).toHaveBeenCalledWith('COMP10001');
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Subject created successfully', subject: created });
    });

    it('handles error when creating subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findByName.mockResolvedValue(null);
      Subject.create.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects_post']({ body: { name: 'COMP10001' } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /subjects/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'user' } };
      const result = await handlers['/subjects/:id_put_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id_put']({ params: { id: 'bad' }, body: { name: 'X' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
    });

    it('rejects invalid body', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id_put']({ params: { id: SUBJECT_ID }, body: { name: '' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/subjects/:id_put']({ params: { id: SUBJECT_ID }, body: { name: 'New' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject not found' });
    });

    it('rejects duplicate name owned by a different subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'Old' });
      Subject.findByName.mockResolvedValue({ id: SUBJECT_ID_2, name: 'New' });
      await handlers['/subjects/:id_put']({ params: { id: SUBJECT_ID }, body: { name: 'New' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'A subject with this name already exists' });
      expect(Subject.update).not.toHaveBeenCalled();
    });

    it('allows rename when duplicate match is the same subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'old name' });
      Subject.findByName.mockResolvedValue({ id: SUBJECT_ID, name: 'old name' });
      const updated = { id: SUBJECT_ID, name: 'Old Name' };
      Subject.update.mockResolvedValue(updated);
      await handlers['/subjects/:id_put']({ params: { id: SUBJECT_ID }, body: { name: 'Old Name' } }, mockReply);
      expect(Subject.update).toHaveBeenCalledWith(SUBJECT_ID, { name: 'Old Name' });
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Subject updated successfully', subject: updated });
    });

    it('updates subject successfully', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'Old' });
      Subject.findByName.mockResolvedValue(null);
      const updated = { id: SUBJECT_ID, name: 'New' };
      Subject.update.mockResolvedValue(updated);
      await handlers['/subjects/:id_put']({ params: { id: SUBJECT_ID }, body: { name: 'New' } }, mockReply);
      expect(Subject.update).toHaveBeenCalledWith(SUBJECT_ID, { name: 'New' });
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Subject updated successfully', subject: updated });
    });

    it('handles error when updating subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects/:id_put']({ params: { id: SUBJECT_ID }, body: { name: 'New' } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /subjects/:id', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id_delete_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/subjects/:id_delete_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id_delete']({ params: { id: 'bad' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/subjects/:id_delete']({ params: { id: SUBJECT_ID } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(Subject.delete).not.toHaveBeenCalled();
    });

    it('deletes subject successfully', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'S' });
      Subject.delete.mockResolvedValue({ id: SUBJECT_ID });
      await handlers['/subjects/:id_delete']({ params: { id: SUBJECT_ID } }, mockReply);
      expect(Subject.delete).toHaveBeenCalledWith(SUBJECT_ID);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Subject deleted successfully' });
    });

    it('handles error when deleting subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID, name: 'S' });
      Subject.delete.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects/:id_delete']({ params: { id: SUBJECT_ID } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /subjects/:id/users', () => {
    it('rejects unauthenticated request', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users_get_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: 'bad' } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/subjects/:id/users_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns 403 for plain user', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      await handlers['/subjects/:id/users_get'](
        { user: { id: USER_ID, role: 'user' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(Subject.getMembers).not.toHaveBeenCalled();
    });

    it('returns 403 for assignment_manager not managing in subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Assignment.managesAnyInSubject.mockResolvedValue(false);
      await handlers['/subjects/:id/users_get'](
        { user: { id: USER_ID, role: 'assignment_manager' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
    });

    it("returns members enriched with this subject's memberships for managing assignment_manager", async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Assignment.managesAnyInSubject.mockResolvedValue(true);
      const users = [{ id: USER_ID, username: 'u1' }];
      Subject.getMembers.mockResolvedValue(users);
      UserGroup.findMembershipsForUsers.mockResolvedValue([
        {
          user_id: USER_ID,
          subject_id: SUBJECT_ID,
          assignment_id: 'a0000000-0000-4000-8000-000000000001',
          assignment_name: 'A1',
          group_id: 'g0000000-0000-4000-8000-000000000001',
          group_name: 'Team Alpha',
        },
        // Membership in ANOTHER subject must be filtered out of the response
        {
          user_id: USER_ID,
          subject_id: 's0000000-0000-4000-8000-000000000099',
          assignment_id: 'a0000000-0000-4000-8000-000000000002',
          assignment_name: 'Other',
          group_id: 'g0000000-0000-4000-8000-000000000002',
          group_name: 'Elsewhere',
        },
      ]);
      await handlers['/subjects/:id/users_get'](
        { user: { id: USER_ID_2, role: 'assignment_manager' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(Subject.getMembers).toHaveBeenCalledWith(SUBJECT_ID);
      expect(UserGroup.findMembershipsForUsers).toHaveBeenCalledWith([USER_ID]);
      expect(mockReply.send).toHaveBeenCalledWith({
        users: [
          {
            id: USER_ID,
            username: 'u1',
            memberships: [
              {
                subject_id: SUBJECT_ID,
                assignment_id: 'a0000000-0000-4000-8000-000000000001',
                assignment_name: 'A1',
                group_id: 'g0000000-0000-4000-8000-000000000001',
                group_name: 'Team Alpha',
              },
            ],
          },
        ],
      });
    });

    it('returns members for admin (empty memberships when none in this subject)', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      const users = [{ id: USER_ID, username: 'u1' }];
      Subject.getMembers.mockResolvedValue(users);
      UserGroup.findMembershipsForUsers.mockResolvedValue([]);
      await handlers['/subjects/:id/users_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        users: [{ id: USER_ID, username: 'u1', memberships: [] }],
      });
    });

    it('handles error when fetching members', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects/:id/users_get'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID } },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /subjects/:id/users', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users_post_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/subjects/:id/users_post_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users_post']({ params: { id: 'bad' }, body: { userIds: [USER_ID] } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
    });

    it('rejects invalid body (empty userIds)', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users_post']({ params: { id: SUBJECT_ID }, body: { userIds: [] } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });
      expect(Subject.addUsers).not.toHaveBeenCalled();
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/subjects/:id/users_post'](
        { params: { id: SUBJECT_ID }, body: { userIds: [USER_ID] } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns 400 when one or more users do not exist', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      User.findByIds.mockResolvedValue([{ id: USER_ID }]);
      await handlers['/subjects/:id/users_post'](
        { params: { id: SUBJECT_ID }, body: { userIds: [USER_ID, USER_ID_2] } },
        mockReply
      );
      expect(User.findByIds).toHaveBeenCalledWith([USER_ID, USER_ID_2]);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'One or more users do not exist' });
      expect(Subject.addUsers).not.toHaveBeenCalled();
    });

    it('adds users to subject successfully', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      User.findByIds.mockResolvedValue([{ id: USER_ID }, { id: USER_ID_2 }]);
      Subject.addUsers.mockResolvedValue(2);
      await handlers['/subjects/:id/users_post'](
        { params: { id: SUBJECT_ID }, body: { userIds: [USER_ID, USER_ID_2] } },
        mockReply
      );
      expect(Subject.addUsers).toHaveBeenCalledWith(SUBJECT_ID, [USER_ID, USER_ID_2]);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Users added to subject', added: 2 });
    });

    it('handles error when adding users', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      User.findByIds.mockResolvedValue([{ id: USER_ID }]);
      Subject.addUsers.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects/:id/users_post'](
        { params: { id: SUBJECT_ID }, body: { userIds: [USER_ID] } },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /subjects/:id/users/:userId', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_put_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns 400 for invalid subject UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_put'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: 'bad', userId: USER_ID }, body: { enabled: false } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
    });

    it('returns 400 for invalid user UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_put'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID, userId: 'bad' }, body: { enabled: false } },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid user ID' });
    });

    it('returns 403 for plain user', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: USER_ID_2, role: 'user' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: false },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(Subject.setMemberEnabled).not.toHaveBeenCalled();
    });

    it('returns 403 for assignment_manager not managing in subject', async () => {
      const { handlers, mockReply } = setup();
      Assignment.managesAnyInSubject.mockResolvedValue(false);
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: USER_ID_2, role: 'assignment_manager' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: false },
        },
        mockReply
      );
      expect(Assignment.managesAnyInSubject).toHaveBeenCalledWith(USER_ID_2, SUBJECT_ID);
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(Subject.setMemberEnabled).not.toHaveBeenCalled();
    });

    it('rejects invalid body (missing/non-boolean enabled)', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_put'](
        { user: { id: ADMIN_ID, role: 'admin' }, params: { id: SUBJECT_ID, userId: USER_ID }, body: {} },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: expect.any(String) });

      mockReply.code.mockClear();
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: ADMIN_ID, role: 'admin' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: 'nope' },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(Subject.setMemberEnabled).not.toHaveBeenCalled();
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: ADMIN_ID, role: 'admin' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: false },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject not found' });
      expect(Subject.setMemberEnabled).not.toHaveBeenCalled();
    });

    it('returns 404 when the user is not a member of the subject', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Subject.setMemberEnabled.mockResolvedValue(false);
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: ADMIN_ID, role: 'admin' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: false },
        },
        mockReply
      );
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User is not a member of this subject' });
    });

    it('managing assignment_manager can suspend a member', async () => {
      const { handlers, mockReply } = setup();
      Assignment.managesAnyInSubject.mockResolvedValue(true);
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Subject.setMemberEnabled.mockResolvedValue(true);
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: USER_ID_2, role: 'assignment_manager' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: false },
        },
        mockReply
      );
      expect(Subject.setMemberEnabled).toHaveBeenCalledWith(SUBJECT_ID, USER_ID, false);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Member suspended', membershipEnabled: false });
    });

    it('admin can re-enable a member', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Subject.setMemberEnabled.mockResolvedValue(true);
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: ADMIN_ID, role: 'admin' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: true },
        },
        mockReply
      );
      expect(Assignment.managesAnyInSubject).not.toHaveBeenCalled();
      expect(Subject.setMemberEnabled).toHaveBeenCalledWith(SUBJECT_ID, USER_ID, true);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Member enabled', membershipEnabled: true });
    });

    it('handles error when updating the membership', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Subject.setMemberEnabled.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects/:id/users/:userId_put'](
        {
          user: { id: ADMIN_ID, role: 'admin' },
          params: { id: SUBJECT_ID, userId: USER_ID },
          body: { enabled: false },
        },
        mockReply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /subjects/:id/users/:userId', () => {
    it('rejects unauthenticated request in preHandler', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_delete_pre']({ user: null }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when requireAdmin fails in preHandler', async () => {
      const { mockFastify, handlers, mockReply } = setup({ requireAdminResult: false });
      const request = { user: { id: USER_ID, role: 'assignment_manager' } };
      const result = await handlers['/subjects/:id/users/:userId_delete_pre'](request, mockReply);
      expect(mockFastify.requireAdmin).toHaveBeenCalledWith(request, mockReply);
      expect(result).toBe(mockReply);
    });

    it('returns 400 for invalid subject UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_delete']({ params: { id: 'bad', userId: USER_ID } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid subject ID' });
    });

    it('returns 400 for invalid user UUID', async () => {
      const { handlers, mockReply } = setup();
      await handlers['/subjects/:id/users/:userId_delete']({ params: { id: SUBJECT_ID, userId: 'bad' } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid user ID' });
    });

    it('returns 404 when subject not found', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue(null);
      await handlers['/subjects/:id/users/:userId_delete']({ params: { id: SUBJECT_ID, userId: USER_ID } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Subject not found' });
    });

    it('returns 404 when user is not a member', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Subject.removeUser.mockResolvedValue(false);
      await handlers['/subjects/:id/users/:userId_delete']({ params: { id: SUBJECT_ID, userId: USER_ID } }, mockReply);
      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User is not a member of this subject' });
    });

    it('removes user from subject successfully', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Subject.removeUser.mockResolvedValue(true);
      await handlers['/subjects/:id/users/:userId_delete']({ params: { id: SUBJECT_ID, userId: USER_ID } }, mockReply);
      expect(Subject.removeUser).toHaveBeenCalledWith(SUBJECT_ID, USER_ID);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'User removed from subject' });
    });

    it('handles error when removing user', async () => {
      const { handlers, mockReply } = setup();
      Subject.findById.mockResolvedValue({ id: SUBJECT_ID });
      Subject.removeUser.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      await handlers['/subjects/:id/users/:userId_delete']({ params: { id: SUBJECT_ID, userId: USER_ID } }, mockReply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});
