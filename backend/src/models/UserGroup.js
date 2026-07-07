const pool = require('../db/pool');

/**
 * Per-assignment group membership (user_groups table).
 * A user has at most one group per assignment (DB primary key), and may only
 * be placed in a group of a subject they belong to — the latter is enforced
 * here for ALL callers, admin included.
 */
class UserGroup {
  static async findMembership(userId, assignmentId) {
    const result = await pool.query('SELECT * FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
      userId,
      assignmentId,
    ]);
    return result.rows[0] || null;
  }

  /** All memberships for a user, with subject/assignment/group names. */
  static async findMembershipsForUser(userId) {
    const result = await pool.query(
      `SELECT ug.assignment_id, a.name AS assignment_name,
              a.subject_id, s.name AS subject_name,
              ug.group_id, g.name AS group_name
       FROM user_groups ug
       JOIN groups g ON g.id = ug.group_id
       JOIN assignments a ON a.id = ug.assignment_id
       JOIN subjects s ON s.id = a.subject_id
       WHERE ug.user_id = $1
       ORDER BY s.name, a.name`,
      [userId]
    );
    return result.rows;
  }

  /** Membership rows for a batch of users, each row tagged with user_id. */
  static async findMembershipsForUsers(userIds) {
    if (!userIds || userIds.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT ug.user_id, ug.assignment_id, a.name AS assignment_name,
              a.subject_id, s.name AS subject_name,
              ug.group_id, g.name AS group_name
       FROM user_groups ug
       JOIN groups g ON g.id = ug.group_id
       JOIN assignments a ON a.id = ug.assignment_id
       JOIN subjects s ON s.id = a.subject_id
       WHERE ug.user_id = ANY($1)
       ORDER BY s.name, a.name`,
      [userIds]
    );
    return result.rows;
  }

  static async getMembers(groupId) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.student_id,
              u.enabled, u.created_at, r.name as role_name
       FROM users u
       JOIN user_groups ug ON ug.user_id = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE ug.group_id = $1
       ORDER BY u.username`,
      [groupId]
    );
    return result.rows;
  }

  static async remove(userId, assignmentId) {
    const result = await pool.query('DELETE FROM user_groups WHERE user_id = $1 AND assignment_id = $2 RETURNING *', [
      userId,
      assignmentId,
    ]);
    return result.rows[0] || null;
  }

  /** email → group_name pairs for one assignment (CSV export). */
  static async getExportMappings(assignmentId) {
    const result = await pool.query(
      `SELECT u.email, g.name AS group_name
       FROM user_groups ug
       JOIN users u ON u.id = ug.user_id
       JOIN groups g ON g.id = ug.group_id
       JOIN roles r ON u.role_id = r.id
       WHERE ug.assignment_id = $1 AND r.name = 'user'
       ORDER BY g.name, u.email`,
      [assignmentId]
    );
    return result.rows;
  }

  /**
   * Atomically place a user in a group, checking (under a row-level lock on
   * the group) that the group exists, the user belongs to the parent subject,
   * the user has no other group in the assignment (unless `replace`), and
   * capacity allows. Throws errors with a `statusCode` property.
   *
   * @param {string} userId
   * @param {string} groupId
   * @param {{replace?: boolean}} [options] replace=true (admin/AM reassignment)
   *   swaps an existing membership; replace=false (self-service join) rejects
   *   with 409 if one exists.
   */
  static async assignUserToGroup(userId, groupId, { replace = false } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the group row and get capacity + hierarchy info atomically
      const groupResult = await client.query(
        `SELECT g.*, a.subject_id,
           (SELECT COUNT(*)::int FROM user_groups ug
            JOIN users u ON u.id = ug.user_id
            WHERE ug.group_id = g.id AND u.enabled = true) AS member_count
         FROM groups g
         JOIN assignments a ON a.id = g.assignment_id
         WHERE g.id = $1
         FOR UPDATE OF g`,
        [groupId]
      );

      const group = groupResult.rows[0];
      if (!group) {
        const err = new Error('Group not found');
        err.statusCode = 404;
        throw err;
      }

      // Universal constraint: the target user must be an active (non-suspended)
      // member of the parent subject
      const memberResult = await client.query(
        'SELECT 1 FROM user_subjects WHERE user_id = $1 AND subject_id = $2 AND enabled = true',
        [userId, group.subject_id]
      );
      if (memberResult.rows.length === 0) {
        const err = new Error('User is not an active member of this subject');
        err.statusCode = 403;
        throw err;
      }

      const existingResult = await client.query('SELECT * FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
        userId,
        group.assignment_id,
      ]);
      const existing = existingResult.rows[0];

      if (existing) {
        if (!replace) {
          const err = new Error('User is already in a group for this assignment');
          err.statusCode = 409;
          throw err;
        }
        if (existing.group_id === groupId) {
          await client.query('COMMIT');
          return;
        }
        await client.query('DELETE FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
          userId,
          group.assignment_id,
        ]);
      }

      if (group.max_members !== null && group.member_count >= group.max_members) {
        const err = new Error('Group is full');
        err.statusCode = 409;
        throw err;
      }

      try {
        await client.query('INSERT INTO user_groups (user_id, group_id, assignment_id) VALUES ($1, $2, $3)', [
          userId,
          groupId,
          group.assignment_id,
        ]);
      } catch (insertErr) {
        // Concurrent join to a different group of the same assignment slips
        // past the SELECT above; the (user_id, assignment_id) PK catches it.
        if (insertErr.code === '23505') {
          const err = new Error('User is already in a group for this assignment');
          err.statusCode = 409;
          throw err;
        }
        throw insertErr;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = UserGroup;
