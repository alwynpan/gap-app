const crypto = require('crypto');
const PasswordResetToken = require('../../../src/models/PasswordResetToken');

jest.mock('../../../src/db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const pool = require('../../../src/db/pool');

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
    it('deletes all existing tokens for a user', async () => {
      pool.query.mockResolvedValue({});

      await PasswordResetToken.deleteStaleForUser('u0000000-0000-0000-0000-000000000001');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM password_reset_tokens WHERE user_id = $1'),
        ['u0000000-0000-0000-0000-000000000001']
      );
    });
  });
  describe('redeem', () => {
    const RAW_TOKEN = 'raw-token-value';
    const HASHED = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');
    let mockClient;

    beforeEach(() => {
      mockClient = { query: jest.fn(), release: jest.fn() };
      pool.connect.mockResolvedValue(mockClient);
    });

    it('consumes the token and sets the password in one transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', token_type: 'reset' }] })
        .mockResolvedValueOnce({}) // UPDATE users
        .mockResolvedValueOnce({}); // COMMIT

      const result = await PasswordResetToken.redeem(RAW_TOKEN, 'hash');

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      // Validity lives in the UPDATE predicate so two racing requests cannot both win.
      const [consumeSql, consumeParams] = mockClient.query.mock.calls[1];
      expect(consumeSql).toContain('UPDATE password_reset_tokens');
      expect(consumeSql).toContain('used = false');
      expect(consumeSql).toContain('expires_at > NOW()');
      expect(consumeParams).toEqual([HASHED]);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(result).toEqual({ userId: 'u1', tokenType: 'reset' });
    });

    it('activates the account for a setup token', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', token_type: 'setup' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await PasswordResetToken.redeem(RAW_TOKEN, 'hash');

      expect(mockClient.query.mock.calls[2][0]).toContain("status = 'active'");
      expect(result.tokenType).toBe('setup');
    });

    it('does not activate the account for a reset token', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', token_type: 'reset' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await PasswordResetToken.redeem(RAW_TOKEN, 'hash');

      expect(mockClient.query.mock.calls[2][0]).not.toContain('status');
    });

    it('returns null and writes no password when the token is unusable', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // nothing consumed
        .mockResolvedValueOnce({}); // COMMIT

      expect(await PasswordResetToken.redeem(RAW_TOKEN, 'hash')).toBeNull();
      expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE users'))).toBe(false);
    });

    it('rolls back so a failed password write does not burn the token', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', token_type: 'reset' }] })
        .mockRejectedValueOnce(new Error('write failed'))
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(PasswordResetToken.redeem(RAW_TOKEN, 'hash')).rejects.toThrow('write failed');
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
