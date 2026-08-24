const crypto = require('crypto');
const pool = require('../db/pool');

class PasswordResetToken {
  /**
   * Create a new token for a user.
   * @param {string} userId
   * @param {'reset'|'setup'} tokenType
   * @param {number} expiresInHours
   */
  static async create(userId, tokenType = 'reset', expiresInHours = 24) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const result = await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, token_type, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, tokenHash, tokenType, expiresAt]
    );
    const row = result.rows[0];
    // Expose the raw token to callers (for email links); only the hash is persisted
    if (row) {
      row.token = token;
    }
    return row;
  }

  /** Find a token record and include basic user fields for email sending. */
  static async findByToken(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      `SELECT t.*, u.email, u.username, u.first_name, u.last_name
       FROM password_reset_tokens t
       JOIN users u ON t.user_id = u.id
       WHERE t.token = $1`,
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  /** Mark a token as used so it cannot be reused. */
  static async markUsed(id) {
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [id]);
  }

  /**
   * Redeem a token: consume it and set the owner's password in one transaction.
   *
   * The consuming UPDATE carries the validity predicate, so of two concurrent
   * requests presenting the same token exactly one updates a row — a read-then-
   * mark sequence lets both through and the later password silently wins.
   * Sharing the transaction also means a failed password write does not burn
   * the token.
   *
   * @param {string} token Raw token from the email link.
   * @param {string} passwordHash Pre-computed hash (hashing must not hold the transaction open).
   * @returns {Promise<{userId: string, tokenType: string}|null>} null when the
   *   token is unknown, already used, or expired.
   */
  static async redeem(token, passwordHash) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const consumed = await client.query(
        `UPDATE password_reset_tokens
         SET used = true
         WHERE token = $1 AND used = false AND expires_at > NOW()
         RETURNING id, user_id, token_type`,
        [tokenHash]
      );
      const record = consumed.rows[0];
      if (!record) {
        await client.query('COMMIT');
        return null;
      }

      // A setup token doubles as email verification, so it activates the account.
      const activate = record.token_type === 'setup';
      await client.query(
        activate
          ? `UPDATE users SET password_hash = $1, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $2`
          : `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [passwordHash, record.user_id]
      );

      await client.query('COMMIT');
      return { userId: record.user_id, tokenType: record.token_type };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Remove all existing tokens for a user before creating a new one (ensures only one active token at a time). */
  static async deleteStaleForUser(userId) {
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  }

  /** Delete all expired or used tokens from the database. Returns the count of deleted rows. */
  static async deleteExpired() {
    const result = await pool.query('DELETE FROM password_reset_tokens WHERE used = true OR expires_at < NOW()');
    return result.rowCount;
  }
}

module.exports = PasswordResetToken;
