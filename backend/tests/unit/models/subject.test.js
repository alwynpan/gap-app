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
    it('returns subjects the user belongs to', async () => {
      const rows = [{ id: SUBJECT_ID, name: 'Subject A' }];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.findForUser(USER_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('user_subjects'), [USER_ID]);
      expect(result).toEqual(rows);
    });

    it('returns empty array when the user has no subjects', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.findForUser(USER_ID)).toEqual([]);
    });
  });

  describe('findForUsers', () => {
    it('returns subject rows keyed by user for a batch of users', async () => {
      const rows = [{ user_id: USER_ID, id: SUBJECT_ID, name: 'Subject A' }];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.findForUsers([USER_ID]);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('user_subjects'), [[USER_ID]]);
      expect(result).toEqual(rows);
    });

    it('returns empty array for an empty user list without querying', async () => {
      expect(await Subject.findForUsers([])).toEqual([]);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('returns member users with role names', async () => {
      const rows = [{ id: USER_ID, username: 'u1', role_name: 'user' }];
      pool.query.mockResolvedValue({ rows });

      const result = await Subject.getMembers(SUBJECT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN user_subjects'), [SUBJECT_ID]);
      expect(result).toEqual(rows);
    });
  });

  describe('addUsers', () => {
    it('bulk-inserts memberships idempotently and returns the inserted count', async () => {
      pool.query.mockResolvedValue({ rowCount: 2 });

      const result = await Subject.addUsers(SUBJECT_ID, [USER_ID, 'u0000000-0000-0000-0000-000000000002']);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
        SUBJECT_ID,
        [USER_ID, 'u0000000-0000-0000-0000-000000000002'],
      ]);
      expect(result).toBe(2);
    });

    it('returns 0 for an empty user list without querying', async () => {
      const result = await Subject.addUsers(SUBJECT_ID, []);
      expect(result).toBe(0);
      expect(pool.query).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE user_groups within subject
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE user_subjects
        .mockResolvedValueOnce({}); // COMMIT

      const result = await Subject.removeUser(SUBJECT_ID, USER_ID);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('DELETE FROM user_groups'), [
        SUBJECT_ID,
        USER_ID,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, expect.stringContaining('DELETE FROM user_subjects'), [
        SUBJECT_ID,
        USER_ID,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns false when the user was not a member', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
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

  describe('isMember', () => {
    it('returns true when a membership row exists', async () => {
      pool.query.mockResolvedValue({ rows: [{ exists: true }] });
      expect(await Subject.isMember(SUBJECT_ID, USER_ID)).toBe(true);
    });

    it('returns false when no membership row exists', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Subject.isMember(SUBJECT_ID, USER_ID)).toBe(false);
    });
  });
});
