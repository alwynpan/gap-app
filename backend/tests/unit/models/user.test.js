const User = require('../../../src/models/User');

// Mock the database pool
jest.mock('../../../src/db/migrate', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const { pool } = require('../../../src/db/migrate');

describe('User Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all users with group and role info', async () => {
      const mockUsers = [
        {
          id: 'u0000000-0000-0000-0000-000000000001',
          username: 'user1',
          email: 'user1@test.com',
          group_name: 'Team A',
          role_name: 'user',
        },
        {
          id: 'u0000000-0000-0000-0000-000000000002',
          username: 'user2',
          email: 'user2@test.com',
          group_name: 'Team B',
          role_name: 'admin',
        },
      ];
      pool.query.mockResolvedValue({ rows: mockUsers });

      const result = await User.findAll();

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockUsers);
    });

    it('returns empty array when no users', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns user by id with group and role info', async () => {
      const mockUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        email: 'test@test.com',
        group_name: 'Team A',
        role_name: 'user',
      };
      pool.query.mockResolvedValue({ rows: [mockUser] });

      const result = await User.findById('u0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = $1'), [
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUser);
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
        group_name: 'Team A',
        role_name: 'user',
      };
      pool.query.mockResolvedValue({ rows: [mockUser] });

      const result = await User.findByUsername('testuser');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.username = $1'), ['testuser']);
      expect(result).toEqual(mockUser);
    });

    it('returns null when username not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findByUsername('nonexistent');

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

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE email = $1', ['test@test.com']);
      expect(result).toEqual(mockUser);
    });

    it('returns null when email not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.findByEmail('nonexistent@test.com');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates user with hashed password and default role', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        studentId: 'S123',
        groupId: 'g0000000-0000-0000-0000-000000000001',
        roleId: 'r0000000-0000-0000-0000-000000000003',
      };
      const mockCreatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'newuser',
        email: 'new@test.com',
        student_id: 'S123',
        enabled: true,
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
        'g0000000-0000-0000-0000-000000000001',
        'r0000000-0000-0000-0000-000000000003',
        'active',
      ]);
      expect(result).toEqual(mockCreatedUser);
    });

    it('creates user without studentId (null)', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        studentId: null,
        groupId: null,
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
        null,
        'r0000000-0000-0000-0000-000000000003',
        'active',
      ]);
      expect(result).toEqual(mockCreatedUser);
    });

    it('creates user with custom roleId', async () => {
      const userData = {
        username: 'adminuser',
        email: 'admin@test.com',
        password: 'password123',
        studentId: null,
        groupId: null,
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
        groupId: 'g0000000-0000-0000-0000-000000000002',
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
        'g0000000-0000-0000-0000-000000000002',
        'r0000000-0000-0000-0000-000000000002',
        false,
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedUser);
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

    it('returns undefined when user not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.update('u0000000-0000-0000-0000-000000000999', { username: 'newname' });

      expect(result).toBeUndefined();
    });
  });

  describe('updateGroup', () => {
    it('updates user group', async () => {
      const mockUpdatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        group_id: 'g0000000-0000-0000-0000-000000000002',
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      const result = await User.updateGroup(
        'u0000000-0000-0000-0000-000000000001',
        'g0000000-0000-0000-0000-000000000002'
      );

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), [
        'g0000000-0000-0000-0000-000000000002',
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedUser);
    });

    it('sets group to null', async () => {
      const mockUpdatedUser = {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'testuser',
        group_id: null,
      };
      pool.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      const result = await User.updateGroup('u0000000-0000-0000-0000-000000000001', null);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), [
        null,
        'u0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockUpdatedUser);
    });

    it('returns undefined when user not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await User.updateGroup(
        'u0000000-0000-0000-0000-000000000999',
        'g0000000-0000-0000-0000-000000000001'
      );

      expect(result).toBeUndefined();
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
  });
});
