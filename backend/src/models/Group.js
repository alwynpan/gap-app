const pool = require('../db/pool');

const MEMBER_COUNT_SUBQUERY = '(SELECT COUNT(*) FROM user_groups WHERE group_id = g.id)::int';

class Group {
  static async findAllByAssignment(assignmentId, { enabledOnly = false } = {}) {
    const enabledClause = enabledOnly ? 'AND g.enabled = true' : '';
    const result = await pool.query(
      `SELECT g.*, ${MEMBER_COUNT_SUBQUERY} as member_count
       FROM groups g
       WHERE g.assignment_id = $1 ${enabledClause}
       ORDER BY g.name`,
      [assignmentId]
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT g.*, a.name AS assignment_name, a.subject_id, s.name AS subject_name,
              ${MEMBER_COUNT_SUBQUERY} as member_count
       FROM groups g
       JOIN assignments a ON a.id = g.assignment_id
       JOIN subjects s ON s.id = a.subject_id
       WHERE g.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByIds(ids) {
    if (!ids || ids.length === 0) {
      return [];
    }
    const result = await pool.query('SELECT id, assignment_id, name FROM groups WHERE id = ANY($1)', [ids]);
    return result.rows;
  }

  static async create(assignmentId, name, enabled = true, maxMembers = null) {
    const result = await pool.query(
      'INSERT INTO groups (assignment_id, name, enabled, max_members) VALUES ($1, $2, $3, $4) RETURNING *',
      [assignmentId, name, enabled, maxMembers]
    );
    return result.rows[0];
  }

  static async update(id, updates) {
    const fieldMap = {
      name: 'name',
      enabled: 'enabled',
      maxMembers: 'max_members',
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

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE groups SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM groups WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  static async getMemberCount(groupId) {
    const result = await pool.query('SELECT COUNT(*)::int as count FROM user_groups WHERE group_id = $1', [groupId]);
    return result.rows[0].count;
  }

  /**
   * Insert multiple groups for an assignment in a single transaction.
   * Rolls back and re-throws on any error, including unique-constraint violations.
   *
   * @param {string} assignmentId
   * @param {Array<{name: string, enabled: boolean, maxMembers: number|null}>} groups
   * @returns {Promise<Array>} The inserted rows.
   */
  static async bulkCreate(assignmentId, groups) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created = [];
      for (const { name, enabled, maxMembers } of groups) {
        const result = await client.query(
          'INSERT INTO groups (assignment_id, name, enabled, max_members) VALUES ($1, $2, $3, $4) RETURNING *',
          [assignmentId, name, enabled, maxMembers]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Delete multiple groups in a single query.
   *
   * @param {string[]} ids
   * @returns {Promise<number>} Number of rows deleted.
   */
  static async bulkDelete(ids) {
    const result = await pool.query('DELETE FROM groups WHERE id = ANY($1)', [ids]);
    return result.rowCount;
  }

  static async findByName(assignmentId, name) {
    const result = await pool.query('SELECT * FROM groups WHERE assignment_id = $1 AND LOWER(name) = LOWER($2)', [
      assignmentId,
      name,
    ]);
    return result.rows[0] || null;
  }

  static async findByNames(assignmentId, names) {
    if (!names || names.length === 0) {
      return [];
    }
    const lower = names.map((n) => n.toLowerCase());
    const result = await pool.query('SELECT * FROM groups WHERE assignment_id = $1 AND LOWER(name) = ANY($2::text[])', [
      assignmentId,
      lower,
    ]);
    return result.rows;
  }
}

module.exports = Group;
