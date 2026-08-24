const Group = require('../../../src/models/Group');

// Mock the database pool
jest.mock('../../../src/db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const pool = require('../../../src/db/pool');

const ASSIGNMENT_ID = 'a0000000-0000-4000-8000-000000000001';

describe('Group Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllByAssignment', () => {
    it('returns groups for the assignment with member_count ordered by name', async () => {
      const mockGroups = [
        {
          id: '10000000-0000-4000-8000-000000000001',
          assignment_id: ASSIGNMENT_ID,
          name: 'Alpha Team',
          enabled: true,
          max_members: null,
          member_count: 3,
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          assignment_id: ASSIGNMENT_ID,
          name: 'Beta Team',
          enabled: true,
          max_members: 5,
          member_count: 2,
        },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findAllByAssignment(ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('member_count'), [ASSIGNMENT_ID]);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('assignment_id = $1'), [ASSIGNMENT_ID]);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY g.name'), [ASSIGNMENT_ID]);
      expect(result).toEqual(mockGroups);
    });

    it('counts members from user_groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Group.findAllByAssignment(ASSIGNMENT_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM user_groups'), [ASSIGNMENT_ID]);
    });

    it('filters to enabled groups when enabledOnly is true', async () => {
      const mockGroups = [
        {
          id: '10000000-0000-4000-8000-000000000001',
          assignment_id: ASSIGNMENT_ID,
          name: 'Active Team',
          enabled: true,
          max_members: null,
          member_count: 2,
        },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findAllByAssignment(ASSIGNMENT_ID, { enabledOnly: true });

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('enabled = true'), [ASSIGNMENT_ID]);
      expect(result).toEqual(mockGroups);
    });

    it('does not filter by enabled when enabledOnly is false', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Group.findAllByAssignment(ASSIGNMENT_ID, { enabledOnly: false });

      expect(pool.query).not.toHaveBeenCalledWith(expect.stringContaining('enabled = true'), expect.anything());
    });

    it('returns empty array when assignment has no groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findAllByAssignment(ASSIGNMENT_ID);

      expect(result).toEqual([]);
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(Group.findAllByAssignment(ASSIGNMENT_ID)).rejects.toThrow('connection refused');
    });
  });

  describe('findById', () => {
    it('returns group by id with assignment/subject info and member_count', async () => {
      const mockGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'Test Group',
        enabled: true,
        max_members: 10,
        member_count: 3,
        assignment_name: 'Assignment 1',
        subject_id: 's0000000-0000-4000-8000-000000000001',
        subject_name: 'COMP10001',
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.findById('10000000-0000-4000-8000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('member_count'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('assignment_name'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('subject_name'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('returns null when group not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findById('10000000-0000-4000-8000-000000000999');

      expect(result).toBeNull();
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(Group.findById('10000000-0000-4000-8000-000000000001')).rejects.toThrow('connection refused');
    });
  });

  describe('findByIds', () => {
    it('returns matching groups for the given ids', async () => {
      const mockGroups = [
        { id: '10000000-0000-4000-8000-000000000001', assignment_id: ASSIGNMENT_ID, name: 'Group A' },
        { id: '10000000-0000-4000-8000-000000000002', assignment_id: ASSIGNMENT_ID, name: 'Group B' },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findByIds([
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
      ]);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ANY($1)'), [
        ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'],
      ]);
      expect(result).toEqual(mockGroups);
    });

    it('returns empty array without querying when ids is empty', async () => {
      const result = await Group.findByIds([]);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array without querying when ids is undefined', async () => {
      const result = await Group.findByIds(undefined);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array when no ids match', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findByIds(['10000000-0000-4000-8000-000000000999']);

      expect(result).toEqual([]);
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(Group.findByIds(['10000000-0000-4000-8000-000000000001'])).rejects.toThrow('connection refused');
    });
  });

  describe('create', () => {
    it('creates group with defaults (enabled=true, maxMembers=null)', async () => {
      const mockGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'New Group',
        enabled: true,
        max_members: null,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create(ASSIGNMENT_ID, 'New Group');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO groups'), [
        ASSIGNMENT_ID,
        'New Group',
        true,
        null,
      ]);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('assignment_id'), expect.any(Array));
      expect(result).toEqual(mockGroup);
    });

    it('creates group with enabled=false', async () => {
      const mockGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'Disabled Group',
        enabled: false,
        max_members: null,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create(ASSIGNMENT_ID, 'Disabled Group', false);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO groups'), [
        ASSIGNMENT_ID,
        'Disabled Group',
        false,
        null,
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('creates group with maxMembers', async () => {
      const mockGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'Limited Group',
        enabled: true,
        max_members: 5,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.create(ASSIGNMENT_ID, 'Limited Group', true, 5);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO groups'), [
        ASSIGNMENT_ID,
        'Limited Group',
        true,
        5,
      ]);
      expect(result).toEqual(mockGroup);
    });

    it('propagates DB error (e.g. unique constraint)', async () => {
      const uniqueErr = new Error('duplicate key value violates unique constraint');
      uniqueErr.code = '23505';
      pool.query.mockRejectedValue(uniqueErr);

      await expect(Group.create(ASSIGNMENT_ID, 'Dup Group')).rejects.toMatchObject({ code: '23505' });
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
    it('returns count of members in group from user_groups', async () => {
      pool.query.mockResolvedValue({ rows: [{ count: 5 }] });

      const result = await Group.getMemberCount('10000000-0000-4000-8000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM user_groups'), [
        '10000000-0000-4000-8000-000000000001',
      ]);
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

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(Group.getMemberCount('10000000-0000-4000-8000-000000000001')).rejects.toThrow('connection refused');
    });
  });

  describe('bulkCreate', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('inserts multiple groups with assignment_id in a single transaction and returns created rows', async () => {
      const input = [
        { name: 'Group A', enabled: true, maxMembers: null },
        { name: 'Group B', enabled: false, maxMembers: 5 },
      ];
      const row1 = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'Group A',
        enabled: true,
        max_members: null,
      };
      const row2 = {
        id: '10000000-0000-4000-8000-000000000002',
        assignment_id: ASSIGNMENT_ID,
        name: 'Group B',
        enabled: false,
        max_members: 5,
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [row1] }) // INSERT Group A
        .mockResolvedValueOnce({ rows: [row2] }) // INSERT Group B
        .mockResolvedValueOnce(); // COMMIT

      const result = await Group.bulkCreate(ASSIGNMENT_ID, input);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        'INSERT INTO groups (assignment_id, name, enabled, max_members) VALUES ($1, $2, $3, $4) RETURNING *',
        [ASSIGNMENT_ID, 'Group A', true, null]
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(
        3,
        'INSERT INTO groups (assignment_id, name, enabled, max_members) VALUES ($1, $2, $3, $4) RETURNING *',
        [ASSIGNMENT_ID, 'Group B', false, 5]
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual([row1, row2]);
    });

    it('commits transaction and releases client on success', async () => {
      const input = [{ name: 'Solo Group', enabled: true, maxMembers: null }];
      const row = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'Solo Group',
        enabled: true,
        max_members: null,
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [row] }) // INSERT
        .mockResolvedValueOnce(); // COMMIT

      await Group.bulkCreate(ASSIGNMENT_ID, input);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back and rethrows on INSERT error (e.g. unique constraint)', async () => {
      const input = [
        { name: 'Existing Group', enabled: true, maxMembers: null },
        { name: 'New Group', enabled: true, maxMembers: null },
      ];
      const uniqueErr = new Error('duplicate key value violates unique constraint');
      uniqueErr.code = '23505';

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(uniqueErr) // INSERT fails
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(Group.bulkCreate(ASSIGNMENT_ID, input)).rejects.toMatchObject({ code: '23505' });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back and rethrows on unexpected DB error', async () => {
      const input = [{ name: 'Group A', enabled: true, maxMembers: null }];
      const dbErr = new Error('Connection lost');

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(dbErr) // INSERT fails
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(Group.bulkCreate(ASSIGNMENT_ID, input)).rejects.toThrow('Connection lost');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('handles a single-item batch correctly', async () => {
      const input = [{ name: 'One Group', enabled: true, maxMembers: 10 }];
      const row = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'One Group',
        enabled: true,
        max_members: 10,
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [row] }) // INSERT
        .mockResolvedValueOnce(); // COMMIT

      const result = await Group.bulkCreate(ASSIGNMENT_ID, input);

      expect(result).toEqual([row]);
    });

    it('returns empty array and commits when input is empty', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce(); // COMMIT

      const result = await Group.bulkCreate(ASSIGNMENT_ID, []);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('releases client even when ROLLBACK itself throws', async () => {
      const input = [{ name: 'Group A', enabled: true, maxMembers: null }];
      const dbErr = new Error('Insert failed');
      const rollbackErr = new Error('Rollback failed');

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(dbErr) // INSERT fails
        .mockRejectedValueOnce(rollbackErr); // ROLLBACK also throws

      // When ROLLBACK itself throws, that error propagates (the finally block still releases)
      await expect(Group.bulkCreate(ASSIGNMENT_ID, input)).rejects.toThrow('Rollback failed');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('bulkDelete', () => {
    it('executes DELETE … WHERE id = ANY and returns row count', async () => {
      pool.query.mockResolvedValue({ rowCount: 3 });

      const result = await Group.bulkDelete(['id1', 'id2', 'id3']);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM groups'), [['id1', 'id2', 'id3']]);
      expect(result).toBe(3);
    });

    it('returns 0 when no rows matched', async () => {
      pool.query.mockResolvedValue({ rowCount: 0 });

      const result = await Group.bulkDelete(['nonexistent-id']);

      expect(result).toBe(0);
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(Group.bulkDelete(['id1'])).rejects.toThrow('connection refused');
    });
  });

  describe('findByName', () => {
    it('returns group when name matches within the assignment (case-insensitive)', async () => {
      const mockGroup = {
        id: '10000000-0000-4000-8000-000000000001',
        assignment_id: ASSIGNMENT_ID,
        name: 'Team Alpha',
        enabled: true,
        max_members: null,
      };
      pool.query.mockResolvedValue({ rows: [mockGroup] });

      const result = await Group.findByName(ASSIGNMENT_ID, 'team alpha');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('assignment_id = $1 AND LOWER(name) = LOWER($2)'),
        [ASSIGNMENT_ID, 'team alpha']
      );
      expect(result).toEqual(mockGroup);
    });

    it('returns null when group name not found in the assignment', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findByName(ASSIGNMENT_ID, 'nonexistent');

      expect(result).toBeNull();
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(Group.findByName(ASSIGNMENT_ID, 'team alpha')).rejects.toThrow('connection refused');
    });
  });

  describe('findByNames', () => {
    it('returns groups matching the given names within the assignment (case-insensitive)', async () => {
      const mockGroups = [
        {
          id: '10000000-0000-4000-8000-000000000001',
          assignment_id: ASSIGNMENT_ID,
          name: 'Team Alpha',
          enabled: true,
          max_members: null,
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          assignment_id: ASSIGNMENT_ID,
          name: 'Team Beta',
          enabled: true,
          max_members: 5,
        },
      ];
      pool.query.mockResolvedValue({ rows: mockGroups });

      const result = await Group.findByNames(ASSIGNMENT_ID, ['Team Alpha', 'Team Beta']);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('assignment_id = $1 AND LOWER(name) = ANY($2::text[])'),
        [ASSIGNMENT_ID, ['team alpha', 'team beta']]
      );
      expect(result).toEqual(mockGroups);
    });

    it('lowercases all names before querying', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Group.findByNames(ASSIGNMENT_ID, ['UPPER GROUP', 'MiXeD Group']);

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [ASSIGNMENT_ID, ['upper group', 'mixed group']]);
    });

    it('returns empty array without querying when names is empty', async () => {
      const result = await Group.findByNames(ASSIGNMENT_ID, []);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array without querying when names is undefined', async () => {
      const result = await Group.findByNames(ASSIGNMENT_ID, undefined);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array when no names match', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Group.findByNames(ASSIGNMENT_ID, ['nonexistent group']);

      expect(result).toEqual([]);
    });
  });

  describe('removed methods', () => {
    it.each(['findAll', 'findEnabled', 'assignUserToGroup', 'getExportMappings', 'getMembers'])(
      'no longer exposes %s (moved or removed)',
      (method) => {
        expect(Group[method]).toBeUndefined();
      }
    );
  });
});
