const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

class User {
  static async findAll(filters = {}) {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (filters.role) {
      conditions.push(`r.name = $${idx++}`);
      values.push(filters.role);
    }
    if (filters.status) {
      conditions.push(`u.status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.groupId === 'none') {
      conditions.push('u.group_id IS NULL');
    } else if (filters.groupId) {
      conditions.push(`u.group_id = $${idx++}`);
      values.push(filters.groupId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.status, u.created_at,
              u.group_id, g.name as group_name,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN groups g ON u.group_id = g.id
       LEFT JOIN roles r ON u.role_id = r.id
       ${where}
       ORDER BY u.username`,
      values
    );
    return result.rows;
  }

  static async findByIds(ids) {
    if (!ids || ids.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.status, u.created_at,
              u.group_id, g.name as group_name,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN groups g ON u.group_id = g.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ANY($1)`,
      [ids]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.status, u.created_at,
              u.group_id, g.name as group_name,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN groups g ON u.group_id = g.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByUsername(username) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.first_name, u.last_name,
              u.student_id, u.enabled, u.status,
              u.group_id, g.name as group_name,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN groups g ON u.group_id = g.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.username) = LOWER($1)`,
      [username]
    );
    return result.rows[0] || null;
  }

  static async findByEmail(email) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.group_id, u.enabled, u.status, u.created_at, u.updated_at,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async findByStudentId(studentId) {
    const result = await pool.query(
      `SELECT id, username, email, first_name, last_name, student_id, group_id, enabled, status, created_at, updated_at, role_id
       FROM users WHERE student_id = $1`,
      [studentId]
    );
    return result.rows[0] || null;
  }

  static async create(userData) {
    const { username, email, password, firstName, lastName, studentId, groupId, roleId } = userData;

    // If no password provided the account starts as 'pending'; the user sets a password via email link
    let passwordHash = null;
    let status = 'pending';
    if (password) {
      passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      status = 'active';
    }

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, student_id, group_id, role_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, username, email, first_name, last_name, student_id, enabled, status, created_at`,
      [
        username,
        email,
        passwordHash,
        firstName || username,
        lastName || username,
        studentId || null,
        groupId || null,
        roleId,
        status,
      ]
    );
    return result.rows[0];
  }

  static async update(id, updates) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    const fieldMap = {
      username: 'username',
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      studentId: 'student_id',
      groupId: 'group_id',
      roleId: 'role_id',
      enabled: 'enabled',
      status: 'status',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      // eslint-disable-next-line security/detect-object-injection
      if (updates[jsKey] !== undefined) {
        setClauses.push(`${dbCol} = $${paramIndex}`);
        // eslint-disable-next-line security/detect-object-injection
        values.push(updates[jsKey]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, username, email, first_name, last_name, student_id, group_id, enabled, status, created_at, updated_at, role_id`,
      values
    );
    return result.rows[0] || null;
  }

  static async updateGroup(userId, groupId) {
    const result = await pool.query(
      `UPDATE users
       SET group_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [groupId, userId]
    );
    return result.rows[0];
  }

  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id, username, email`,
      [passwordHash, id]
    );
    return result.rows[0];
  }

  /** Activate a pending account (called after the user sets their password). */
  static async activate(id) {
    await pool.query(`UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  /**
   * Delete multiple users in a single query.
   *
   * @param {string[]} ids
   * @returns {Promise<number>} Number of rows deleted.
   */
  static async bulkDelete(ids) {
    const result = await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
    return result.rowCount;
  }

  static async verifyPassword(password, hash) {
    if (!hash) {
      return false;
    }
    return await bcrypt.compare(password, hash);
  }
}

module.exports = User;
