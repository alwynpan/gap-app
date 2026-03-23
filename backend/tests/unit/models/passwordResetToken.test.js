const PasswordResetToken = require('../../../src/models/PasswordResetToken');

jest.mock('../../../src/db/migrate', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../../../src/db/migrate');

describe('PasswordResetToken Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('inserts a token record and returns it', async () => {
      const mockRow = {
        id: 't0000000-0000-0000-0000-000000000001',
        user_id: 'u0000000-0000-0000-0000-000000000001',
        token: 'fakehex64chartokenstring0000000000000000000000000000000000000000',
        token_type: 'reset',
        expires_at: new Date(),
        used: false,
      };
      pool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await PasswordResetToken.create('u0000000-0000-0000-0000-000000000001', 'reset', 1);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO password_reset_tokens'), [
        'u0000000-0000-0000-0000-000000000001',
        expect.any(String),
        'reset',
        expect.any(Date),
      ]);
      expect(result).toEqual(mockRow);
    });

    it('uses default tokenType and expiresInHours', async () => {
      const mockRow = { id: 't1', token: 'abc', token_type: 'reset' };
      pool.query.mockResolvedValue({ rows: [mockRow] });

      await PasswordResetToken.create('u0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['u0000000-0000-0000-0000-000000000001', expect.any(String), 'reset', expect.any(Date)])
      );
    });
  });

  describe('findByToken', () => {
    it('returns token record with user info when found', async () => {
      const mockRow = {
        id: 't0000000-0000-0000-0000-000000000001',
        token: 'sometoken',
        token_type: 'reset',
        used: false,
        expires_at: new Date(Date.now() + 3600000),
        email: 'user@test.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
      };
      pool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await PasswordResetToken.findByToken('sometoken');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE t.token = $1'), ['sometoken']);
      expect(result).toEqual(mockRow);
    });

    it('returns null when token not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await PasswordResetToken.findByToken('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('markUsed', () => {
    it('updates token to used=true', async () => {
      pool.query.mockResolvedValue({});

      await PasswordResetToken.markUsed('t0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith('UPDATE password_reset_tokens SET used = true WHERE id = $1', [
        't0000000-0000-0000-0000-000000000001',
      ]);
    });
  });

  describe('deleteStaleForUser', () => {
    it('deletes expired or used tokens for a user', async () => {
      pool.query.mockResolvedValue({});

      await PasswordResetToken.deleteStaleForUser('u0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM password_reset_tokens WHERE user_id = $1'),
        ['u0000000-0000-0000-0000-000000000001']
      );
    });
  });
});
