'use strict';

const pool = require('../db/pool');

class Config {
  /**
   * Get a config value by key. Returns the string value or null if not found.
   */
  static async get(key) {
    const result = await pool.query('SELECT value FROM config WHERE key = $1', [key]);
    return result.rows[0]?.value ?? null;
  }

  /**
   * Upsert a config value. Returns the updated row.
   */
  static async set(key, value) {
    const result = await pool.query(
      `INSERT INTO config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [key, value]
    );
    return result.rows[0];
  }

  /**
   * Get all config rows, ordered by key.
   */
  static async getAll() {
    const result = await pool.query('SELECT key, value, updated_at FROM config ORDER BY key');
    return result.rows;
  }
}

module.exports = Config;
