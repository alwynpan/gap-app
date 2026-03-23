const crypto = require('crypto');
const { pool } = require('../db/migrate');

class PasswordResetToken {
  /**
   * Create a new token for a user.
   * @param {string} userId
   * @param {'reset'|'setup'} tokenType
   * @param {number} expiresInHours
   */
  static async create(userId, tokenType = 'reset', expiresInHours = 24) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const result = await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, token_type, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, token, tokenType, expiresAt]
    );
    return result.rows[0];
  }

  /** Find a token record and include basic user fields for email sending. */
  static async findByToken(token) {
    const result = await pool.query(
      `SELECT t.*, u.email, u.username, u.first_name, u.last_name
       FROM password_reset_tokens t
       JOIN users u ON t.user_id = u.id
       WHERE t.token = $1`,
      [token]
    );
    return result.rows[0] || null;
  }

  /** Mark a token as used so it cannot be reused. */
  static async markUsed(id) {
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [id]);
  }

  /** Remove old/used tokens for a user before creating a new one. */
  static async deleteStaleForUser(userId) {
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND (expires_at < NOW() OR used = true)', [
      userId,
    ]);
  }
}

module.exports = PasswordResetToken;
