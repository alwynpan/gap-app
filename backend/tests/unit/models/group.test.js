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
    it('returns all groups with member_count ordered by name', async () => {
      const mockGroups = [
        {
          id: 'g0000000-0000-0000-0000-000000000001',
          name: 'Alpha Team',
          enabled: true,
          max_members: null,
          member_count: 3,
        },
        {
          id: 'g0000000-0000-0000-0000-000000000002',
          name: 'Beta Team',
          enabled: true,
          max_members: 5,
          member_count: 2,
        },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findAll();

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('member_count'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY g.name'));
      expect(result).toEqual(mockGroups);
    });

    it('returns empty array when no groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns group by id with member_count', async () => {
      const mockGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Test Group',
        enabled: true,
        max_members: 10,
        member_count: 3,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.findById('g0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('member_count'), [
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findById('g0000000-0000-0000-0000-000000000999');

      expect(result).toBeUndefined();
    });
  });

  describe('findEnabled', () => {
    it('returns only enabled groups with member_count', async () => {
      const mockGroups = [
        {
          id: 'g0000000-0000-0000-0000-000000000001',
          name: 'Active Team',
          enabled: true,
          max_members: null,
          member_count: 2,
        },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findEnabled();

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('enabled = true'));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('member_count'));
      expect(result).toEqual(mockGroups);
    });

    it('returns empty array when no enabled groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findEnabled();

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates group with defaults (enabled=true, maxMembers=null)', async () => {
      const mockGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'New Group',
        enabled: true,
        max_members: null,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create('New Group');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO groups'), ['New Group', true, null]);
      expect(result).toEqual(mockGroup);
    });

    it('creates group with enabled=false', async () => {
      const mockGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Disabled Group',
        enabled: false,
        max_members: null,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create('Disabled Group', false);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO groups'), [
        'Disabled Group',
        false,
        null,
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('creates group with maxMembers', async () => {
      const mockGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Limited Group',
        enabled: true,
        max_members: 5,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create('Limited Group', true, 5);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO groups'), [
        'Limited Group',
        true,
        5,
      ]);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('update', () => {
    it('updates group with all fields including maxMembers', async () => {
      const mockUpdatedGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Updated',
        enabled: false,
        max_members: 10,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('g0000000-0000-0000-0000-000000000001', {
        name: 'Updated',
        enabled: false,
        maxMembers: 10,
      });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        'Updated',
        false,
        10,
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('updates group with name only', async () => {
      const mockUpdatedGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'New Name',
        enabled: true,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('g0000000-0000-0000-0000-000000000001', { name: 'New Name' });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        'New Name',
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('updates group with enabled only', async () => {
      const mockUpdatedGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Original',
        enabled: false,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('g0000000-0000-0000-0000-000000000001', { enabled: false });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        false,
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('can set maxMembers to null (unlimited)', async () => {
      const mockUpdatedGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Group',
        max_members: null,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('g0000000-0000-0000-0000-000000000001', { maxMembers: null });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('max_members'), [
        null,
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('returns result from findById when no fields to update', async () => {
      const mockGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Group',
        member_count: 2,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.update('g0000000-0000-0000-0000-000000000001', {});

      expect(result).toEqual(mockGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.update('g0000000-0000-0000-0000-000000000999', { name: 'New Name' });

      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes group and returns deleted group', async () => {
      const mockDeletedGroup = {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Deleted Group',
        enabled: true,
      };
      pool.query.mockResolvedValue({ rows: [mockDeletedGroup] });

      const result = await Group.delete('g0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith('DELETE FROM groups WHERE id = $1 RETURNING *', [
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockDeletedGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.delete('g0000000-0000-0000-0000-000000000999');

      expect(result).toBeUndefined();
    });
  });

  describe('getMemberCount', () => {
    it('returns count of members in group', async () => {
      pool.query.mockResolvedValue({ rows: [{ count: 5 }] });

      const result = await Group.getMemberCount('g0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('COUNT'), [
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toBe(5);
    });

    it('returns 0 for empty group', async () => {
      pool.query.mockResolvedValue({ rows: [{ count: 0 }] });

      const result = await Group.getMemberCount('g0000000-0000-0000-0000-000000000002');

      expect(result).toBe(0);
    });
  });

  describe('getMembers', () => {
    it('returns group members with role info', async () => {
      const mockMembers = [
        {
          id: 'u0000000-0000-0000-0000-000000000001',
          username: 'user1',
          email: 'user1@test.com',
          student_id: 'S001',
          enabled: true,
          role_name: 'user',
        },
        {
          id: 'u0000000-0000-0000-0000-000000000002',
          username: 'user2',
          email: 'user2@test.com',
          student_id: 'S002',
          enabled: true,
          role_name: 'admin',
        },
      ];
      pool.query.mockResolvedValue({ rows: mockMembers });

      const result = await Group.getMembers('g0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT u.id, u.username, u.email'), [
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockMembers);
    });

    it('returns empty array when group has no members', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.getMembers('g0000000-0000-0000-0000-000000000001');

      expect(result).toEqual([]);
    });

    it('orders members by username', async () => {
      const mockMembers = [
        { id: 'u0000000-0000-0000-0000-000000000002', username: 'alice', email: 'alice@test.com', role_name: 'user' },
        { id: 'u0000000-0000-0000-0000-000000000001', username: 'bob', email: 'bob@test.com', role_name: 'admin' },
      ];
      pool.query.mockResolvedValue({ rows: mockMembers });

      const result = await Group.getMembers('g0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY u.username'), [
        'g0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockMembers);
    });
  });
});
