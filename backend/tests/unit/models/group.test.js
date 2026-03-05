const Group = require('../../../src/models/Group');

// Mock the database pool
jest.mock('../../../src/db/migrate', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../../../src/db/migrate');

describe('Group Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all groups ordered by name', async () => {
      const mockGroups = [
        { id: 1, name: 'Alpha Team', enabled: true, created_at: new Date(), updated_at: new Date() },
        { id: 2, name: 'Beta Team', enabled: true, created_at: new Date(), updated_at: new Date() },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findAll();

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM groups ORDER BY name');
      expect(result).toEqual(mockGroups);
    });

    it('returns empty array when no groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns group by id', async () => {
      const mockGroup = { id: 1, name: 'Test Group', enabled: true, created_at: new Date(), updated_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.findById(1);

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM groups WHERE id = $1', [1]);
      expect(result).toEqual(mockGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findById(999);

      expect(result).toBeUndefined();
    });
  });

  describe('findEnabled', () => {
    it('returns only enabled groups', async () => {
      const mockGroups = [
        { id: 1, name: 'Active Team', enabled: true },
        { id: 2, name: 'Another Active Team', enabled: true },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findEnabled();

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM groups WHERE enabled = true ORDER BY name');
      expect(result).toEqual(mockGroups);
    });

    it('returns empty array when no enabled groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findEnabled();

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates group with enabled=true by default', async () => {
      const mockGroup = { id: 1, name: 'New Group', enabled: true, created_at: new Date(), updated_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create('New Group');

      expect(pool.query).toHaveBeenCalledWith('INSERT INTO groups (name, enabled) VALUES ($1, $2) RETURNING *', [
        'New Group',
        true,
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('creates group with enabled=false', async () => {
      const mockGroup = {
        id: 1,
        name: 'Disabled Group',
        enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create('Disabled Group', false);

      expect(pool.query).toHaveBeenCalledWith('INSERT INTO groups (name, enabled) VALUES ($1, $2) RETURNING *', [
        'Disabled Group',
        false,
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('creates group with enabled=true explicitly', async () => {
      const mockGroup = {
        id: 1,
        name: 'Explicit Enabled Group',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create('Explicit Enabled Group', true);

      expect(pool.query).toHaveBeenCalledWith('INSERT INTO groups (name, enabled) VALUES ($1, $2) RETURNING *', [
        'Explicit Enabled Group',
        true,
      ]);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('update', () => {
    it('updates group with all fields', async () => {
      const updates = {
        name: 'Updated Group Name',
        enabled: false,
      };
      const mockUpdatedGroup = { id: 1, name: 'Updated Group Name', enabled: false };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update(1, updates);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        'Updated Group Name',
        false,
        1,
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('updates group with partial fields (name only)', async () => {
      const updates = {
        name: 'Updated Name Only',
      };
      const mockUpdatedGroup = { id: 1, name: 'Updated Name Only', enabled: true };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update(1, updates);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        'Updated Name Only',
        undefined,
        1,
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('updates group with partial fields (enabled only)', async () => {
      const updates = {
        enabled: false,
      };
      const mockUpdatedGroup = { id: 1, name: 'Original Name', enabled: false };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update(1, updates);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [undefined, false, 1]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.update(999, { name: 'New Name' });

      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes group and returns deleted group', async () => {
      const mockDeletedGroup = { id: 1, name: 'Deleted Group', enabled: true };
      pool.query.mockResolvedValue({ rows: [mockDeletedGroup] });

      const result = await Group.delete(1);

      expect(pool.query).toHaveBeenCalledWith('DELETE FROM groups WHERE id = $1 RETURNING *', [1]);
      expect(result).toEqual(mockDeletedGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.delete(999);

      expect(result).toBeUndefined();
    });
  });

  describe('getMembers', () => {
    it('returns group members with role info', async () => {
      const mockMembers = [
        { id: 1, username: 'user1', email: 'user1@test.com', student_id: 'S001', enabled: true, role_name: 'user' },
        { id: 2, username: 'user2', email: 'user2@test.com', student_id: 'S002', enabled: true, role_name: 'admin' },
      ];
      pool.query.mockResolvedValue({ rows: mockMembers });

      const result = await Group.getMembers(1);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT u.id, u.username, u.email'), [1]);
      expect(result).toEqual(mockMembers);
    });

    it('returns empty array when group has no members', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.getMembers(1);

      expect(result).toEqual([]);
    });

    it('orders members by username', async () => {
      const mockMembers = [
        { id: 2, username: 'alice', email: 'alice@test.com', role_name: 'user' },
        { id: 1, username: 'bob', email: 'bob@test.com', role_name: 'admin' },
      ];
      pool.query.mockResolvedValue({ rows: mockMembers });

      const result = await Group.getMembers(1);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY u.username'), [1]);
      expect(result).toEqual(mockMembers);
    });
  });
});
