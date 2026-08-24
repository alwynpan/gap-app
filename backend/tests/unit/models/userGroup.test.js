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

    const hierarchyRow = { id: GROUP_ID, assignment_id: ASSIGNMENT_ID, subject_id: SUBJECT_ID };

    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    /**
     * Queue the transaction in statement order:
     * BEGIN, hierarchy, lock membership, lock group, existing membership,
     * [DELETE when replacing], capacity, INSERT, COMMIT.
     */
    const queue = ({
      hierarchy = hierarchyRow,
      membership = { enabled: true },
      existing = null,
      maxMembers = 5,
      memberCount = 2,
      replacing = false,
      insertError = null,
      groupEnabled = true,
      joinLocked = false,
      enforcePolicy = false,
    } = {}) => {
      const q = mockClient.query;
      q.mockResolvedValueOnce({}); // BEGIN
      q.mockResolvedValueOnce({ rows: hierarchy ? [hierarchy] : [] });
      if (!hierarchy) {
        return;
      }
      q.mockResolvedValueOnce({ rows: [{ join_locked: joinLocked }] }); // assignment FOR SHARE
      if (enforcePolicy && joinLocked) {
        return;
      }
      q.mockResolvedValueOnce({ rows: [{}] }); // users FOR KEY SHARE
      q.mockResolvedValueOnce({ rows: membership ? [membership] : [] });
      if (!membership || !membership.enabled) {
        return;
      }
      q.mockResolvedValueOnce({ rows: [{ enabled: groupEnabled }] }); // group FOR UPDATE
      if (enforcePolicy && !groupEnabled) {
        return;
      }
      q.mockResolvedValueOnce({ rows: existing ? [existing] : [] });
      if (replacing) {
        q.mockResolvedValueOnce({}); // DELETE previous membership
      }
      q.mockResolvedValueOnce({ rows: [{ max_members: maxMembers, member_count: memberCount }] });
      if (insertError) {
        q.mockRejectedValueOnce(insertError);
      } else {
        q.mockResolvedValueOnce({}); // INSERT
      }
      q.mockResolvedValueOnce({}); // COMMIT
    };

    /** All SQL text issued on the transaction client, in order. */
    const sql = () => mockClient.query.mock.calls.map((c) => c[0]);

    it('assigns when the group exists, the user is an active subject member, no existing membership, and capacity allows', async () => {
      queue();

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(
        7,
        expect.stringContaining('FROM user_groups WHERE user_id = $1 AND assignment_id = $2'),
        [USER_ID, ASSIGNMENT_ID]
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(9, expect.stringContaining('INSERT INTO user_groups'), [
        USER_ID,
        GROUP_ID,
        ASSIGNMENT_ID,
      ]);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    // Regression guard for the capacity race: counting inside the locking SELECT
    // reads a pre-lock snapshot, so the count must be its own later statement.
    it('locks the membership row, then the group row, and only then counts members', async () => {
      queue();

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID);

      const statements = sql();
      const membershipLock = statements.findIndex((s) => s.includes('FROM user_subjects') && s.includes('FOR UPDATE'));
      const userLock = statements.findIndex((s) => s.includes('FROM users WHERE id = $1 FOR KEY SHARE'));
      const groupLock = statements.findIndex((s) => s.includes('FROM groups WHERE id = $1 FOR UPDATE'));
      const count = statements.findIndex((s) => s.includes('COUNT(*)::int'));
      const assignmentLock = statements.findIndex((s) => s.includes('FROM assignments') && s.includes('FOR SHARE'));

      expect(membershipLock).toBeGreaterThan(-1);
      // Taken on EVERY placement, not just policy-enforcing ones, so assignment
      // deletion is serialized the same way whoever is doing the placing.
      expect(assignmentLock).toBe(2);
      expect(assignmentLock).toBeLessThan(userLock);
      // users -> user_subjects -> groups, the order a user deletion also takes
      expect(userLock).toBeGreaterThan(-1);
      expect(membershipLock).toBeGreaterThan(userLock);
      expect(groupLock).toBeGreaterThan(membershipLock);
      expect(count).toBeGreaterThan(groupLock);
      // The locking statement must not carry the count itself.
      expect(statements[groupLock]).not.toContain('COUNT(');
    });

    // Admission must count the same rows the UI shows; filtering on users.enabled
    // would let a disabled member hide a seat and reappear over capacity.
    it('counts every membership row, not only enabled users', async () => {
      queue();

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID);

      const countStatement = sql().find((s) => s.includes('COUNT(*)::int'));
      expect(countStatement).toContain('FROM user_groups');
      expect(countStatement).not.toContain('users');
      expect(countStatement).not.toContain('enabled');
    });

    it('throws 404 when the group does not exist', async () => {
      queue({ hierarchy: null });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Group not found',
      });
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('throws 403 when the user is not a member of the parent subject (applies to ALL callers, admin included)', async () => {
      queue({ membership: null });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 403,
        message: 'User is not an active member of this subject',
      });
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });

    it('throws 403 when the subject membership is suspended', async () => {
      queue({ membership: { enabled: false } });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({ statusCode: 403 });
      // The membership check must be the locked read, so suspension serializes with us
      expect(mockClient.query).toHaveBeenNthCalledWith(5, expect.stringContaining('FOR UPDATE'), [USER_ID, SUBJECT_ID]);
    });

    it('throws 409 when the user already has a group for the assignment and replace is false', async () => {
      queue({ existing: { user_id: USER_ID, assignment_id: ASSIGNMENT_ID, group_id: OTHER_GROUP_ID } });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { replace: false })).rejects.toMatchObject({
        statusCode: 409,
        message: 'User is already in a group for this assignment',
      });
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });

    it('replaces the existing membership when replace is true', async () => {
      queue({
        existing: { user_id: USER_ID, assignment_id: ASSIGNMENT_ID, group_id: OTHER_GROUP_ID },
        replacing: true,
      });

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { replace: true });

      expect(sql().some((s) => s.startsWith('DELETE FROM user_groups'))).toBe(true);
      expect(sql().some((s) => s.includes('INSERT INTO user_groups'))).toBe(true);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('is a no-op when replace is true and the user is already in the target group', async () => {
      queue({ existing: { user_id: USER_ID, assignment_id: ASSIGNMENT_ID, group_id: GROUP_ID } });

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { replace: true });

      expect(sql().some((s) => s.includes('INSERT INTO user_groups'))).toBe(false);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('throws 409 when the group is full', async () => {
      queue({ maxMembers: 2, memberCount: 2 });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Group is full',
      });
      expect(sql().some((s) => s.includes('INSERT INTO user_groups'))).toBe(false);
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });

    it('allows assignment when max_members is null (unlimited)', async () => {
      queue({ maxMembers: null, memberCount: 999 });

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID);

      expect(sql().some((s) => s.includes('INSERT INTO user_groups'))).toBe(true);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('maps a concurrent duplicate-membership insert (23505) to 409', async () => {
      const dup = new Error('duplicate key');
      dup.code = '23505';
      queue({ insertError: dup });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: 'User is already in a group for this assignment',
      });
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });

    it('propagates a non-unique insert failure unchanged', async () => {
      const boom = new Error('disk full');
      boom.code = '53100';
      queue({ insertError: boom });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toThrow('disk full');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('releases the client even when COMMIT fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [hierarchyRow] })
        .mockResolvedValueOnce({ rows: [{ join_locked: false }] }) // assignment FOR SHARE
        .mockResolvedValueOnce({ rows: [{}] }) // users FOR KEY SHARE
        .mockResolvedValueOnce({ rows: [{ enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ enabled: true }] }) // group lock
        .mockResolvedValueOnce({ rows: [] }) // existing membership
        .mockResolvedValueOnce({ rows: [{ max_members: 5, member_count: 0 }] })
        .mockResolvedValueOnce({}) // INSERT
        .mockRejectedValueOnce(new Error('commit failed'))
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID)).rejects.toThrow('commit failed');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // The route checks the lock too, but a lock committed between that check and
  // the write must still win — so policy is re-read from the locked rows.
  describe('assignUserToGroup policy enforcement', () => {
    let mockClient;
    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    const hierarchyRow = { id: GROUP_ID, assignment_id: ASSIGNMENT_ID, subject_id: SUBJECT_ID };
    const queuePolicy = ({ groupEnabled = true, joinLocked = false }) => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [hierarchyRow] })
        .mockResolvedValueOnce({ rows: [{ join_locked: joinLocked }] }) // assignment FOR SHARE
        .mockResolvedValueOnce({ rows: [{}] }) // users FOR KEY SHARE
        .mockResolvedValueOnce({ rows: [{ enabled: true }] }) // membership
        .mockResolvedValueOnce({ rows: [{ enabled: groupEnabled }] }); // group lock
    };

    // Without these assertions the locking reads could be downgraded to plain
    // SELECTs and every test here would stay green while the race reopened.
    it('takes the assignment lock FOR SHARE, before the group lock', async () => {
      queuePolicy({});
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // existing membership
        .mockResolvedValueOnce({ rows: [{ max_members: 5, member_count: 0 }] })
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { enforcePolicy: true });

      const sql = mockClient.query.mock.calls.map((c) => c[0]);
      const assignmentLock = sql.findIndex((q) => q.includes('FROM assignments') && q.includes('FOR SHARE'));
      const userLock = sql.findIndex((q) => q.includes('FROM users') && q.includes('FOR KEY SHARE'));
      const membershipLock = sql.findIndex((q) => q.includes('FROM user_subjects') && q.includes('FOR UPDATE'));
      const groupLock = sql.findIndex((q) => q.includes('FROM groups') && q.includes('FOR UPDATE'));
      expect(assignmentLock).toBeGreaterThan(-1);
      // Deleting an assignment cascades to its groups, so locking the group
      // first would close a deadlock cycle.
      expect(assignmentLock).toBeLessThan(userLock);
      expect(userLock).toBeLessThan(membershipLock);
      expect(membershipLock).toBeLessThan(groupLock);
    });

    it('rejects a self-service join when the assignment was locked mid-request', async () => {
      queuePolicy({ joinLocked: true });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { enforcePolicy: true })).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringMatching(/locked for this assignment/i),
      });
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });

    it('rejects a self-service join when the group was disabled mid-request', async () => {
      queuePolicy({ groupEnabled: false });

      await expect(UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { enforcePolicy: true })).rejects.toMatchObject({
        statusCode: 400,
        message: 'Cannot join a disabled group',
      });
    });

    it('does not apply the lock to staff placement', async () => {
      // enforcePolicy defaults false: staff may place members while locked.
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [hierarchyRow] })
        .mockResolvedValueOnce({ rows: [{ join_locked: true }] }) // locked, but staff are exempt
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ enabled: false }] }) // group disabled
        .mockResolvedValueOnce({ rows: [] }) // existing membership
        .mockResolvedValueOnce({ rows: [{ max_members: 5, member_count: 0 }] })
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await UserGroup.assignUserToGroup(USER_ID, GROUP_ID, { replace: true });

      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });
  });

  describe('leaveGroup', () => {
    let mockClient;
    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('deletes the membership when the assignment is unlocked', async () => {
      const row = { user_id: USER_ID, assignment_id: ASSIGNMENT_ID, group_id: GROUP_ID };
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ join_locked: false }] })
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({}); // COMMIT

      expect(await UserGroup.leaveGroup(USER_ID, ASSIGNMENT_ID, GROUP_ID)).toEqual(row);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('refuses to leave a locked assignment and deletes nothing', async () => {
      mockClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ join_locked: true }] });

      await expect(UserGroup.leaveGroup(USER_ID, ASSIGNMENT_ID, GROUP_ID)).rejects.toMatchObject({ statusCode: 403 });
      // The read must lock, or setJoinLocked can commit between check and delete
      expect(mockClient.query.mock.calls[1][0]).toContain('FOR SHARE');
      expect(mockClient.query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });

    it('returns null when the membership no longer points at that group', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ join_locked: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      expect(await UserGroup.leaveGroup(USER_ID, ASSIGNMENT_ID, GROUP_ID)).toBeNull();
    });
  });

  describe('removeFromGroup', () => {
    it('deletes only when the membership still points at the expected group', async () => {
      const row = { user_id: USER_ID, assignment_id: ASSIGNMENT_ID, group_id: GROUP_ID };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await UserGroup.removeFromGroup(USER_ID, ASSIGNMENT_ID, GROUP_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('AND group_id = $3'), [
        USER_ID,
        ASSIGNMENT_ID,
        GROUP_ID,
      ]);
      expect(result).toEqual(row);
    });

    it('returns null when the user was moved to another group first', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      expect(await UserGroup.removeFromGroup(USER_ID, ASSIGNMENT_ID, GROUP_ID)).toBeNull();
    });
  });
});
