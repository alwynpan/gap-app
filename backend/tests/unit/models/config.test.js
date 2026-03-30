'use strict';

const Config = require('../../../src/models/Config');

jest.mock('../../../src/db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const pool = require('../../../src/db/pool');

describe('Config Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('returns the value for an existing key', async () => {
      pool.query.mockResolvedValue({ rows: [{ value: 'false' }] });

      const result = await Config.get('group_join_locked');

      expect(pool.query).toHaveBeenCalledWith('SELECT value FROM config WHERE key = $1', ['group_join_locked']);
      expect(result).toBe('false');
    });

    it('returns null when key does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Config.get('nonexistent_key');

      expect(result).toBeNull();
    });

    it('returns the value string as-is', async () => {
      pool.query.mockResolvedValue({ rows: [{ value: 'true' }] });

      const result = await Config.get('group_join_locked');

      expect(result).toBe('true');
    });
  });

  describe('set', () => {
    it('upserts a config value and returns the updated row', async () => {
      const mockRow = { key: 'group_join_locked', value: 'true', updated_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await Config.set('group_join_locked', 'true');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), ['group_join_locked', 'true']);
      expect(result).toEqual(mockRow);
    });

    it('uses INSERT ... ON CONFLICT DO UPDATE pattern', async () => {
      pool.query.mockResolvedValue({ rows: [{ key: 'group_join_locked', value: 'false' }] });

      await Config.set('group_join_locked', 'false');

      const sql = pool.query.mock.calls[0][0];
      expect(sql).toMatch(/INSERT INTO config/i);
      expect(sql).toMatch(/ON CONFLICT/i);
      expect(sql).toMatch(/RETURNING/i);
    });
  });

  describe('getAll', () => {
    it('returns all config rows ordered by key', async () => {
      const mockRows = [
        { key: 'group_join_locked', value: 'false', updated_at: new Date() },
        { key: 'some_other_key', value: 'value', updated_at: new Date() },
      ];
      pool.query.mockResolvedValue({ rows: mockRows });

      const result = await Config.getAll();

      expect(pool.query).toHaveBeenCalledWith('SELECT key, value, updated_at FROM config ORDER BY key');
      expect(result).toEqual(mockRows);
    });

    it('returns empty array when no config rows', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Config.getAll();

      expect(result).toEqual([]);
    });
  });
});
