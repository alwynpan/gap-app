const { pool } = require('../db/migrate');

class Group {
  static async findAll() {
    const result = await pool.query(
      `SELECT g.*, (SELECT COUNT(*) FROM users WHERE group_id = g.id)::int as member_count
       FROM groups g ORDER BY g.name`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT g.*, (SELECT COUNT(*) FROM users WHERE group_id = g.id)::int as member_count
       FROM groups g WHERE g.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findEnabled() {
    const result = await pool.query(
      `SELECT g.*, (SELECT COUNT(*) FROM users WHERE group_id = g.id)::int as member_count
       FROM groups g WHERE g.enabled = true ORDER BY g.name`
    );
    return result.rows;
  }

  static async create(name, enabled = true, maxMembers = null) {
    const result = await pool.query('INSERT INTO groups (name, enabled, max_members) VALUES ($1, $2, $3) RETURNING *', [
      name,
      enabled,
      maxMembers,
    ]);
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
    const result = await pool.query('SELECT COUNT(*)::int as count FROM users WHERE group_id = $1', [groupId]);
    return result.rows[0].count;
  }

  /**
   * Atomically assign a user to a group, checking capacity under a row-level lock.
   * Throws an error with a `statusCode` property on failure so the caller can respond appropriately.
   */
  static async assignUserToGroup(userId, groupId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the group row and get current capacity info atomically
      const groupResult = await client.query(
        `SELECT g.*,
           (SELECT COUNT(*)::int FROM users WHERE group_id = g.id AND enabled = true) AS member_count
         FROM groups g
         WHERE g.id = $1
         FOR UPDATE`,
        [groupId]
      );

      const group = groupResult.rows[0];
      if (!group) {
        const err = new Error('Group not found');
        err.statusCode = 404;
        throw err;
      }

      if (group.max_members !== null && group.member_count >= group.max_members) {
        const err = new Error('Group is full');
        err.statusCode = 409;
        throw err;
      }

      await client.query('UPDATE users SET group_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        groupId,
        userId,
      ]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async findByName(name) {
    const result = await pool.query('SELECT * FROM groups WHERE LOWER(name) = LOWER($1)', [name]);
    return result.rows[0] || null;
  }

  static async getExportMappings() {
    const result = await pool.query(
      `SELECT u.email, g.name AS group_name
       FROM users u
       JOIN groups g ON u.group_id = g.id
       JOIN roles r ON u.role_id = r.id
       WHERE r.name = 'user' AND u.group_id IS NOT NULL
       ORDER BY g.name, u.email`
    );
    return result.rows;
  }

  static async getMembers(groupId) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.created_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.group_id = $1
       ORDER BY u.username`,
      [groupId]
    );
    return result.rows;
  }
}

module.exports = Group;
