const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

function normalizeBcryptRounds(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed >= 4 && parsed <= 31) {
    return parsed;
  }
  return 12;
}

const BCRYPT_ROUNDS = normalizeBcryptRounds(process.env.BCRYPT_ROUNDS || '12');

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
    if (filters.subjectId) {
      conditions.push(`EXISTS (SELECT 1 FROM user_subjects us WHERE us.user_id = u.id AND us.subject_id = $${idx++})`);
      values.push(filters.subjectId);
    }
    if (filters.assignmentId && filters.groupId === 'none') {
      // Enrolled in the assignment's subject but not in any group for that assignment
      conditions.push(
        `EXISTS (SELECT 1 FROM user_subjects us
                 JOIN assignments a ON a.subject_id = us.subject_id
                 WHERE us.user_id = u.id AND a.id = $${idx++})`
      );
      values.push(filters.assignmentId);
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM user_groups ug WHERE ug.user_id = u.id AND ug.assignment_id = $${idx++})`
      );
      values.push(filters.assignmentId);
    } else if (filters.groupId && filters.groupId !== 'none') {
      conditions.push(`EXISTS (SELECT 1 FROM user_groups ug WHERE ug.user_id = u.id AND ug.group_id = $${idx++})`);
      values.push(filters.groupId);
    }
    if (filters.managedBy) {
      // Assignment-manager scoping: users enrolled in subjects containing
      // assignments managed by this user
      conditions.push(
        `EXISTS (SELECT 1 FROM user_subjects us
                 JOIN assignments a ON a.subject_id = us.subject_id
                 JOIN assignment_managers am ON am.assignment_id = a.id
                 WHERE us.user_id = u.id AND am.user_id = $${idx++})`
      );
      values.push(filters.managedBy);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.status, u.created_at,
              u.role_id, r.name as role_name
       FROM users u
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
              u.role_id, r.name as role_name
       FROM users u
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
              u.role_id, r.name as role_name
       FROM users u
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
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.username) = LOWER($1)`,
      [username]
    );
    return result.rows[0] || null;
  }

  static async findByEmail(email) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.status, u.created_at, u.updated_at,
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
      `SELECT id, username, email, first_name, last_name, student_id, enabled, status, created_at, updated_at, role_id
       FROM users WHERE student_id = $1`,
      [studentId]
    );
    return result.rows[0] || null;
  }

  static async findByEmails(emails) {
    if (!emails || emails.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.status, u.created_at, u.updated_at,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.email = ANY($1)`,
      [emails]
    );
    return result.rows;
  }

  static async findByUsernames(usernames) {
    if (!usernames || usernames.length === 0) {
      return [];
    }
    const lower = usernames.map((u) => u.toLowerCase());
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.first_name, u.last_name,
              u.student_id, u.enabled, u.status,
              u.role_id, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.username) = ANY($1)`,
      [lower]
    );
    return result.rows;
  }

  static async findByStudentIds(studentIds) {
    if (!studentIds || studentIds.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT id, username, email, first_name, last_name, student_id, enabled, status, created_at, updated_at, role_id
       FROM users WHERE student_id = ANY($1)`,
      [studentIds]
    );
    return result.rows;
  }

  static async create(userData) {
    const { username, email, password, firstName, lastName, studentId, roleId } = userData;

    // If no password provided the account starts as 'pending'; the user sets a password via email link
    let passwordHash = null;
    let status = 'pending';
    if (password) {
      passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      status = 'active';
    }

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, student_id, role_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, email, first_name, last_name, student_id, enabled, status, created_at`,
      [username, email, passwordHash, firstName || username, lastName || username, studentId || null, roleId, status]
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
       RETURNING id, username, email, first_name, last_name, student_id, enabled, status, created_at, updated_at, role_id`,
      values
    );
    return result.rows[0] || null;
  }

  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
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
