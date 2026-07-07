const pool = require('../db/pool');

class Subject {
  static async findAll() {
    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM assignments WHERE subject_id = s.id)::int AS assignment_count,
              (SELECT COUNT(*) FROM user_subjects WHERE subject_id = s.id)::int AS member_count
       FROM subjects s ORDER BY s.name`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM assignments WHERE subject_id = s.id)::int AS assignment_count,
              (SELECT COUNT(*) FROM user_subjects WHERE subject_id = s.id)::int AS member_count
       FROM subjects s WHERE s.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByName(name) {
    const result = await pool.query('SELECT * FROM subjects WHERE LOWER(name) = LOWER($1)', [name]);
    return result.rows[0] || null;
  }

  static async create(name) {
    const result = await pool.query('INSERT INTO subjects (name) VALUES ($1) RETURNING *', [name]);
    return result.rows[0];
  }

  static async update(id, updates) {
    const fieldMap = {
      name: 'name',
    };

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

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
      `UPDATE subjects SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM subjects WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  /**
   * Subjects the user is enrolled in. By default only enabled (non-suspended)
   * memberships are returned; includeDisabled returns every membership, each
   * row tagged with membership_enabled.
   */
  static async findForUser(userId, { includeDisabled = false } = {}) {
    const result = await pool.query(
      includeDisabled
        ? `SELECT s.*, us.enabled AS membership_enabled
           FROM subjects s
           JOIN user_subjects us ON us.subject_id = s.id
           WHERE us.user_id = $1
           ORDER BY s.name`
        : `SELECT s.*
           FROM subjects s
           JOIN user_subjects us ON us.subject_id = s.id
           WHERE us.user_id = $1 AND us.enabled = true
           ORDER BY s.name`,
      [userId]
    );
    return result.rows;
  }

  /** Subject rows (all memberships, tagged) for a batch of users, each row tagged with user_id. */
  static async findForUsers(userIds) {
    if (!userIds || userIds.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT us.user_id, s.id, s.name, us.enabled AS membership_enabled
       FROM subjects s
       JOIN user_subjects us ON us.subject_id = s.id
       WHERE us.user_id = ANY($1)
       ORDER BY s.name`,
      [userIds]
    );
    return result.rows;
  }

  static async getMembers(subjectId) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.status, r.name as role_name, us.enabled AS membership_enabled
       FROM users u
       JOIN user_subjects us ON us.user_id = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE us.subject_id = $1
       ORDER BY u.username`,
      [subjectId]
    );
    return result.rows;
  }

  /**
   * Enrol multiple users in the subject; already-enrolled users are skipped.
   *
   * @param {string} subjectId
   * @param {string[]} userIds
   * @returns {Promise<number>} Number of memberships actually inserted.
   */
  static async addUsers(subjectId, userIds) {
    if (!userIds || userIds.length === 0) {
      return 0;
    }
    const result = await pool.query(
      `INSERT INTO user_subjects (subject_id, user_id)
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT (user_id, subject_id) DO NOTHING`,
      [subjectId, userIds]
    );
    return result.rowCount;
  }

  /**
   * Remove a user from the subject AND from any group memberships within the
   * subject's assignments, in a single transaction (prevents orphaned
   * user_groups rows for a subject the user no longer belongs to).
   *
   * @returns {Promise<boolean>} true if a subject membership was removed.
   */
  static async removeUser(subjectId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `DELETE FROM user_groups ug
         USING assignments a
         WHERE ug.assignment_id = a.id AND a.subject_id = $1 AND ug.user_id = $2`,
        [subjectId, userId]
      );

      const result = await client.query('DELETE FROM user_subjects WHERE subject_id = $1 AND user_id = $2', [
        subjectId,
        userId,
      ]);

      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Enable or suspend a user's membership in the subject. Suspension also
   * removes the user's group memberships within the subject's assignments,
   * in a single transaction (mirrors removeUser).
   *
   * @returns {Promise<boolean>} true if a membership row was updated.
   */
  static async setMemberEnabled(subjectId, userId, enabled) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (enabled === false) {
        await client.query(
          `DELETE FROM user_groups ug
           USING assignments a
           WHERE ug.assignment_id = a.id AND a.subject_id = $1 AND ug.user_id = $2`,
          [subjectId, userId]
        );
      }

      const result = await client.query(
        'UPDATE user_subjects SET enabled = $3 WHERE subject_id = $1 AND user_id = $2',
        [subjectId, userId, enabled]
      );

      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Suspended memberships do not count — a suspended user is not a member. */
  static async isMember(subjectId, userId) {
    const result = await pool.query(
      'SELECT 1 FROM user_subjects WHERE subject_id = $1 AND user_id = $2 AND enabled = true',
      [subjectId, userId]
    );
    return result.rows.length > 0;
  }
}

module.exports = Subject;
