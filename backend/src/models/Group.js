const { pool } = require('../db/migrate');

class Group {
  static async findAll() {
    const result = await pool.query('SELECT * FROM groups ORDER BY name');
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findEnabled() {
    const result = await pool.query('SELECT * FROM groups WHERE enabled = true ORDER BY name');
    return result.rows;
  }

  static async create(name, enabled = true) {
    const result = await pool.query(
      'INSERT INTO groups (name, enabled) VALUES ($1, $2) RETURNING *',
      [name, enabled]
    );
    return result.rows[0];
  }

  static async update(id, updates) {
    const { name, enabled } = updates;
    const result = await pool.query(
      `UPDATE groups 
       SET name = COALESCE($1, name), 
           enabled = COALESCE($2, enabled),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [name, enabled, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM groups WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  static async getMembers(groupId) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.student_id, u.enabled, u.created_at,
              r.name as role_name
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
