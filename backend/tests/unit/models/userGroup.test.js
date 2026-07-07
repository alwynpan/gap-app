jest.mock('../../../src/db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const pool = require('../../../src/db/pool');
const UserGroup = require('../../../src/models/UserGroup');

const USER_ID = 'u0000000-0000-0000-0000-000000000001';
const GROUP_ID = 'g0000000-0000-0000-0000-000000000001';
const OTHER_GROUP_ID = 'g0000000-0000-0000-0000-000000000002';
const ASSIGNMENT_ID = 'a0000000-0000-0000-0000-000000000001';
const SUBJECT_ID = 's0000000-0000-0000-0000-000000000001';

describe('UserGroup Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findMembership', () => {
    it('returns the membership row for a (user, assignment)', async () => {
      const row = { user_id: USER_ID, assignment_id: ASSIGNMENT_ID, group_id: GROUP_ID };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await UserGroup.findMembership(USER_ID, ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM user_groups'), [USER_ID, ASSIGNMENT_ID]);
      expect(result).toEqual(row);
    });

    it('returns null when no membership exists', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await UserGroup.findMembership(USER_ID, ASSIGNMENT_ID)).toBeNull();
    });
  });

  describe('findMembershipsForUser', () => {
    it('returns memberships joined with group, assignment, and subject names', async () => {
      const rows = [
        {
          assignment_id: ASSIGNMENT_ID,
          assignment_name: 'A1',
          subject_id: SUBJECT_ID,
          subject_name: 'S1',
          group_id: GROUP_ID,
          group_name: 'Team Alpha',
        },
      ];
      pool.query.mockResolvedValue({ rows });

      const result = await UserGroup.findMembershipsForUser(USER_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN groups'), [USER_ID]);
      expect(result).toEqual(rows);
    });
  });

  describe('findMembershipsForUsers', () => {
    it('returns membership rows keyed by user for a batch of users', async () => {
      const rows = [
        {
          user_id: USER_ID,
          assignment_id: ASSIGNMENT_ID,
          assignment_name: 'A1',
          subject_id: SUBJECT_ID,
          subject_name: 'S1',
          group_id: GROUP_ID,
          group_name: 'Team Alpha',
        },
      ];
      pool.query.mockResolvedValue({ rows });

      const result = await UserGroup.findMembershipsForUsers([USER_ID]);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ug.user_id = ANY($1)'), [[USER_ID]]);
      expect(result).toEqual(rows);
    });

    it('returns empty array for an empty user list without querying', async () => {
      expect(await UserGroup.findMembershipsForUsers([])).toEqual([]);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('returns member users of a group with role names', async () => {
      const rows = [{ id: USER_ID, username: 'u1', role_name: 'user' }];
      pool.query.mockResolvedValue({ rows });

      const result = await UserGroup.getMembers(GROUP_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN user_groups'), [GROUP_ID]);
      expect(result).toEqual(rows);
    });
  });

  describe('remove', () => {
    it('deletes the membership and returns the removed row', async () => {
      const row = { user_id: USER_ID, assignment_id: ASSIGNMENT_ID, group_id: GROUP_ID };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await UserGroup.remove(USER_ID, ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM user_groups'), [
        USER_ID,
        ASSIGNMENT_ID,
      ]);
      expect(result).toEqual(row);
    });

    it('returns null when there was nothing to remove', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await UserGroup.remove(USER_ID, ASSIGNMENT_ID)).toBeNull();
    });
  });

  describe('getExportMappings', () => {
    it('returns email/group_name pairs scoped to the assignment', async () => {
      const rows = [{ email: 'u1@test.com', group_name: 'Team Alpha' }];
      pool.query.mockResolvedValue({ rows });

      const result = await UserGroup.getExportMappings(ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('assignment_id'), [ASSIGNMENT_ID]);
      expect(result).toEqual(rows);
    });
  });

  describe('assignUserToGroup', () => {
    let mockClient;

    const groupRow = {
      id: GROUP_ID,
      assignment_id: ASSIGNMENT_ID,
      subject_id: SUBJECT_ID,
      name: 'Team Alpha',
      enabled: true,
      max_members: 5,
      member_count: 2,
    };

    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('assigns when the group exists, the user is an active subject member, no existing membership, and capacity allows', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [groupRow] }) // lock group
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [] }) // existing membership
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FOR UPDATE'), [GROUP_ID]);
      // The membership check must exclude suspended (enabled = false) memberships
      expect(mockClient.query.mock.calls[2][0]).toEqual(expect.stringContaining('enabled = true'));
      expect(mockClient.query).toHaveBeenNthCalledWith(5, expect.stringContaining('INSERT INTO user_groups'), [
        USER_ID,
        GROUP_ID,
        ASSIGNMENT_ID,
      ]);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('throws 404 when the group does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // lock group — not found

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('throws 403 when the user is not an active member of the parent subject (applies to ALL callers, admin included)', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [groupRow] }) // lock group
        .mockResolvedValueOnce({ rows: [] }); // subject membership — missing or suspended

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 403,
        message: 'User is not an active member of this subject',
      });
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('throws 409 when the user already has a group for the assignment and replace is false', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [groupRow] }) // lock group
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [{ user_id: USER_ID, group_id: OTHER_GROUP_ID }] }); // existing membership

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { replace: false })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('replaces the existing membership when replace is true', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [groupRow] }) // lock group
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [{ user_id: USER_ID, group_id: OTHER_GROUP_ID }] }) // existing membership
        .mockResolvedValueOnce({}) // DELETE existing
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { replace: true });

      expect(mockClient.query).toHaveBeenNthCalledWith(5, expect.stringContaining('DELETE FROM user_groups'), [
        USER_ID,
        ASSIGNMENT_ID,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(6, expect.stringContaining('INSERT INTO user_groups'), [
        USER_ID,
        GROUP_ID,
        ASSIGNMENT_ID,
      ]);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('is a no-op when replace is true and the user is already in the target group', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [groupRow] }) // lock group
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [{ user_id: USER_ID, group_id: GROUP_ID }] }) // already in target
        .mockResolvedValueOnce({}); // COMMIT

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { replace: true });

      const insertCalls = mockClient.query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO user_groups')
      );
      expect(insertCalls).toHaveLength(0);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('throws 409 when the group is full', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ ...groupRow, member_count: 5, max_members: 5 }] }) // lock group — full
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [] }); // existing membership

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Group is full',
      });
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('allows assignment when max_members is null (unlimited)', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ ...groupRow, max_members: null, member_count: 999 }] }) // lock group
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [] }) // existing membership
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID);

      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('maps a concurrent duplicate-membership insert (23505) to 409', async () => {
      const pgErr = new Error('duplicate key value violates unique constraint "user_groups_pkey"');
      pgErr.code = '23505';
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [groupRow] }) // lock group
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [] }) // existing membership
        .mockRejectedValueOnce(pgErr); // INSERT hits PK race

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('releases the client even when COMMIT fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [groupRow] }) // lock group
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // subject membership
        .mockResolvedValueOnce({ rows: [] }) // existing membership
        .mockResolvedValueOnce({}) // INSERT
        .mockRejectedValueOnce(new Error('commit failed')) // COMMIT
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toThrow('commit failed');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
