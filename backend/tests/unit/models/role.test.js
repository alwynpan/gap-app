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
        { id: 1, name: 'admin', created_at: new Date() },
        { id: 2, name: 'team_manager', created_at: new Date() },
        { id: 3, name: 'user', created_at: new Date() },
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
      const mockRole = { id: 1, name: 'admin', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.findById(1);

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM roles WHERE id = $1', [1]);
      expect(result).toEqual(mockRole);
    });

    it('returns undefined when role not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Role.findById(999);

      expect(result).toBeUndefined();
    });
  });

  describe('findByName', () => {
    it('returns role by name', async () => {
      const mockRole = { id: 1, name: 'admin', created_at: new Date() };
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
      const mockRole = { id: 3, name: 'user', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.findByName('user');

      expect(result).toEqual(mockRole);
    });

    it('finds team_manager role', async () => {
      const mockRole = { id: 2, name: 'team_manager', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.findByName('team_manager');

      expect(result).toEqual(mockRole);
    });
  });

  describe('create', () => {
    it('creates new role', async () => {
      const mockRole = { id: 4, name: 'moderator', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.create('moderator');

      expect(pool.query).toHaveBeenCalledWith('INSERT INTO roles (name) VALUES ($1) RETURNING *', ['moderator']);
      expect(result).toEqual(mockRole);
    });

    it('creates admin role', async () => {
      const mockRole = { id: 1, name: 'admin', created_at: new Date() };
      pool.query.mockResolvedValue({ rows: [mockRole] });

      const result = await Role.create('admin');

      expect(result).toEqual(mockRole);
    });
  });
});
