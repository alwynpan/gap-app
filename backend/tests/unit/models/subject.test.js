jest.mock('../../../src/db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const pool = require('../../../src/db/pool');
const Subject = require('../../../src/models/Subject');

const SUBJECT_ID = 's0000000-0000-0000-0000-000000000001';
const USER_ID = 'u0000000-0000-0000-0000-000000000001';

describe('Subject Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all subjects with assignment and member counts', async () => {
      const rows = [
        { id: SUBJECT_ID, name: 'Subject A', assignment_count: 2, member_count: 5 },
        { id: 's0000000-0000-0000-0000-000000000002', name: 'Subject B', assignment_count: 0, member_count: 0 },
      ];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.findAll();

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('FROM subjects'));
      expect(result).toEqual(rows);
    });

    it('returns empty array when no subjects exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.findAll()).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the subject with counts', async () => {
      const row = { id: SUBJECT_ID, name: 'Subject A', assignment_count: 1, member_count: 3 };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Subject.findById(SUBJECT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE s.id = $1'), [SUBJECT_ID]);
      expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.findById(SUBJECT_ID)).toBeNull();
    });
  });

  describe('findByName', () => {
    it('matches case-insensitively', async () => {
      const row = { id: SUBJECT_ID, name: 'Subject A' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Subject.findByName('subject a');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LOWER(name) = LOWER($1)'), ['subject a']);
      expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.findByName('nope')).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts and returns the new subject', async () => {
      const row = { id: SUBJECT_ID, name: 'New Subject' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Subject.create('New Subject');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO subjects'), ['New Subject']);
      expect(result).toEqual(row);
    });

    it('propagates unique-constraint errors', async () => {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = '23505';
      pool.query.mockRejectedValue(err);

      await expect(Subject.create('Dup')).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('update', () => {
    it('updates the name and returns the row', async () => {
      const row = { id: SUBJECT_ID, name: 'Renamed' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Subject.update(SUBJECT_ID, { name: 'Renamed' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE subjects SET'),
        expect.arrayContaining(['Renamed', SUBJECT_ID])
      );
      expect(result).toEqual(row);
    });

    it('falls back to findById when no updatable fields given', async () => {
      const row = { id: SUBJECT_ID, name: 'Same' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Subject.update(SUBJECT_ID, {});

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('WHERE s.id = $1'));
      expect(result).toEqual(row);
    });
  });

  describe('delete', () => {
    it('deletes and returns the row', async () => {
      const row = { id: SUBJECT_ID, name: 'Doomed' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Subject.delete(SUBJECT_ID);

      expect(pool.query).toHaveBeenCalledWith('DELETE FROM subjects WHERE id = $1 RETURNING *', [SUBJECT_ID]);
      expect(result).toEqual(row);
    });

    it('returns undefined when nothing was deleted', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.delete(SUBJECT_ID)).toBeUndefined();
    });
  });

  describe('findForUser', () => {
    it('returns only enabled memberships by default', async () => {
      const rows = [{ id: SUBJECT_ID, name: 'Subject A' }];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.findForUser(USER_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('user_subjects'), [USER_ID]);
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('us.enabled = true'));
      expect(result).toEqual(rows);
    });

    it('returns all memberships tagged with membership_enabled when includeDisabled is true', async () => {
      const rows = [
        { id: SUBJECT_ID, name: 'Subject A', membership_enabled: true },
        { id: 's0000000-0000-0000-0000-000000000002', name: 'Subject B', membership_enabled: false },
      ];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.findForUser(USER_ID, { includeDisabled: true });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('us.enabled AS membership_enabled'), [USER_ID]);
      expect(pool.query.mock.calls[0][0]).not.toEqual(expect.stringContaining('us.enabled = true'));
      expect(result).toEqual(rows);
    });

    it('returns empty array when the user has no subjects', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.findForUser(USER_ID)).toEqual([]);
    });
  });

  describe('findForUsers', () => {
    it('returns subject rows keyed by user for a batch of users, tagged with membership_enabled', async () => {
      const rows = [{ user_id: USER_ID, id: SUBJECT_ID, name: 'Subject A', membership_enabled: false }];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.findForUsers([USER_ID]);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('user_subjects'), [[USER_ID]]);
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('us.enabled AS membership_enabled'));
      expect(pool.query.mock.calls[0][0]).not.toEqual(expect.stringContaining('us.enabled = true'));
      expect(result).toEqual(rows);
    });

    it('returns empty array for an empty user list without querying', async () => {
      expect(await Subject.findForUsers([])).toEqual([]);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('returns member users with role names and membership_enabled', async () => {
      const rows = [{ id: USER_ID, username: 'u1', role_name: 'user', membership_enabled: true }];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.getMembers(SUBJECT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN user_subjects'), [SUBJECT_ID]);
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('us.enabled AS membership_enabled'));
      expect(result).toEqual(rows);
    });
  });

  describe('addUsers', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    /** BEGIN, INSERT ... RETURNING, classify, COMMIT. */
    const queue = ({ insertedIds = [], classified = [] }) => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: insertedIds.map((id) => ({ user_id: id })) })
        .mockResolvedValueOnce({ rows: classified })
        .mockResolvedValueOnce({}); // COMMIT
    };

    it('bulk-inserts memberships and reports what actually happened', async () => {
      queue({
        insertedIds: ['u1'],
        classified: [
          { user_id: 'u1', enabled: true }, // just inserted
          { user_id: 'u2', enabled: true }, // already enrolled
          { user_id: 'u3', enabled: false }, // enrolled but suspended
          { user_id: 'u4', enabled: false },
        ],
      });

      const result = await Subject.addUsers(SUBJECT_ID, ['u1', 'u2', 'u3', 'u4']);

      expect(mockClient.query.mock.calls[1][0]).toContain('ON CONFLICT (user_id, subject_id) DO NOTHING');
      expect(result).toEqual({ added: 1, alreadyEnrolled: 1, suspended: 2 });
    });

    // Classification must be a LATER statement so it sees rows another
    // transaction committed after this one's snapshot was taken.
    it('classifies in a separate statement from the insert', async () => {
      queue({ insertedIds: [], classified: [{ user_id: 'u1', enabled: true }] });

      await Subject.addUsers(SUBJECT_ID, ['u1']);

      const insertSql = mockClient.query.mock.calls[1][0];
      const classifySql = mockClient.query.mock.calls[2][0];
      expect(insertSql).toContain('INSERT INTO user_subjects');
      expect(classifySql).toContain('SELECT us.user_id, us.enabled');
      expect(classifySql).not.toContain('INSERT');
    });

    // Re-enabling is a deliberate staff action, so this must never flip enabled.
    it('does not re-enable a suspended membership', async () => {
      queue({ insertedIds: [], classified: [{ user_id: 'u1', enabled: false }] });

      const result = await Subject.addUsers(SUBJECT_ID, ['u1']);

      const sql = mockClient.query.mock.calls.map((c) => String(c[0])).join('\n');
      expect(sql).not.toContain('DO UPDATE');
      expect(sql).not.toContain('SET enabled');
      expect(result).toEqual({ added: 0, alreadyEnrolled: 0, suspended: 1 });
    });

    it('rolls back and rethrows when the insert fails', async () => {
      mockClient.query.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));

      await expect(Subject.addUsers(SUBJECT_ID, ['u1'])).rejects.toThrow('boom');
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('returns a zeroed breakdown for an empty user list without querying', async () => {
      const result = await Subject.addUsers(SUBJECT_ID, []);

      expect(pool.connect).not.toHaveBeenCalled();
      expect(result).toEqual({ added: 0, alreadyEnrolled: 0, suspended: 0 });
    });
  });

  describe('removeUser', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('removes the subject membership and the group memberships within the subject in one transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{}] }) // lock user_subjects row
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE user_groups within subject
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE user_subjects
        .mockResolvedValueOnce({}); // COMMIT

      const result = await Subject.removeUser(SUBJECT_ID, USER_ID);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      // The membership row is locked first, matching UserGroup.assignUserToGroup's
      // lock order, so a concurrent placement cannot outlive the removal.
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM user_subjects WHERE subject_id = $1 AND user_id = $2 FOR UPDATE'),
        [SUBJECT_ID, USER_ID]
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(3, expect.stringContaining('DELETE FROM user_groups'), [
        SUBJECT_ID,
        USER_ID,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, expect.stringContaining('DELETE FROM user_subjects'), [
        SUBJECT_ID,
        USER_ID,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(5, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns false when the user was not a member', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // lock user_subjects row (absent)
        .mockResolvedValueOnce({ rowCount: 0 }) // DELETE user_groups
        .mockResolvedValueOnce({ rowCount: 0 }) // DELETE user_subjects
        .mockResolvedValueOnce({}); // COMMIT

      const result = await Subject.removeUser(SUBJECT_ID, USER_ID);
      expect(result).toBe(false);
    });

    it('rolls back and re-throws on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('boom')); // DELETE user_groups

      await expect(Subject.removeUser(SUBJECT_ID, USER_ID)).rejects.toThrow('boom');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('setMemberEnabled', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('suspending deletes the group memberships within the subject before updating, in one transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{}] }) // lock user_subjects row
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE user_groups within subject
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE user_subjects
        .mockResolvedValueOnce({}); // COMMIT

      const result = await Subject.setMemberEnabled(SUBJECT_ID, USER_ID, false);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      // Locked before the cleanup so a placement racing the suspension cannot
      // leave the suspended member holding a group in this subject.
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM user_subjects WHERE subject_id = $1 AND user_id = $2 FOR UPDATE'),
        [SUBJECT_ID, USER_ID]
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(3, expect.stringContaining('DELETE FROM user_groups'), [
        SUBJECT_ID,
        USER_ID,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, expect.stringContaining('UPDATE user_subjects'), [
        SUBJECT_ID,
        USER_ID,
        false,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(5, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('enabling skips the group-membership delete and only updates the row', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{}] }) // lock user_subjects row
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE user_subjects
        .mockResolvedValueOnce({}); // COMMIT

      const result = await Subject.setMemberEnabled(SUBJECT_ID, USER_ID, true);

      const deleteCalls = mockClient.query.mock.calls.filter(([sql]) =>
        String(sql).includes('DELETE FROM user_groups')
      );
      expect(deleteCalls).toHaveLength(0);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE user_subjects'), [
        SUBJECT_ID,
        USER_ID,
        true,
      ]);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(result).toBe(true);
    });

    it('returns false when the user is not a member', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // DELETE user_groups
        .mockResolvedValueOnce({ rowCount: 0 }) // UPDATE user_subjects
        .mockResolvedValueOnce({}); // COMMIT

      const result = await Subject.setMemberEnabled(SUBJECT_ID, USER_ID, false);
      expect(result).toBe(false);
    });

    it('rolls back and re-throws on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('boom')); // DELETE user_groups

      await expect(Subject.setMemberEnabled(SUBJECT_ID, USER_ID, false)).rejects.toThrow('boom');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('isMember', () => {
    it('returns true when an enabled membership row exists', async () => {
      pool.query.mockResolvedValue({ rows: [{ exists: true }] });
      expect(await Subject.isMember(SUBJECT_ID, USER_ID)).toBe(true);
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('enabled = true'));
    });

    it('returns false when no membership row exists', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.isMember(SUBJECT_ID, USER_ID)).toBe(false);
    });
  });
});
