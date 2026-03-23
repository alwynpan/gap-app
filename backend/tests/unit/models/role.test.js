const Role = require('../../../src/models/Role');

// Mock the database pool
jest.mock('../../../src/db/migrate', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../../../src/db/migrate');

describe('Role Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all roles ordered by id', async () => {
      const mockRoles = [
        { id: 'r0000000-0000-0000-0000-000000000001', name: 'admin', created_at: new Date() },
        { id: 'r0000000-0000-0000-0000-000000000002', name: 'assignment_manager', created_at: new Date() },
        { id: 'r0000000-0000-0000-0000-000000000003', name: 'user', created_at: new Date() },
      ];
      pool.query.mockResolvedValue({ rows: mockRoles });

      const result = await Role.findAll();

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM roles ORDER BY id');
      expect(result).toEqual(mockRoles);
    });

    it('returns empty array when no roles', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Role.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns role by id', async () => {
      const mockRole = { id: 'r0000000-0000-0000-0000-000000000001', name: 'admin', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.findById('r0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM roles WHERE id = $1', [
        'r0000000-0000-0000-0000-000000000001',
      ]);
      expect(result).toEqual(mockRole);
    });

    it('returns undefined when role not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Role.findById('r0000000-0000-0000-0000-000000000999');

      expect(result).toBeUndefined();
    });
  });

  describe('findByName', () => {
    it('returns role by name', async () => {
      const mockRole = { id: 'r0000000-0000-0000-0000-000000000001', name: 'admin', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.findByName('admin');

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM roles WHERE name = $1', ['admin']);
      expect(result).toEqual(mockRole);
    });

    it('returns undefined when role name not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Role.findByName('nonexistent');

      expect(result).toBeUndefined();
    });

    it('finds user role', async () => {
      const mockRole = { id: 'r0000000-0000-0000-0000-000000000003', name: 'user', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.findByName('user');

      expect(result).toEqual(mockRole);
    });

    it('finds assignment_manager role', async () => {
      const mockRole = {
        id: 'r0000000-0000-0000-0000-000000000002',
        name: 'assignment_manager',
        created_at: new Date(),
      };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.findByName('assignment_manager');

      expect(result).toEqual(mockRole);
    });
  });

  describe('create', () => {
    it('creates new role', async () => {
      const mockRole = { id: 'r0000000-0000-0000-0000-000000000004', name: 'moderator', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.create('moderator');

      expect(pool.query).toHaveBeenCalledWith('INSERT INTO roles (name) VALUES ($1) RETURNING *', ['moderator']);
      expect(result).toEqual(mockRole);
    });

    it('creates admin role', async () => {
      const mockRole = { id: 'r0000000-0000-0000-0000-000000000001', name: 'admin', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.create('admin');

      expect(result).toEqual(mockRole);
    });
  });
});
