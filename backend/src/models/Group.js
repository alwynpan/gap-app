const pool = require('../db/pool');

const MEMBER_COUNT_SUBQUERY = '(SELECT COUNT(*) FROM user_groups WHERE group_id = g.id)::int';

const UPDATABLE_FIELDS = {
  name: 'name',
  enabled: 'enabled',
  maxMembers: 'max_members',
};

/** Build SET clauses and values from the allowlisted updatable fields. */
function buildUpdate(updates) {
  const setClauses = [];
  const values = [];

  for (const [jsKey, dbCol] of Object.entries(UPDATABLE_FIELDS)) {
    // eslint-disable-next-line security/detect-object-injection
    if (updates[jsKey] !== undefined) {
      setClauses.push(`${dbCol} = $${values.length + 1}`);
      // eslint-disable-next-line security/detect-object-injection
      values.push(updates[jsKey]);
    }
  }

  return { setClauses, values };
}

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
    const { setClauses, values } = buildUpdate(updates);

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE groups SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  /**
   * Update a group, validating a lowered max_members against the live member
   * count inside the same transaction that writes it.
   *
   * The count comes from a statement issued after the group lock is taken, for
   * the same reason as UserGroup.assignUserToGroup: a subquery in the locking
   * SELECT would not see a join that committed while we waited for the lock.
   *
   * @param {string} id
   * @param {{name?: string, enabled?: boolean, maxMembers?: number|null}} updates
   * @returns {Promise<object|null>} The updated row, or null when the group is gone.
   * @throws {Error} statusCode 400 when the new limit is below the current count.
   */
  static async updateWithCapacityCheck(id, updates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query('SELECT id FROM groups WHERE id = $1 FOR UPDATE', [id]);
      if (locked.rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }

      if (updates.maxMembers !== undefined && updates.maxMembers !== null) {
        const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM user_groups WHERE group_id = $1', [id]);
        if (rows[0].count > updates.maxMembers) {
          const err = new Error(
            `Group already has ${rows[0].count} members, cannot set limit to ${updates.maxMembers}`
          );
          err.statusCode = 400;
          throw err;
        }
      }

      const { setClauses, values } = buildUpdate(updates);
      if (setClauses.length === 0) {
        const { rows } = await client.query('SELECT * FROM groups WHERE id = $1', [id]);
        await client.query('COMMIT');
        return rows[0];
      }

      setClauses.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      const result = await client.query(
        `UPDATE groups SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
