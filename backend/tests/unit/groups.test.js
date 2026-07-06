// Mock models at the top level
jest.mock('../../src/models/Group');
jest.mock('../../src/models/UserGroup');
jest.mock('../../src/models/Assignment');
jest.mock('../../src/models/Subject');
jest.mock('../../src/models/Config');
jest.mock('../../src/models/User');

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn() },
  maskEmail: (e) => e,
  maskName: (n) => n,
  maskToken: (t) => t,
  maskStudentId: (s) => s,
  redactMeta: (m) => m,
}));

const Group = require('../../src/models/Group');
const UserGroup = require('../../src/models/UserGroup');
const Assignment = require('../../src/models/Assignment');
const Subject = require('../../src/models/Subject');
const Config = require('../../src/models/Config');
const User = require('../../src/models/User');

const GROUP_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_GROUP_ID = '10000000-0000-4000-8000-000000000002';
const MISSING_GROUP_ID = '10000000-0000-4000-8000-000000000999';
const ASSIGNMENT_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_ASSIGNMENT_ID = '20000000-0000-4000-8000-000000000002';
const SUBJECT_ID = '30000000-0000-4000-8000-000000000001';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const AM_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000010';

const adminUser = () => ({ id: ADMIN_ID, role: 'admin' });
const amUser = () => ({ id: AM_ID, role: 'assignment_manager' });
const plainUser = () => ({ id: USER_ID, role: 'user' });

const mockGroupRow = (overrides = {}) => ({
  id: GROUP_ID,
  assignment_id: ASSIGNMENT_ID,
  name: 'Team A',
  enabled: true,
  max_members: 5,
  member_count: 2,
  assignment_name: 'Assignment 1',
  subject_id: SUBJECT_ID,
  subject_name: 'COMP10001',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
});

