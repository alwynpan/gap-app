const pool = require('../db/pool');

class Role {
  static async findAll() {
    const result = await pool.query('SELECT * FROM roles ORDER BY id');
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findByName(name) {
    const result = await pool.query('SELECT * FROM roles WHERE name = $1', [name]);
    return result.rows[0];
  }

  static async create(name) {
    const result = await pool.query('INSERT INTO roles (name) VALUES ($1) RETURNING *', [name]);
    return result.rows[0];
  }
}

module.exports = Role;
