const User = require('../../../src/models/User');

// Mock the database pool
jest.mock('../../../src/db/pool', () => ({
  query: jest.fn(),
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const pool = require('../../../src/db/pool');

const SUBJECT_ID = 's0000000-0000-4000-8000-000000000001';
const ASSIGNMENT_ID = 'a0000000-0000-4000-8000-000000000001';
const GROUP_ID = 'g0000000-0000-4000-8000-000000000001';
const MANAGER_ID = 'm0000000-0000-4000-8000-000000000001';

describe('User Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all users with role info', async () => {
      const mockUsers = [
        {
          id: 'u0000000-0000-0000-0000-000000000001',
          username: 'user1',
          email: 'user1@test.com',
          role_name: 'user',
        },
        {
          id: 'u0000000-0000-0000-0000-000000000002',
          username: 'user2',
          email: 'user2@test.com',
          role_name: 'admin',
        },
      ];
      pool.query.mockResolvedValue({ rows: mockUsers });

      const result = await User.findAll();

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockUsers);
    });

    it('does not join or select from groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll();

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('LEFT JOIN groups');
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns empty array when no users', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findAll();

      expect(result).toEqual([]);
    });

    it('filters by role', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll({ role: 'admin' });

      const [sql, values] = pool.query.mock.calls[0];
      expect(sql).toContain('r.name = $1');
      expect(values).toEqual(['admin']);
    });

    it('filters by status', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll({ status: 'pending' });

      const [sql, values] = pool.query.mock.calls[0];
      expect(sql).toContain('u.status = $1');
      expect(values).toEqual(['pending']);
    });

    it('filters by subjectId using user_subjects EXISTS', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll({ subjectId: SUBJECT_ID });

      const [sql, values] = pool.query.mock.calls[0];
      expect(sql).toContain('FROM user_subjects us');
      expect(sql).toContain('us.subject_id = $1');
      expect(values).toEqual([SUBJECT_ID]);
    });

    it('filters by groupId using user_groups EXISTS', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll({ groupId: GROUP_ID });

      const [sql, values] = pool.query.mock.calls[0];
      expect(sql).toContain('FROM user_groups ug');
      expect(sql).toContain('ug.group_id = $1');
      expect(values).toEqual([GROUP_ID]);
    });

    it('filters ungrouped users of an assignment when groupId is "none" with assignmentId', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll({ assignmentId: ASSIGNMENT_ID, groupId: 'none' });

      const [sql, values] = pool.query.mock.calls[0];
      // Enrolled in the assignment's subject...
      expect(sql).toContain('JOIN assignments a ON a.subject_id = us.subject_id');
      expect(sql).toContain('a.id = $1');
      // ...but with no user_groups row for the assignment
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('ug.assignment_id = $2');
      expect(values).toEqual([ASSIGNMENT_ID, ASSIGNMENT_ID]);
    });

    it('scopes users by managedBy via assignment_managers', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll({ managedBy: MANAGER_ID });

      const [sql, values] = pool.query.mock.calls[0];
      expect(sql).toContain('JOIN assignment_managers am ON am.assignment_id = a.id');
      expect(sql).toContain('am.user_id = $1');
      expect(values).toEqual([MANAGER_ID]);
    });

    it('combines multiple filters with sequential placeholders', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findAll({ role: 'user', status: 'active', subjectId: SUBJECT_ID });

      const [sql, values] = pool.query.mock.calls[0];
      expect(sql).toContain('r.name = $1');
      expect(sql).toContain('u.status = $2');
      expect(sql).toContain('us.subject_id = $3');
      expect(values).toEqual(['user', 'active', SUBJECT_ID]);
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(User.findAll()).rejects.toThrow('connection refused');
    });
  });

  describe('findByIds', () => {
    it('returns matching users for the given ids', async () => {
      const mockUsers = [
        { id: 'u0000000-0000-0000-0000-000000000001', username: 'user1', status: 'pending' },
        { id: 'u0000000-0000-0000-0000-000000000002', username: 'user2', status: 'active' },
      ];
      pool.query.mockResolvedValue({ rows: mockUsers });

      const result = await User.findByIds([
        'u0000000-0000-0000-0000-000000000001',
        'u0000000-0000-0000-0000-000000000002',
      ]);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = ANY($1)'), [
        ['u0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000002'],
      ]);
      expect(result).toEqual(mockUsers);
    });

    it('does not join or select from groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByIds(['u0000000-0000-0000-0000-000000000001']);

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('LEFT JOIN groups');
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns empty array without querying when ids is empty', async () => {
      const result = await User.findByIds([]);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array without querying when ids is undefined', async () => {
      const result = await User.findByIds(undefined);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(User.findByIds(['u0000000-0000-0000-0000-000000000001'])).rejects.toThrow('connection refused');
    });
  });

  describe('findById', () => {
    it('returns user by id with role info', async () => {
      const mockUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        role_name: 'user',
      };
      pool.query.mockResolvedValue({ rows: [mockUser] });

      const result = await User.findById('u0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = $1'), [
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUser);
    });

    it('does not join or select from groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findById('u0000000-0000-0000-0000-000000000001');

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('LEFT JOIN groups');
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns null when user not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findById('u0000000-0000-0000-0000-000000000999');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('returns user by username with password hash', async () => {
      const mockUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        password_hash: 'hashed123',
        role_name: 'user',
      };
      pool.query.mockResolvedValue({ rows: [mockUser] });

      const result = await User.findByUsername('testuser');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE LOWER(u.username) = LOWER($1)'), [
        'testuser',
      ]);
      expect(result).toEqual(mockUser);
    });

    it('does not join or select from groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByUsername('testuser');

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('LEFT JOIN groups');
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns null when username not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmails', () => {
    it('returns users matching the given emails', async () => {
      const mockUsers = [
        { id: 'u1', email: 'a@test.com', role_name: 'user' },
        { id: 'u2', email: 'b@test.com', role_name: 'user' },
      ];
      pool.query.mockResolvedValue({ rows: mockUsers });

      const result = await User.findByEmails(['a@test.com', 'b@test.com']);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.email = ANY($1)'), [
        ['a@test.com', 'b@test.com'],
      ]);
      expect(result).toEqual(mockUsers);
    });

    it('does not select group columns', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByEmails(['a@test.com']);

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns empty array without querying when emails is empty', async () => {
      const result = await User.findByEmails([]);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array without querying when emails is undefined', async () => {
      const result = await User.findByEmails(undefined);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array when no emails match', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findByEmails(['nobody@test.com']);

      expect(result).toEqual([]);
    });
  });

  describe('findByUsernames', () => {
    it('returns users matching the given usernames (case-insensitive)', async () => {
      const mockUsers = [
        { id: 'u1', username: 'alice', email: 'a@test.com', role_name: 'user' },
        { id: 'u2', username: 'bob', email: 'b@test.com', role_name: 'admin' },
      ];
      pool.query.mockResolvedValue({ rows: mockUsers });

      const result = await User.findByUsernames(['Alice', 'Bob']);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE LOWER(u.username) = ANY($1)'), [
        ['alice', 'bob'],
      ]);
      expect(result).toEqual(mockUsers);
    });

    it('lowercases all usernames before querying', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByUsernames(['UPPER', 'MiXeD']);

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [['upper', 'mixed']]);
    });

    it('does not join or select from groups', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByUsernames(['alice']);

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('LEFT JOIN groups');
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns empty array without querying when usernames is empty', async () => {
      const result = await User.findByUsernames([]);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array without querying when usernames is undefined', async () => {
      const result = await User.findByUsernames(undefined);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('findByStudentIds', () => {
    it('returns users matching the given student IDs', async () => {
      const mockUsers = [
        { id: 'u1', username: 'alice', student_id: 'S001' },
        { id: 'u2', username: 'bob', student_id: 'S002' },
      ];
      pool.query.mockResolvedValue({ rows: mockUsers });

      const result = await User.findByStudentIds(['S001', 'S002']);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE student_id = ANY($1)'), [
        ['S001', 'S002'],
      ]);
      expect(result).toEqual(mockUsers);
    });

    it('does not select group columns', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByStudentIds(['S001']);

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns empty array without querying when studentIds is empty', async () => {
      const result = await User.findByStudentIds([]);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array without querying when studentIds is undefined', async () => {
      const result = await User.findByStudentIds(undefined);

      expect(pool.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array when no student IDs match', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findByStudentIds(['S999']);

      expect(result).toEqual([]);
    });
  });

  describe('findByStudentId', () => {
    it('returns the user row when a matching student_id exists', async () => {
      const mockUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'alice',
        student_id: 'S001',
      };
      pool.query.mockResolvedValue({ rows: [mockUser] });

      const result = await User.findByStudentId('S001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE student_id = $1'), ['S001']);
      expect(result).toEqual(mockUser);
    });

    it('does not select group columns', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByStudentId('S001');

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns null when no row matches', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findByStudentId('S999');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('returns user by email', async () => {
      const mockUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        email: 'test@test.com',
        username: 'testuser',
      };
      pool.query.mockResolvedValue({ rows: [mockUser] });

      const result = await User.findByEmail('test@test.com');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.email = $1'), ['test@test.com']);
      expect(result).toEqual(mockUser);
    });

    it('does not select group columns', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await User.findByEmail('test@test.com');

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('group_id');
      expect(sql).not.toContain('group_name');
    });

    it('returns null when email not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findByEmail('nonexistent@test.com');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates user with hashed password (active status)', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        studentId: 'S123',
        roleId: 'r0000000-0000-0000-0000-000000000003',
      };
      const mockCreatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: 'S123',
        enabled: true,
        status: 'active',
        created_at: new Date(),
      };

      bcrypt.hash.mockResolvedValue('hashedPassword123');
      pool.query.mockResolvedValue({ rows: [mockCreatedUser] });

      const result = await User.create(userData);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', expect.any(Number));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
        'newuser',
        'new@test.com',
        'hashedPassword123',
        'newuser',
        'newuser',
        'S123',
        'r0000000-0000-0000-0000-000000000003',
        'active',
      ]);
      expect(result).toEqual(mockCreatedUser);
    });

    it('does not insert a group_id column', async () => {
      bcrypt.hash.mockResolvedValue('hashedPassword123');
      pool.query.mockResolvedValue({ rows: [{}] });

      await User.create({
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        roleId: 'r0000000-0000-0000-0000-000000000003',
      });

      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('group_id');
    });

    it('creates pending user without password (no hash)', async () => {
      const userData = {
        username: 'pendinguser',
        email: 'pending@test.com',
        studentId: null,
        roleId: 'r0000000-0000-0000-0000-000000000003',
      };
      const mockCreatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'pendinguser',
        email: 'pending@test.com',
        student_id: null,
        enabled: true,
        status: 'pending',
        created_at: new Date(),
      };

      pool.query.mockResolvedValue({ rows: [mockCreatedUser] });

      const result = await User.create(userData);

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
        'pendinguser',
        'pending@test.com',
        null,
        'pendinguser',
        'pendinguser',
        null,
        'r0000000-0000-0000-0000-000000000003',
        'pending',
      ]);
      expect(result).toEqual(mockCreatedUser);
    });

    it('creates user without studentId (null)', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        studentId: null,
        roleId: 'r0000000-0000-0000-0000-000000000003',
      };
      const mockCreatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: null,
        enabled: true,
        created_at: new Date(),
      };

      bcrypt.hash.mockResolvedValue('hashedPassword123');
      pool.query.mockResolvedValue({ rows: [mockCreatedUser] });

      const result = await User.create(userData);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
        'newuser',
        'new@test.com',
        'hashedPassword123',
        'newuser',
        'newuser',
        null,
        'r0000000-0000-0000-0000-000000000003',
        'active',
      ]);
      expect(result).toEqual(mockCreatedUser);
    });

    it('propagates DB error from pool.query', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        studentId: null,
        roleId: 'r0000000-0000-0000-0000-000000000003',
      };

      bcrypt.hash.mockResolvedValue('hashedPassword123');
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(User.create(userData)).rejects.toThrow('connection refused');
    });

    it('creates user with custom roleId', async () => {
      const userData = {
        username: 'adminuser',
        email: 'admin@test.com',
        password: 'password123',
        studentId: null,
        roleId: 'r0000000-0000-0000-0000-000000000001',
      };
      const mockCreatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'adminuser',
        email: 'admin@test.com',
        student_id: null,
        enabled: true,
        created_at: new Date(),
      };

      bcrypt.hash.mockResolvedValue('hashedPassword123');
      pool.query.mockResolvedValue({ rows: [mockCreatedUser] });

      const result = await User.create(userData);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
        'adminuser',
        'admin@test.com',
        'hashedPassword123',
        'adminuser',
        'adminuser',
        null,
        'r0000000-0000-0000-0000-000000000001',
        'active',
      ]);
      expect(result).toEqual(mockCreatedUser);
    });
  });

  describe('update', () => {
    it('updates user with all fields', async () => {
      const updates = {
        username: 'updateduser',
        email: 'updated@test.com',
        studentId: 'S456',
        roleId: 'r0000000-0000-0000-0000-000000000002',
        enabled: false,
      };
      const mockUpdatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'updateduser',
        email: 'updated@test.com',
        enabled: false,
      };

      pool.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      const result = await User.update('u0000000-0000-0000-0000-000000000001', updates);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), [
        'updateduser',
        'updated@test.com',
        'S456',
        'r0000000-0000-0000-0000-000000000002',
        false,
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedUser);
    });

    it('ignores groupId and does not touch group_id', async () => {
      pool.query.mockResolvedValue({ rows: [{}] });

      await User.update('u0000000-0000-0000-0000-000000000001', {
        username: 'updateduser',
        groupId: 'g0000000-0000-0000-0000-000000000002',
      });

      const [sql, values] = pool.query.mock.calls[0];
      expect(sql).not.toContain('group_id');
      expect(values).toEqual(['updateduser', 'u0000000-0000-0000-0000-000000000001']);
    });

    it('updates user with partial fields', async () => {
      const updates = {
        username: 'updateduser',
      };
      const mockUpdatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'updateduser',
        email: 'old@test.com',
        enabled: true,
      };

      pool.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      const result = await User.update('u0000000-0000-0000-0000-000000000001', updates);

      // Only provided fields are included in the query (no undefined values)
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), [
        'updateduser',
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedUser);
    });

    it('returns null when user not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.update('u0000000-0000-0000-0000-000000000999', { username: 'newname' });

      expect(result).toBeNull();
    });
  });

  describe('removed methods', () => {
    it('no longer exposes updateGroup (membership lives in UserGroup)', () => {
      expect(User.updateGroup).toBeUndefined();
    });
  });

  describe('updatePassword', () => {
    it('updates password with new hash', async () => {
      const mockUpdatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
      };

      bcrypt.hash.mockResolvedValue('newHashedPassword');
      pool.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      const result = await User.updatePassword('u0000000-0000-0000-0000-000000000001', 'newpassword123');

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', expect.any(Number));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), [
        'newHashedPassword',
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedUser);
    });

    it('returns undefined when user not found', async () => {
      bcrypt.hash.mockResolvedValue('newHashedPassword');
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.updatePassword('u0000000-0000-0000-0000-000000000999', 'newpassword');

      expect(result).toBeUndefined();
    });

    it('propagates bcrypt.hash error', async () => {
      bcrypt.hash.mockRejectedValue(new Error('hash failure'));

      await expect(User.updatePassword('u0000000-0000-0000-0000-000000000001', 'newpassword')).rejects.toThrow(
        'hash failure'
      );
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes user and returns deleted user', async () => {
      const mockDeletedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
      };
      pool.query.mockResolvedValue({ rows: [mockDeletedUser] });

      const result = await User.delete('u0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1 RETURNING *', [
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockDeletedUser);
    });

    it('returns undefined when user not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.delete('u0000000-0000-0000-0000-000000000999');

      expect(result).toBeUndefined();
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      bcrypt.compare.mockResolvedValue(true);

      const result = await User.verifyPassword('correctpassword', 'hashedPassword');

      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', 'hashedPassword');
      expect(result).toBe(true);
    });

    it('returns false for incorrect password', async () => {
      bcrypt.compare.mockResolvedValue(false);

      const result = await User.verifyPassword('wrongpassword', 'hashedPassword');

      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashedPassword');
      expect(result).toBe(false);
    });

    it('returns false without calling bcrypt.compare when hash is null', async () => {
      const result = await User.verifyPassword('anyPassword', null);

      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('returns false without calling bcrypt.compare when hash is undefined', async () => {
      const result = await User.verifyPassword('anyPassword', undefined);

      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('returns false without calling bcrypt.compare when hash is empty string', async () => {
      const result = await User.verifyPassword('anyPassword', '');

      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('BCRYPT_ROUNDS configuration', () => {
    const savedBcryptRounds = process.env.BCRYPT_ROUNDS;

    afterEach(() => {
      if (savedBcryptRounds === undefined) {
        delete process.env.BCRYPT_ROUNDS;
      } else {
        process.env.BCRYPT_ROUNDS = savedBcryptRounds;
      }
    });

    function loadIsolatedUser(rounds) {
      process.env.BCRYPT_ROUNDS = rounds;
      let IsolatedUser;
      let isolatedBcrypt;
      jest.isolateModules(() => {
        const mockPool = require('../../../src/db/pool');
        mockPool.query.mockResolvedValue({ rows: [{ id: 'u1', username: 'user', email: 'e@e.com' }] });
        isolatedBcrypt = require('bcryptjs');
        isolatedBcrypt.hash.mockResolvedValue('mocked-hash');
        IsolatedUser = require('../../../src/models/User');
      });
      return { IsolatedUser, isolatedBcrypt };
    }

    it('uses env-configured rounds when valid', async () => {
      const { IsolatedUser, isolatedBcrypt } = loadIsolatedUser('10');
      await IsolatedUser.updatePassword('some-id', 'password');
      expect(isolatedBcrypt.hash).toHaveBeenCalledWith('password', 10);
    });

    it('defaults to 12 when env var is not a valid number', async () => {
      const { IsolatedUser, isolatedBcrypt } = loadIsolatedUser('notanumber');
      await IsolatedUser.updatePassword('some-id', 'password');
      expect(isolatedBcrypt.hash).toHaveBeenCalledWith('password', 12);
    });

    it('defaults to 12 when env var is below minimum (< 4)', async () => {
      const { IsolatedUser, isolatedBcrypt } = loadIsolatedUser('2');
      await IsolatedUser.updatePassword('some-id', 'password');
      expect(isolatedBcrypt.hash).toHaveBeenCalledWith('password', 12);
    });

    it('defaults to 12 when env var is above maximum (> 31)', async () => {
      const { IsolatedUser, isolatedBcrypt } = loadIsolatedUser('40');
      await IsolatedUser.updatePassword('some-id', 'password');
      expect(isolatedBcrypt.hash).toHaveBeenCalledWith('password', 12);
    });
  });

  describe('activate', () => {
    it('sets user status to active', async () => {
      pool.query.mockResolvedValue({});

      await User.activate('u0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"), [
        'u0000000-0000-0000-0000-000000000001',
      ]);
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(User.activate('u0000000-0000-0000-0000-000000000001')).rejects.toThrow('connection refused');
    });
  });

  describe('bulkDelete', () => {
    it('executes DELETE … WHERE id = ANY and returns row count', async () => {
      pool.query.mockResolvedValue({ rowCount: 2 });

      const result = await User.bulkDelete(['id1', 'id2']);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM users'), [['id1', 'id2']]);
      expect(result).toBe(2);
    });

    it('returns 0 when no rows matched', async () => {
      pool.query.mockResolvedValue({ rowCount: 0 });

      const result = await User.bulkDelete(['nonexistent-id']);

      expect(result).toBe(0);
    });

    it('propagates DB error', async () => {
      pool.query.mockRejectedValue(new Error('connection refused'));

      await expect(User.bulkDelete(['id1'])).rejects.toThrow('connection refused');
    });
  });
});
