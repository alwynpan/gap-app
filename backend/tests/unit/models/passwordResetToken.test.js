const crypto = require('crypto');
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
    it('stores a SHA-256 hash and returns the raw token on the row', async () => {
      const mockRow = {
        id: 't0000000-0000-0000-0000-000000000001',
        user_id: 'u0000000-0000-0000-0000-000000000001',
        token: 'will-be-overwritten',
        token_type: 'reset',
        expires_at: new Date(),
        used: false,
      };
      pool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await PasswordResetToken.create('u0000000-0000-0000-0000-000000000001', 'reset', 1);

      // The hash (not the raw token) must be persisted
      const storedToken = pool.query.mock.calls[0][1][1];
      expect(storedToken).toHaveLength(64); // SHA-256 hex
      // The raw token returned to callers must differ from the stored hash
      expect(result.token).toHaveLength(64);
      expect(result.token).not.toEqual(storedToken);
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

      const expectedHash = crypto.createHash('sha256').update('sometoken').digest('hex');
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE t.token = $1'), [expectedHash]);
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
