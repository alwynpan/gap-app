jest.mock('../../../src/db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const pool = require('../../../src/db/pool');
const Assignment = require('../../../src/models/Assignment');

const SUBJECT_ID = 's0000000-0000-0000-0000-000000000001';
const ASSIGNMENT_ID = 'a0000000-0000-0000-0000-000000000001';
const USER_ID = 'u0000000-0000-0000-0000-000000000001';

describe('Assignment Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all assignments with subject name and group count', async () => {
      const rows = [{ id: ASSIGNMENT_ID, name: 'A1', subject_id: SUBJECT_ID, subject_name: 'S1', group_count: 3 }];
      pool.query.mockResolvedValue({ rows });

      const result = await Assignment.findAll();

      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('FROM assignments'));
      expect(result).toEqual(rows);
    });

    it('filters by subjectId when provided', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Assignment.findAll({ subjectId: SUBJECT_ID });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('a.subject_id = $1'), [SUBJECT_ID]);
    });
  });

  describe('findById', () => {
    it('returns the assignment with subject info', async () => {
      const row = { id: ASSIGNMENT_ID, name: 'A1', subject_id: SUBJECT_ID, subject_name: 'S1' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Assignment.findById(ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE a.id = $1'), [ASSIGNMENT_ID]);
      expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Assignment.findById(ASSIGNMENT_ID)).toBeNull();
    });
  });

  describe('findByName', () => {
    it('matches case-insensitively within the subject', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: ASSIGNMENT_ID }] });

      await Assignment.findByName(SUBJECT_ID, 'a1');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('subject_id = $1'), [SUBJECT_ID, 'a1']);
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('LOWER(name) = LOWER($2)'));
    });

    it('returns null when not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Assignment.findByName(SUBJECT_ID, 'nope')).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts with subject id and returns the row', async () => {
      const row = { id: ASSIGNMENT_ID, subject_id: SUBJECT_ID, name: 'A1' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Assignment.create(SUBJECT_ID, 'A1');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO assignments'), [SUBJECT_ID, 'A1']);
      expect(result).toEqual(row);
    });

    it('propagates unique-constraint errors', async () => {
      const err = new Error('duplicate');
      err.code = '23505';
      pool.query.mockRejectedValue(err);
      await expect(Assignment.create(SUBJECT_ID, 'Dup')).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('update', () => {
    it('updates the name', async () => {
      const row = { id: ASSIGNMENT_ID, name: 'Renamed' };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Assignment.update(ASSIGNMENT_ID, { name: 'Renamed' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE assignments SET'),
        expect.arrayContaining(['Renamed', ASSIGNMENT_ID])
      );
      expect(result).toEqual(row);
    });

    it('falls back to findById when no fields provided', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: ASSIGNMENT_ID }] });
      await Assignment.update(ASSIGNMENT_ID, {});
      expect(pool.query.mock.calls[0][0]).toEqual(expect.stringContaining('WHERE a.id = $1'));
    });
  });

  describe('delete', () => {
    it('deletes and returns the row', async () => {
      const row = { id: ASSIGNMENT_ID };
      pool.query.mockResolvedValue({ rows: [row] });

      const result = await Assignment.delete(ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith('DELETE FROM assignments WHERE id = $1 RETURNING *', [ASSIGNMENT_ID]);
      expect(result).toEqual(row);
    });
  });

  describe('findForUser', () => {
    it('returns assignments in the user subjects (derived participation)', async () => {
      const rows = [{ id: ASSIGNMENT_ID, subject_id: SUBJECT_ID }];
      pool.query.mockResolvedValue({ rows });

      const result = await Assignment.findForUser(USER_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('user_subjects'), [USER_ID]);
      expect(result).toEqual(rows);
    });
  });

  describe('findManagedBy', () => {
    it('returns assignments managed by the user', async () => {
      const rows = [{ id: ASSIGNMENT_ID, name: 'A1', subject_id: SUBJECT_ID, subject_name: 'S1' }];
      pool.query.mockResolvedValue({ rows });

      const result = await Assignment.findManagedBy(USER_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('assignment_managers'), [USER_ID]);
      expect(result).toEqual(rows);
    });

    it('returns empty array when the user manages nothing', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Assignment.findManagedBy(USER_ID)).toEqual([]);
    });
  });

  describe('isManager', () => {
    it('returns true when a manager row exists', async () => {
      pool.query.mockResolvedValue({ rows: [{ exists: true }] });
      expect(await Assignment.isManager(USER_ID, ASSIGNMENT_ID)).toBe(true);
    });

    it('returns false when no manager row exists', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Assignment.isManager(USER_ID, ASSIGNMENT_ID)).toBe(false);
    });
  });

  describe('getManagers', () => {
    it('returns manager users', async () => {
      const rows = [{ id: USER_ID, username: 'am1' }];
      pool.query.mockResolvedValue({ rows });

      const result = await Assignment.getManagers(ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('JOIN assignment_managers'), [ASSIGNMENT_ID]);
      expect(result).toEqual(rows);
    });
  });

  describe('setManagers', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('replaces the manager set in a transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await Assignment.setManagers(ASSIGNMENT_ID, [USER_ID]);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('DELETE FROM assignment_managers'), [
        ASSIGNMENT_ID,
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO assignment_managers'), [
        ASSIGNMENT_ID,
        [USER_ID],
      ]);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('clears all managers when given an empty list', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await Assignment.setManagers(ASSIGNMENT_ID, []);

      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('DELETE FROM assignment_managers'), [
        ASSIGNMENT_ID,
      ]);
      // No INSERT for an empty set
      const insertCalls = mockClient.query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO assignment_managers')
      );
      expect(insertCalls).toHaveLength(0);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    });

    it('rolls back and re-throws on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('boom'));

      await expect(Assignment.setManagers(ASSIGNMENT_ID, [USER_ID])).rejects.toThrow('boom');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('addManagers', () => {
    it('adds the user as manager of multiple assignments idempotently and returns the inserted count', async () => {
      pool.query.mockResolvedValue({ rowCount: 2 });

      const result = await Assignment.addManagers(USER_ID, [ASSIGNMENT_ID, 'a0000000-0000-0000-0000-000000000002']);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
        USER_ID,
        [ASSIGNMENT_ID, 'a0000000-0000-0000-0000-000000000002'],
      ]);
      expect(result).toBe(2);
    });

    it('returns 0 for an empty assignment list without querying', async () => {
      const result = await Assignment.addManagers(USER_ID, []);
      expect(result).toBe(0);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('managesAnyInSubject', () => {
    it('returns true when the user manages an assignment in the subject', async () => {
      pool.query.mockResolvedValue({ rows: [{ exists: true }] });
      expect(await Assignment.managesAnyInSubject(USER_ID, SUBJECT_ID)).toBe(true);
    });

    it('returns false otherwise', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      expect(await Assignment.managesAnyInSubject(USER_ID, SUBJECT_ID)).toBe(false);
    });
  });
});