describe('Groups Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockFastify = () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    requireAdmin: jest.fn().mockResolvedValue(true),
    requireAssignmentManager: jest.fn().mockResolvedValue(true),
    assertManagesAssignment: jest.fn().mockResolvedValue(true),
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

  const setupRoute = () => {
    const mockFastify = createMockFastify();
    const handlers = captureHandlers(mockFastify);
    const groupsRoutes = require('../../src/routes/groups');
    groupsRoutes(mockFastify, {});
    return { mockFastify, handlers };
  };

  const mockReply = () => ({ code: jest.fn().mockReturnThis(), send: jest.fn() });

  const denyManagesAssignment = (mockFastify) => {
    mockFastify.assertManagesAssignment.mockImplementation(async (request, reply) => {
      reply.code(403).send({ error: 'Forbidden: You do not manage this assignment' });
      return false;
    });
  };

  describe('removed endpoints', () => {
    it('does not register GET /groups (listing moved to /assignments/:id/groups)', () => {
      const { handlers } = setupRoute();
      expect(handlers['/groups_get']).toBeUndefined();
      expect(handlers['/groups_get_pre']).toBeUndefined();
    });

    it('does not register GET /groups/enabled', () => {
      const { handlers } = setupRoute();
      expect(handlers['/groups/enabled_get']).toBeUndefined();
    });

    it('does not register POST /groups/import-mappings', () => {
      const { handlers } = setupRoute();
      expect(handlers['/groups/import-mappings_post']).toBeUndefined();
    });

    it('does not register GET /groups/export-mappings', () => {
      const { handlers } = setupRoute();
      expect(handlers['/groups/export-mappings_get']).toBeUndefined();
    });
  });

  describe('GET /groups/:id', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id_get_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('allows authenticated request through preHandler', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id_get_pre']({ user: plainUser() }, reply);
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid UUID in path param', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: adminUser(), params: { id: 'not-a-uuid' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
      expect(Group.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: adminUser(), params: { id: MISSING_GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('returns full group mapping with members for admin', async () => {
      const { handlers } = setupRoute();
      const row = mockGroupRow();
      const members = [{ id: USER_ID, username: 'user1', role_name: 'user' }];
      Group.findById.mockResolvedValue(row);
      UserGroup.getMembers.mockResolvedValue(members);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: adminUser(), params: { id: GROUP_ID } }, reply);
      expect(Group.findById).toHaveBeenCalledWith(GROUP_ID);
      expect(UserGroup.getMembers).toHaveBeenCalledWith(GROUP_ID);
      expect(reply.send).toHaveBeenCalledWith({
        group: {
          id: GROUP_ID,
          name: 'Team A',
          enabled: true,
          maxMembers: 5,
          memberCount: 2,
          assignmentId: ASSIGNMENT_ID,
          assignmentName: 'Assignment 1',
          subjectId: SUBJECT_ID,
          subjectName: 'COMP10001',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        members,
      });
    });

    it('allows a subject member to view the group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(mockGroupRow());
      Subject.isMember.mockResolvedValue(true);
      UserGroup.getMembers.mockResolvedValue([]);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(Subject.isMember).toHaveBeenCalledWith(SUBJECT_ID, USER_ID);
      expect(reply.code).not.toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ group: expect.any(Object), members: [] }));
    });

    it('rejects a plain user who is not a subject member', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(mockGroupRow());
      Subject.isMember.mockResolvedValue(false);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: You do not have access to this group' });
      expect(UserGroup.getMembers).not.toHaveBeenCalled();
    });

    it('allows an assignment manager who manages the assignment', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(mockGroupRow());
      Subject.isMember.mockResolvedValue(false);
      Assignment.isManager.mockResolvedValue(true);
      UserGroup.getMembers.mockResolvedValue([]);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: amUser(), params: { id: GROUP_ID } }, reply);
      expect(Assignment.isManager).toHaveBeenCalledWith(AM_ID, ASSIGNMENT_ID);
      expect(reply.code).not.toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ members: [] }));
    });

    it('rejects an assignment manager who does not manage the assignment', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(mockGroupRow());
      Subject.isMember.mockResolvedValue(false);
      Assignment.isManager.mockResolvedValue(false);
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: amUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: You do not have access to this group' });
    });

    it('handles error when fetching group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups/:id_get']({ user: adminUser(), params: { id: GROUP_ID } }, reply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to retrieve group' });
    });
  });

  describe('POST /groups', () => {
    beforeEach(() => {
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, name: 'Assignment 1', subject_id: SUBJECT_ID });
      Group.findByName.mockResolvedValue(null);
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('rejects invalid body (missing assignmentId)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups_post']({ user: adminUser(), body: { name: 'Team A' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: expect.any(String) });
      expect(Group.create).not.toHaveBeenCalled();
    });

    it('rejects invalid body (missing name)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups_post']({ user: adminUser(), body: { assignmentId: ASSIGNMENT_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('rejects invalid maxMembers (non-positive)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, name: 'Bad', maxMembers: 0 } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers } = setupRoute();
      Assignment.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, name: 'Team A' } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Assignment not found' });
      expect(Group.create).not.toHaveBeenCalled();
    });

    it('returns 403 when user does not manage the assignment', async () => {
      const { mockFastify, handlers } = setupRoute();
      denyManagesAssignment(mockFastify);
      const reply = mockReply();
      const request = { user: plainUser(), body: { assignmentId: ASSIGNMENT_ID, name: 'Team A' } };
      await handlers['/groups_post'](request, reply);
      expect(mockFastify.assertManagesAssignment).toHaveBeenCalledWith(request, reply, ASSIGNMENT_ID);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: You do not manage this assignment' });
      expect(Group.create).not.toHaveBeenCalled();
    });

    it('rejects when group name already exists within the assignment', async () => {
      const { handlers } = setupRoute();
      Group.findByName.mockResolvedValue({ id: OTHER_GROUP_ID, name: 'Team A' });
      const reply = mockReply();
      await handlers['/groups_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, name: 'team a' } },
        reply
      );
      expect(Group.findByName).toHaveBeenCalledWith(ASSIGNMENT_ID, 'team a');
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group name already exists' });
    });

    it('creates group with defaults (enabled=true, unlimited members)', async () => {
      const { handlers } = setupRoute();
      Group.create.mockResolvedValue({
        id: GROUP_ID,
        assignment_id: ASSIGNMENT_ID,
        name: 'New Group',
        enabled: true,
        max_members: null,
      });
      const reply = mockReply();
      await handlers['/groups_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, name: 'New Group' } },
        reply
      );
      expect(Group.create).toHaveBeenCalledWith(ASSIGNMENT_ID, 'New Group', true, null);
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({
        message: 'Group created successfully',
        group: { id: GROUP_ID, name: 'New Group', enabled: true, maxMembers: null, assignmentId: ASSIGNMENT_ID },
      });
    });

    it('creates group with enabled=false and maxMembers', async () => {
      const { handlers } = setupRoute();
      Group.create.mockResolvedValue({
        id: GROUP_ID,
        assignment_id: ASSIGNMENT_ID,
        name: 'Limited',
        enabled: false,
        max_members: 5,
      });
      const reply = mockReply();
      await handlers['/groups_post'](
        { user: amUser(), body: { assignmentId: ASSIGNMENT_ID, name: 'Limited', enabled: false, maxMembers: 5 } },
        reply
      );
      expect(Group.create).toHaveBeenCalledWith(ASSIGNMENT_ID, 'Limited', false, 5);
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ group: expect.objectContaining({ maxMembers: 5, enabled: false }) })
      );
    });

    it('handles error when creating group', async () => {
      const { handlers } = setupRoute();
      Group.create.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, name: 'New Group' } },
        reply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to create group' });
    });
  });

  describe('POST /groups/bulk', () => {
    beforeEach(() => {
      Assignment.findById.mockResolvedValue({ id: ASSIGNMENT_ID, name: 'Assignment 1', subject_id: SUBJECT_ID });
      Group.findByNames.mockResolvedValue([]);
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/bulk_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('rejects invalid body (missing assignmentId)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/bulk_post']({ user: adminUser(), body: { groups: [{ name: 'A' }] } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(Group.bulkCreate).not.toHaveBeenCalled();
    });

    it('rejects empty groups array', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/bulk_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, groups: [] } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('rejects batch larger than 2000 groups', async () => {
      const { handlers } = setupRoute();
      const groups = Array.from({ length: 2001 }, (_, i) => ({ name: `Group ${i}` }));
      const reply = mockReply();
      await handlers['/groups/bulk_post']({ user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, groups } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(Group.bulkCreate).not.toHaveBeenCalled();
    });

    it('returns 404 when assignment not found', async () => {
      const { handlers } = setupRoute();
      Assignment.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/bulk_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, groups: [{ name: 'A' }] } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Assignment not found' });
    });

    it('returns 403 when user does not manage the assignment', async () => {
      const { mockFastify, handlers } = setupRoute();
      denyManagesAssignment(mockFastify);
      const reply = mockReply();
      const request = { user: amUser(), body: { assignmentId: ASSIGNMENT_ID, groups: [{ name: 'A' }] } };
      await handlers['/groups/bulk_post'](request, reply);
      expect(mockFastify.assertManagesAssignment).toHaveBeenCalledWith(request, reply, ASSIGNMENT_ID);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(Group.bulkCreate).not.toHaveBeenCalled();
    });

    it('rejects duplicate names within the batch (case-insensitive)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/bulk_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, groups: [{ name: 'Team A' }, { name: 'team a' }] } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Duplicate group names within the batch are not allowed' });
      expect(Group.bulkCreate).not.toHaveBeenCalled();
    });

    it('rejects when names already exist in the assignment, listing conflicts', async () => {
      const { handlers } = setupRoute();
      Group.findByNames.mockResolvedValue([{ id: OTHER_GROUP_ID, assignment_id: ASSIGNMENT_ID, name: 'Team A' }]);
      const reply = mockReply();
      await handlers['/groups/bulk_post'](
        {
          user: adminUser(),
          body: { assignmentId: ASSIGNMENT_ID, groups: [{ name: 'Team A' }, { name: 'Team B' }] },
        },
        reply
      );
      expect(Group.findByNames).toHaveBeenCalledWith(ASSIGNMENT_ID, ['Team A', 'Team B']);
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({
        error: expect.stringContaining('One or more group names already exist'),
      });
      expect(reply.send).toHaveBeenCalledWith({ error: expect.stringContaining('Team A') });
      expect(Group.bulkCreate).not.toHaveBeenCalled();
    });

    it('creates groups successfully with normalised defaults', async () => {
      const { handlers } = setupRoute();
      const created = [
        { id: GROUP_ID, assignment_id: ASSIGNMENT_ID, name: 'Team A', enabled: true, max_members: null },
        { id: OTHER_GROUP_ID, assignment_id: ASSIGNMENT_ID, name: 'Team B', enabled: false, max_members: 4 },
      ];
      Group.bulkCreate.mockResolvedValue(created);
      const reply = mockReply();
      await handlers['/groups/bulk_post'](
        {
          user: adminUser(),
          body: {
            assignmentId: ASSIGNMENT_ID,
            groups: [{ name: 'Team A' }, { name: 'Team B', enabled: false, maxMembers: 4 }],
          },
        },
        reply
      );
      expect(Group.bulkCreate).toHaveBeenCalledWith(ASSIGNMENT_ID, [
        { name: 'Team A', enabled: true, maxMembers: null },
        { name: 'Team B', enabled: false, maxMembers: 4 },
      ]);
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Groups created successfully', groups: created });
    });

    it('returns 409 on unique-violation race during insert', async () => {
      const { handlers } = setupRoute();
      const dbErr = new Error('duplicate key value violates unique constraint');
      dbErr.code = '23505';
      Group.bulkCreate.mockRejectedValue(dbErr);
      const reply = mockReply();
      await handlers['/groups/bulk_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, groups: [{ name: 'Team A' }] } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({ error: 'One or more group names already exist' });
    });

    it('handles error when bulk creating groups', async () => {
      const { handlers } = setupRoute();
      Group.bulkCreate.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups/bulk_post'](
        { user: adminUser(), body: { assignmentId: ASSIGNMENT_ID, groups: [{ name: 'Team A' }] } },
        reply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to create groups' });
    });
  });

  describe('PUT /groups/:id', () => {
    beforeEach(() => {
      Group.findById.mockResolvedValue(mockGroupRow());
      Group.findByName.mockResolvedValue(null);
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id_put_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id_put']({ user: adminUser(), params: { id: 'nope' }, body: { name: 'X' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: MISSING_GROUP_ID }, body: { name: 'X' } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('returns 403 when user does not manage the group assignment', async () => {
      const { mockFastify, handlers } = setupRoute();
      denyManagesAssignment(mockFastify);
      const reply = mockReply();
      const request = { user: plainUser(), params: { id: GROUP_ID }, body: { name: 'X' } };
      await handlers['/groups/:id_put'](request, reply);
      expect(mockFastify.assertManagesAssignment).toHaveBeenCalledWith(request, reply, ASSIGNMENT_ID);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(Group.update).not.toHaveBeenCalled();
    });

    it('rejects invalid body (maxMembers non-positive)', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: GROUP_ID }, body: { maxMembers: 0 } },
        reply
      );
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(Group.update).not.toHaveBeenCalled();
    });

    it('rejects rename when name is taken by a different group in the assignment', async () => {
      const { handlers } = setupRoute();
      Group.findByName.mockResolvedValue({ id: OTHER_GROUP_ID, name: 'Taken' });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: GROUP_ID }, body: { name: 'Taken' } },
        reply
      );
      expect(Group.findByName).toHaveBeenCalledWith(ASSIGNMENT_ID, 'Taken');
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group name already exists' });
      expect(Group.update).not.toHaveBeenCalled();
    });

    it('allows rename when the matching name belongs to the same group', async () => {
      const { handlers } = setupRoute();
      Group.findByName.mockResolvedValue({ id: GROUP_ID, name: 'team a' });
      Group.update.mockResolvedValue({ id: GROUP_ID, name: 'Team A', enabled: true });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: GROUP_ID }, body: { name: 'Team A' } },
        reply
      );
      expect(reply.code).not.toHaveBeenCalledWith(409);
      expect(Group.update).toHaveBeenCalledWith(GROUP_ID, { name: 'Team A', enabled: undefined });
    });

    it('rejects maxMembers below current member count with old message', async () => {
      const { handlers } = setupRoute();
      Group.getMemberCount.mockResolvedValue(5);
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: GROUP_ID }, body: { maxMembers: 3 } },
        reply
      );
      expect(Group.getMemberCount).toHaveBeenCalledWith(GROUP_ID);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group already has 5 members, cannot set limit to 3' });
      expect(Group.update).not.toHaveBeenCalled();
    });

    it('updates group with valid maxMembers', async () => {
      const { handlers } = setupRoute();
      Group.getMemberCount.mockResolvedValue(2);
      Group.update.mockResolvedValue({ id: GROUP_ID, name: 'Team A', max_members: 5 });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: GROUP_ID }, body: { maxMembers: 5 } },
        reply
      );
      expect(Group.update).toHaveBeenCalledWith(GROUP_ID, {
        name: undefined,
        enabled: undefined,
        maxMembers: 5,
      });
      expect(reply.send).toHaveBeenCalledWith({
        message: 'Group updated successfully',
        group: { id: GROUP_ID, name: 'Team A', max_members: 5 },
      });
    });

    it('sets maxMembers to null (unlimited) without member count check', async () => {
      const { handlers } = setupRoute();
      Group.update.mockResolvedValue({ id: GROUP_ID, name: 'Team A', max_members: null });
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: GROUP_ID }, body: { maxMembers: null } },
        reply
      );
      expect(Group.getMemberCount).not.toHaveBeenCalled();
      expect(Group.update).toHaveBeenCalledWith(GROUP_ID, {
        name: undefined,
        enabled: undefined,
        maxMembers: null,
      });
    });

    it('updates enabled flag only', async () => {
      const { handlers } = setupRoute();
      Group.update.mockResolvedValue({ id: GROUP_ID, name: 'Team A', enabled: false });
      const reply = mockReply();
      await handlers['/groups/:id_put']({ user: amUser(), params: { id: GROUP_ID }, body: { enabled: false } }, reply);
      expect(Group.update).toHaveBeenCalledWith(GROUP_ID, { name: undefined, enabled: false });
    });

    it('handles error when updating group', async () => {
      const { handlers } = setupRoute();
      Group.update.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups/:id_put'](
        { user: adminUser(), params: { id: GROUP_ID }, body: { name: 'New Name' } },
        reply
      );
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to update group' });
    });
  });

  describe('DELETE /groups/:id', () => {
    beforeEach(() => {
      Group.findById.mockResolvedValue(mockGroupRow());
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id_delete_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id_delete']({ user: adminUser(), params: { id: 'nope' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id_delete']({ user: adminUser(), params: { id: MISSING_GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group not found' });
      expect(Group.delete).not.toHaveBeenCalled();
    });

    it('returns 403 when user does not manage the group assignment', async () => {
      const { mockFastify, handlers } = setupRoute();
      denyManagesAssignment(mockFastify);
      const reply = mockReply();
      const request = { user: plainUser(), params: { id: GROUP_ID } };
      await handlers['/groups/:id_delete'](request, reply);
      expect(mockFastify.assertManagesAssignment).toHaveBeenCalledWith(request, reply, ASSIGNMENT_ID);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(Group.delete).not.toHaveBeenCalled();
    });

    it('deletes group successfully', async () => {
      const { handlers } = setupRoute();
      Group.delete.mockResolvedValue({ id: GROUP_ID, name: 'Team A' });
      const reply = mockReply();
      await handlers['/groups/:id_delete']({ user: adminUser(), params: { id: GROUP_ID } }, reply);
      expect(Group.delete).toHaveBeenCalledWith(GROUP_ID);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Group deleted successfully' });
    });

    it('handles error when deleting group', async () => {
      const { handlers } = setupRoute();
      Group.delete.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups/:id_delete']({ user: adminUser(), params: { id: GROUP_ID } }, reply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to delete group' });
    });
  });

  describe('DELETE /groups/bulk', () => {
    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/bulk_delete_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns reply when assignment manager check fails in preHandler', async () => {
      const { mockFastify, handlers } = setupRoute();
      mockFastify.requireAssignmentManager.mockResolvedValue(false);
      const reply = mockReply();
      const request = { user: plainUser() };
      const result = await handlers['/groups/bulk_delete_pre'](request, reply);
      expect(mockFastify.requireAssignmentManager).toHaveBeenCalledWith(request, reply);
      expect(result).toBe(reply);
    });

    it('rejects non-array ids', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: adminUser(), body: { ids: 'nope' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'ids must be a non-empty array of up to 2000 items' });
    });

    it('rejects empty ids array', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: adminUser(), body: { ids: [] } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('rejects more than 2000 ids', async () => {
      const { handlers } = setupRoute();
      const ids = Array.from({ length: 2001 }, () => GROUP_ID);
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: adminUser(), body: { ids } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('rejects ids with invalid UUID format', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: adminUser(), body: { ids: [GROUP_ID, 'not-a-uuid'] } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'One or more IDs have an invalid format' });
    });

    it('handles missing body', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: adminUser(), body: undefined }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('deletes deduplicated groups as admin without manager scope checks', async () => {
      const { handlers } = setupRoute();
      Group.bulkDelete.mockResolvedValue(2);
      const reply = mockReply();
      await handlers['/groups/bulk_delete'](
        { user: adminUser(), body: { ids: [GROUP_ID, OTHER_GROUP_ID, GROUP_ID] } },
        reply
      );
      expect(Assignment.isManager).not.toHaveBeenCalled();
      expect(Group.bulkDelete).toHaveBeenCalledWith([GROUP_ID, OTHER_GROUP_ID]);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Groups deleted successfully', deleted: 2 });
    });

    it('allows assignment manager who manages all affected assignments', async () => {
      const { handlers } = setupRoute();
      Group.findByIds.mockResolvedValue([
        { id: GROUP_ID, assignment_id: ASSIGNMENT_ID, name: 'Team A' },
        { id: OTHER_GROUP_ID, assignment_id: ASSIGNMENT_ID, name: 'Team B' },
      ]);
      Assignment.isManager.mockResolvedValue(true);
      Group.bulkDelete.mockResolvedValue(2);
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: amUser(), body: { ids: [GROUP_ID, OTHER_GROUP_ID] } }, reply);
      expect(Group.findByIds).toHaveBeenCalledWith([GROUP_ID, OTHER_GROUP_ID]);
      expect(Assignment.isManager).toHaveBeenCalledWith(AM_ID, ASSIGNMENT_ID);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Groups deleted successfully', deleted: 2 });
    });

    it('rejects assignment manager who does not manage one of the assignments', async () => {
      const { handlers } = setupRoute();
      Group.findByIds.mockResolvedValue([
        { id: GROUP_ID, assignment_id: ASSIGNMENT_ID, name: 'Team A' },
        { id: OTHER_GROUP_ID, assignment_id: OTHER_ASSIGNMENT_ID, name: 'Team B' },
      ]);
      Assignment.isManager.mockImplementation(async (_userId, assignmentId) => assignmentId === ASSIGNMENT_ID);
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: amUser(), body: { ids: [GROUP_ID, OTHER_GROUP_ID] } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden: You do not manage this assignment' });
      expect(Group.bulkDelete).not.toHaveBeenCalled();
    });

    it('handles error when bulk deleting groups', async () => {
      const { handlers } = setupRoute();
      Group.bulkDelete.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups/bulk_delete']({ user: adminUser(), body: { ids: [GROUP_ID] } }, reply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to delete groups' });
    });
  });

  describe('POST /groups/:id/join', () => {
    beforeEach(() => {
      Config.get.mockResolvedValue('false');
      Group.findById.mockResolvedValue(mockGroupRow());
      UserGroup.assignUserToGroup.mockResolvedValue();
      User.findById.mockResolvedValue({ id: 'caller', enabled: true });
    });

    it('returns 403 when the account is disabled', async () => {
      const { handlers } = setupRoute();
      User.findById.mockResolvedValue({ id: 'caller', enabled: false });
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Account is disabled' });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('returns 404 when the calling user no longer exists', async () => {
      const { handlers } = setupRoute();
      User.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'User not found' });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id/join_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: 'nope' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });

    it('rejects normal user when join lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Group joining is currently locked. Please contact the teaching staff.',
      });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('allows admin to join when lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: adminUser(), params: { id: GROUP_ID } }, reply);
      expect(UserGroup.assignUserToGroup).toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalledWith(403);
    });

    it('allows assignment_manager to join when lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: amUser(), params: { id: GROUP_ID } }, reply);
      expect(UserGroup.assignUserToGroup).toHaveBeenCalled();
      expect(reply.code).not.toHaveBeenCalledWith(403);
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: MISSING_GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group not found' });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('rejects joining a disabled group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(mockGroupRow({ enabled: false }));
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Cannot join a disabled group' });
      expect(UserGroup.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('joins group successfully without replacing existing membership', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(UserGroup.assignUserToGroup).toHaveBeenCalledWith(USER_ID, GROUP_ID, { replace: false });
      expect(reply.send).toHaveBeenCalledWith({
        message: 'Successfully joined group',
        groupId: GROUP_ID,
        groupName: 'Team A',
      });
    });

    it('maps 403 when user is not a member of the subject', async () => {
      const { handlers } = setupRoute();
      const err = new Error('User is not a member of this subject');
      err.statusCode = 403;
      UserGroup.assignUserToGroup.mockRejectedValue(err);
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'User is not a member of this subject' });
    });

    it('maps 409 when user is already in a group for the assignment', async () => {
      const { handlers } = setupRoute();
      const err = new Error('User is already in a group for this assignment');
      err.statusCode = 409;
      UserGroup.assignUserToGroup.mockRejectedValue(err);
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({ error: 'User is already in a group for this assignment' });
    });

    it('maps 409 when group is full', async () => {
      const { handlers } = setupRoute();
      const err = new Error('Group is full');
      err.statusCode = 409;
      UserGroup.assignUserToGroup.mockRejectedValue(err);
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group is full' });
    });

    it('handles unexpected error when joining group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups/:id/join_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to join group' });
    });
  });

  describe('POST /groups/:id/leave', () => {
    beforeEach(() => {
      Config.get.mockResolvedValue('false');
      Group.findById.mockResolvedValue(mockGroupRow());
      UserGroup.findMembership.mockResolvedValue({
        user_id: USER_ID,
        group_id: GROUP_ID,
        assignment_id: ASSIGNMENT_ID,
      });
      UserGroup.remove.mockResolvedValue({ user_id: USER_ID, group_id: GROUP_ID, assignment_id: ASSIGNMENT_ID });
      User.findById.mockResolvedValue({ id: 'caller', enabled: true });
    });

    it('rejects unauthenticated request', () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      handlers['/groups/:id/leave_post_pre']({ user: null }, reply);
      expect(reply.code).toHaveBeenCalledWith(401);
    });

    it('returns 403 when the account is disabled', async () => {
      const { handlers } = setupRoute();
      User.findById.mockResolvedValue({ id: 'caller', enabled: false });
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Account is disabled' });
      expect(UserGroup.remove).not.toHaveBeenCalled();
    });

    it('returns 404 when the calling user no longer exists', async () => {
      const { handlers } = setupRoute();
      User.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'User not found' });
      expect(UserGroup.remove).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid UUID', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: 'nope' } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid ID format' });
    });

    it('rejects normal user when join lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Group joining is currently locked. Please contact the teaching staff.',
      });
      expect(UserGroup.remove).not.toHaveBeenCalled();
    });

    it('allows admin to leave when lock is enabled', async () => {
      const { handlers } = setupRoute();
      Config.get.mockResolvedValue('true');
      UserGroup.findMembership.mockResolvedValue({
        user_id: ADMIN_ID,
        group_id: GROUP_ID,
        assignment_id: ASSIGNMENT_ID,
      });
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: adminUser(), params: { id: GROUP_ID } }, reply);
      expect(UserGroup.remove).toHaveBeenCalledWith(ADMIN_ID, ASSIGNMENT_ID);
      expect(reply.code).not.toHaveBeenCalledWith(403);
    });

    it('returns 404 when group not found', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: MISSING_GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('rejects when user has no membership for the assignment', async () => {
      const { handlers } = setupRoute();
      UserGroup.findMembership.mockResolvedValue(null);
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(UserGroup.findMembership).toHaveBeenCalledWith(USER_ID, ASSIGNMENT_ID);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'You are not a member of this group' });
      expect(UserGroup.remove).not.toHaveBeenCalled();
    });

    it('rejects when user is in a different group of the assignment', async () => {
      const { handlers } = setupRoute();
      UserGroup.findMembership.mockResolvedValue({
        user_id: USER_ID,
        group_id: OTHER_GROUP_ID,
        assignment_id: ASSIGNMENT_ID,
      });
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'You are not a member of this group' });
      expect(UserGroup.remove).not.toHaveBeenCalled();
    });

    it('leaves group successfully', async () => {
      const { handlers } = setupRoute();
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(UserGroup.remove).toHaveBeenCalledWith(USER_ID, ASSIGNMENT_ID);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Successfully left group' });
    });

    it('handles error when leaving group', async () => {
      const { handlers } = setupRoute();
      Group.findById.mockRejectedValue(new Error('Database error'));
      const { logger: mockLogger } = require('../../src/utils/logger');
      const reply = mockReply();
      await handlers['/groups/:id/leave_post']({ user: plainUser(), params: { id: GROUP_ID } }, reply);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Failed to leave group' });
    });
  });
});
