const pool = require('../db/pool');

// member_count counts active participants only, matching isMember's rule that a
// suspended membership is not a membership; roster_count includes suspended rows.
class Subject {
  static async findAll() {
    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM assignments WHERE subject_id = s.id)::int AS assignment_count,
              (SELECT COUNT(*) FROM user_subjects WHERE subject_id = s.id AND enabled = true)::int AS member_count,
              (SELECT COUNT(*) FROM user_subjects WHERE subject_id = s.id)::int AS roster_count
       FROM subjects s ORDER BY s.name`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM assignments WHERE subject_id = s.id)::int AS assignment_count,
              (SELECT COUNT(*) FROM user_subjects WHERE subject_id = s.id AND enabled = true)::int AS member_count,
              (SELECT COUNT(*) FROM user_subjects WHERE subject_id = s.id)::int AS roster_count
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
   * Enrol multiple users in the subject. Already-enrolled users are left alone —
   * a suspended membership is NOT silently re-enabled, because re-enabling is a
   * deliberate staff action.
   *
   * Returns a breakdown rather than a bare count so callers can say what actually
   * happened: "added 1" and "1 was already there but suspended" are very
   * different outcomes that both used to report as success.
   *
   * @param {string} subjectId
   * @param {string[]} userIds
   * @returns {Promise<{added: number, alreadyEnrolled: number, suspended: number}>}
   */
  static async addUsers(subjectId, userIds) {
    if (!userIds || userIds.length === 0) {
      return { added: 0, alreadyEnrolled: 0, suspended: 0 };
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query(
        `INSERT INTO user_subjects (subject_id, user_id)
         SELECT $1, DISTINCT_IDS.user_id FROM (SELECT DISTINCT unnest($2::uuid[]) AS user_id) AS DISTINCT_IDS
         ON CONFLICT (user_id, subject_id) DO NOTHING
         RETURNING user_id`,
        [subjectId, userIds]
      );
      const addedIds = new Set(inserted.rows.map((r) => r.user_id));

      // Classified by a LATER statement, which gets a fresh READ COMMITTED
      // snapshot. Doing it in the same statement as the insert would miss a row
      // another transaction committed after this one's snapshot was taken, and
      // report a conflicting id as neither added nor already-enrolled.
      const classified = await client.query(
        `SELECT us.user_id, us.enabled
         FROM user_subjects us
         WHERE us.subject_id = $1 AND us.user_id = ANY($2::uuid[])`,
        [subjectId, userIds]
      );

      await client.query('COMMIT');

      let alreadyEnrolled = 0;
      let suspended = 0;
      for (const row of classified.rows) {
        if (addedIds.has(row.user_id)) {
          continue;
        }
        if (row.enabled) {
          alreadyEnrolled++;
        } else {
          suspended++;
        }
      }
      return { added: addedIds.size, alreadyEnrolled, suspended };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

      // Lock the membership row first — the same order UserGroup.assignUserToGroup
      // uses — so a concurrent placement cannot slip a group row in after the
      // cleanup below and outlive the membership.
      await client.query('SELECT 1 FROM user_subjects WHERE subject_id = $1 AND user_id = $2 FOR UPDATE', [
        subjectId,
        userId,
      ]);

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

      // Same lock order as removeUser and UserGroup.assignUserToGroup, so a
      // placement racing a suspension cannot leave the suspended member holding
      // a group in this subject.
      await client.query('SELECT 1 FROM user_subjects WHERE subject_id = $1 AND user_id = $2 FOR UPDATE', [
        subjectId,
        userId,
      ]);

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
