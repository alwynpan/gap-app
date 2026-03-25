const Group = require('../../../src/models/Group');

// Mock the database pool
jest.mock('../../../src/db/migrate', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
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
          id: '10000000-0000-4000-8000-000000000001',
          name: 'Alpha Team',
          enabled: true,
          max_members: null,
          member_count: 3,
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
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
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Test Group',
        enabled: true,
        max_members: 10,
        member_count: 3,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.findById('10000000-0000-4000-8000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('member_count'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findById('10000000-0000-4000-8000-000000000999');

      expect(result).toBeUndefined();
    });
  });

  describe('findEnabled', () => {
    it('returns only enabled groups with member_count', async () => {
      const mockGroups = [
        {
          id: '10000000-0000-4000-8000-000000000001',
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
        id: '10000000-0000-4000-8000-000000000001',
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
        id: '10000000-0000-4000-8000-000000000001',
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
        id: '10000000-0000-4000-8000-000000000001',
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
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Updated',
        enabled: false,
        max_members: 10,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('10000000-0000-4000-8000-000000000001', {
        name: 'Updated',
        enabled: false,
        maxMembers: 10,
      });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        'Updated',
        false,
        10,
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('updates group with name only', async () => {
      const mockUpdatedGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'New Name',
        enabled: true,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('10000000-0000-4000-8000-000000000001', { name: 'New Name' });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        'New Name',
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('updates group with enabled only', async () => {
      const mockUpdatedGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Original',
        enabled: false,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('10000000-0000-4000-8000-000000000001', { enabled: false });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE groups'), [
        false,
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('can set maxMembers to null (unlimited)', async () => {
      const mockUpdatedGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        max_members: null,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedGroup] });

      const result = await Group.update('10000000-0000-4000-8000-000000000001', { maxMembers: null });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('max_members'), [
        null,
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedGroup);
    });

    it('returns result from findById when no fields to update', async () => {
      const mockGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Group',
        member_count: 2,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.update('10000000-0000-4000-8000-000000000001', {});

      expect(result).toEqual(mockGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.update('10000000-0000-4000-8000-000000000999', { name: 'New Name' });

      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes group and returns deleted group', async () => {
      const mockDeletedGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Deleted Group',
        enabled: true,
      };
      pool.query.mockResolvedValue({ rows: [mockDeletedGroup] });

      const result = await Group.delete('10000000-0000-4000-8000-000000000001');

      expect(pool.query).toHaveBeenCalledWith('DELETE FROM groups WHERE id = $1 RETURNING *', [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockDeletedGroup);
    });

    it('returns undefined when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.delete('10000000-0000-4000-8000-000000000999');

      expect(result).toBeUndefined();
    });
  });

  describe('getMemberCount', () => {
    it('returns count of members in group', async () => {
      pool.query.mockResolvedValue({ rows: [{ count: 5 }] });

      const result = await Group.getMemberCount('10000000-0000-4000-8000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('COUNT'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toBe(5);
    });

    it('returns 0 for empty group', async () => {
      pool.query.mockResolvedValue({ rows: [{ count: 0 }] });

      const result = await Group.getMemberCount('10000000-0000-4000-8000-000000000002');

      expect(result).toBe(0);
    });
  });

  describe('getMembers', () => {
    it('returns group members with role info', async () => {
      const mockMembers = [
        {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'user1',
          email: 'user1@test.com',
          student_id: 'S001',
          enabled: true,
          role_name: 'user',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          username: 'user2',
          email: 'user2@test.com',
          student_id: 'S002',
          enabled: true,
          role_name: 'admin',
        },
      ];
      pool.query.mockResolvedValue({ rows: mockMembers });

      const result = await Group.getMembers('10000000-0000-4000-8000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT u.id, u.username, u.email'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockMembers);
    });

    it('returns empty array when group has no members', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.getMembers('10000000-0000-4000-8000-000000000001');

      expect(result).toEqual([]);
    });

    it('orders members by username', async () => {
      const mockMembers = [
        { id: '00000000-0000-4000-8000-000000000002', username: 'alice', email: 'alice@test.com', role_name: 'user' },
        { id: '00000000-0000-4000-8000-000000000001', username: 'bob', email: 'bob@test.com', role_name: 'admin' },
      ];
      pool.query.mockResolvedValue({ rows: mockMembers });

      const result = await Group.getMembers('10000000-0000-4000-8000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY u.username'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockMembers);
    });
  });

  describe('assignUserToGroup', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('assigns user to group successfully within a transaction', async () => {
      // BEGIN, SELECT FOR UPDATE (group found, not full), UPDATE users, COMMIT
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: '10000000-0000-4000-8000-000000000001',
              max_members: 5,
              member_count: 2,
            },
          ],
        }) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce() // UPDATE users
        .mockResolvedValueOnce(); // COMMIT

      await Group.assignUserToGroup('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FOR UPDATE'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE users SET group_id'), [
        '10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
      ]);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('throws 404 error and rolls back if group not found', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE — no rows
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(
        Group.assignUserToGroup('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000999')
      ).rejects.toMatchObject({ message: 'Group not found', statusCode: 404 });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('throws 409 error and rolls back if group is full', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: '10000000-0000-4000-8000-000000000001', max_members: 3, member_count: 3 }],
        }) // SELECT FOR UPDATE — group is full
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(
        Group.assignUserToGroup('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')
      ).rejects.toMatchObject({ message: 'Group is full', statusCode: 409 });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('allows assigning user when group has unlimited capacity (max_members null)', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: '10000000-0000-4000-8000-000000000001', max_members: null, member_count: 999 }],
        }) // SELECT FOR UPDATE
        .mockResolvedValueOnce() // UPDATE users
        .mockResolvedValueOnce(); // COMMIT

      await expect(
        Group.assignUserToGroup('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')
      ).resolves.toBeUndefined();

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rolls back and rethrows on unexpected DB error', async () => {
      const dbError = new Error('Connection lost');
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(dbError) // SELECT FOR UPDATE fails
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(
        Group.assignUserToGroup('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')
      ).rejects.toThrow('Connection lost');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
