const pool = require('../db/pool');

class Assignment {
  static async findAll(filters = {}) {
    const conditions = [];
    const values = [];
    let idx = 1;

    if (filters.subjectId) {
      conditions.push(`a.subject_id = $${idx++}`);
      values.push(filters.subjectId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT a.*, s.name AS subject_name,
              (SELECT COUNT(*) FROM groups WHERE assignment_id = a.id)::int AS group_count
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       ${where}
       ORDER BY s.name, a.name`,
      values
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT a.*, s.name AS subject_name,
              (SELECT COUNT(*) FROM groups WHERE assignment_id = a.id)::int AS group_count
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       WHERE a.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByName(subjectId, name) {
    const result = await pool.query('SELECT * FROM assignments WHERE subject_id = $1 AND LOWER(name) = LOWER($2)', [
      subjectId,
      name,
    ]);
    return result.rows[0] || null;
  }

  static async create(subjectId, name) {
    const result = await pool.query('INSERT INTO assignments (subject_id, name) VALUES ($1, $2) RETURNING *', [
      subjectId,
      name,
    ]);
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
      `UPDATE assignments SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM assignments WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  /** Assignments in the user's subjects (derived participation, enabled memberships only). */
  static async findForUser(userId) {
    const result = await pool.query(
      `SELECT a.*, s.name AS subject_name
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN user_subjects us ON us.subject_id = a.subject_id AND us.enabled = true
       WHERE us.user_id = $1
       ORDER BY s.name, a.name`,
      [userId]
    );
    return result.rows;
  }

  /** Assignments the user manages. */
  static async findManagedBy(userId) {
    const result = await pool.query(
      `SELECT a.*, s.name AS subject_name
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN assignment_managers am ON am.assignment_id = a.id
       WHERE am.user_id = $1
       ORDER BY s.name, a.name`,
      [userId]
    );
    return result.rows;
  }

  static async isManager(userId, assignmentId) {
    const result = await pool.query('SELECT 1 FROM assignment_managers WHERE user_id = $1 AND assignment_id = $2', [
      userId,
      assignmentId,
    ]);
    return result.rows.length > 0;
  }

  static async getManagers(assignmentId) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.enabled, u.status
       FROM users u
       JOIN assignment_managers am ON am.user_id = u.id
       WHERE am.assignment_id = $1
       ORDER BY u.username`,
      [assignmentId]
    );
    return result.rows;
  }

  /**
   * Replace the full manager set for an assignment in a single transaction.
   *
   * @param {string} assignmentId
   * @param {string[]} userIds Empty array clears all managers.
   */
  static async setManagers(assignmentId, userIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM assignment_managers WHERE assignment_id = $1', [assignmentId]);

      if (userIds && userIds.length > 0) {
        await client.query(
          `INSERT INTO assignment_managers (assignment_id, user_id)
           SELECT $1, unnest($2::uuid[])
           ON CONFLICT (user_id, assignment_id) DO NOTHING`,
          [assignmentId, userIds]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Add one user as manager of multiple assignments; existing rows are skipped.
   *
   * @param {string} userId
   * @param {string[]} assignmentIds
   * @returns {Promise<number>} Number of manager rows actually inserted.
   */
  static async addManagers(userId, assignmentIds) {
    if (!assignmentIds || assignmentIds.length === 0) {
      return 0;
    }
    const result = await pool.query(
      `INSERT INTO assignment_managers (user_id, assignment_id)
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT (user_id, assignment_id) DO NOTHING`,
      [userId, assignmentIds]
    );
    return result.rowCount;
  }

  /** Whether the user manages at least one assignment within the subject. */
  static async managesAnyInSubject(userId, subjectId) {
    const result = await pool.query(
      `SELECT 1
       FROM assignment_managers am
       JOIN assignments a ON a.id = am.assignment_id
       WHERE am.user_id = $1 AND a.subject_id = $2
       LIMIT 1`,
      [userId, subjectId]
    );
    return result.rows.length > 0;
  }
}

module.exports = Assignment;
