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

  /**
   * Remove a membership only if it still points at the expected group, so a
   * self-service leave cannot delete a reassignment made after the caller's
   * membership check.
   *
   * @returns {Promise<object|null>} The deleted row, or null if it no longer matched.
   */
  static async removeFromGroup(userId, assignmentId, groupId) {
    const result = await pool.query(
      'DELETE FROM user_groups WHERE user_id = $1 AND assignment_id = $2 AND group_id = $3 RETURNING *',
      [userId, assignmentId, groupId]
    );
    return result.rows[0] || null;
  }

  /**
   * Self-service leave: check the assignment's join lock and delete the
   * membership in one transaction, so a lock that commits mid-flight is not
   * bypassed by an already-validated request.
   *
   * @param {{enforcePolicy?: boolean}} [options] false for staff removal, which
   *   is allowed while the assignment is locked.
   * @returns {Promise<object|null>} The deleted row, or null if it no longer matched.
   * @throws {Error} statusCode 403 when the assignment is locked.
   */
  static async leaveGroup(userId, assignmentId, groupId, { enforcePolicy = true } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // FOR SHARE: serializes against setJoinLocked's UPDATE without blocking
      // other members leaving at the same time.
      const lockRow = enforcePolicy
        ? await client.query('SELECT join_locked FROM assignments WHERE id = $1 FOR SHARE', [assignmentId])
        : { rows: [] };
      if (lockRow.rows[0]?.join_locked) {
        const err = new Error(
          'Group joining is currently locked for this assignment. Please contact the teaching staff.'
        );
        err.statusCode = 403;
        throw err;
      }

      const result = await client.query(
        'DELETE FROM user_groups WHERE user_id = $1 AND assignment_id = $2 AND group_id = $3 RETURNING *',
        [userId, assignmentId, groupId]
      );

      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
   * Atomically place a user in a group, checking that the group exists, the user
   * is an active member of the parent subject, the user has no other group in the
   * assignment (unless `replace`), and capacity allows. Throws errors with a
   * `statusCode` property.
   *
   * Locking: assignments -> users -> user_subjects -> groups, the same order as
   * Subject.setMemberEnabled and Subject.removeUser, so suspension cannot
   * interleave with placement and the paths cannot deadlock against each other.
   *
   * The capacity count MUST come from a statement issued after the group lock is
   * held. Counting via a subquery inside the locking SELECT reads the snapshot
   * taken before the lock wait, so a competing join that committed while we
   * waited stays invisible and both writers exceed max_members.
   *
   * @param {string} userId
   * @param {string} groupId
   * @param {{replace?: boolean, enforcePolicy?: boolean}} [options]
   *   replace=true (admin/AM reassignment) swaps an existing membership;
   *   replace=false (self-service join) rejects with 409 if one exists.
   *   enforcePolicy=true (self-service) re-checks the assignment's join lock and
   *   the group's enabled flag from the LOCKED rows, so a lock or disable that
   *   commits while this request is in flight still takes effect. Staff paths
   *   leave it false — they are allowed to place members into a locked
   *   assignment.
   */
  static async assignUserToGroup(userId, groupId, { replace = false, enforcePolicy = false } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Hierarchy lookup only — these columns are immutable for a given group,
      // and subject_id is needed to know which membership row to lock.
      const groupResult = await client.query(
        `SELECT g.id, g.assignment_id, a.subject_id
         FROM groups g
         JOIN assignments a ON a.id = g.assignment_id
         WHERE g.id = $1`,
        [groupId]
      );

      const group = groupResult.rows[0];
      if (!group) {
        const err = new Error('Group not found');
        err.statusCode = 404;
        throw err;
      }

      // Lock the ASSIGNMENT first. Deleting an assignment locks that row and then
      // cascades down to its groups, so any path that locks a group before the
      // assignment closes a deadlock cycle. Taken for every placement, not just
      // policy-enforcing ones, so the order is unconditional.
      const assignmentLock = await client.query('SELECT join_locked FROM assignments WHERE id = $1 FOR SHARE', [
        group.assignment_id,
      ]);
      if (assignmentLock.rows.length === 0) {
        const err = new Error('Group not found');
        err.statusCode = 404;
        throw err;
      }
      if (enforcePolicy && assignmentLock.rows[0].join_locked) {
        const err = new Error(
          'Group joining is currently locked for this assignment. Please contact the teaching staff.'
        );
        err.statusCode = 403;
        throw err;
      }

      // Then the parent users row, matching the order a user deletion uses
      // (users -> cascade to user_subjects). Without this, placement holding
      // user_subjects and waiting on the users FK check could deadlock against a
      // deletion holding users and waiting to cascade. KEY SHARE blocks deletion
      // but not concurrent placements.
      await client.query('SELECT 1 FROM users WHERE id = $1 FOR KEY SHARE', [userId]);

      // Universal constraint: the target user must be an active (non-suspended)
      // member of the parent subject. Locked, so a concurrent suspension either
      // completes before this check or waits behind the whole placement.
      const memberResult = await client.query(
        'SELECT enabled FROM user_subjects WHERE user_id = $1 AND subject_id = $2 FOR UPDATE',
        [userId, group.subject_id]
      );
      if (memberResult.rows.length === 0 || !memberResult.rows[0].enabled) {
        const err = new Error('User is not an active member of this subject');
        err.statusCode = 403;
        throw err;
      }

      // Take the group lock; capacity is read by a later statement. The group can
      // be deleted between the hierarchy read above and this lock, so a missing
      // row here is a real 404, not an internal error.
      const lockResult = await client.query('SELECT enabled FROM groups WHERE id = $1 FOR UPDATE', [groupId]);
      if (lockResult.rows.length === 0) {
        const err = new Error('Group not found');
        err.statusCode = 404;
        throw err;
      }

      if (enforcePolicy && !lockResult.rows[0].enabled) {
        // Re-read from the locked row: a disable committed since the route's
        // check must still win.
        const err = new Error('Cannot join a disabled group');
        err.statusCode = 400;
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

      // Fresh snapshot, taken while holding the group lock. Counts every
      // membership row — the same population Group.getMemberCount and the UI
      // report — so a disabled account cannot hide a seat and reappear over
      // capacity when it is re-enabled.
      const capacityResult = await client.query(
        `SELECT g.max_members,
                (SELECT COUNT(*)::int FROM user_groups ug WHERE ug.group_id = g.id) AS member_count
         FROM groups g WHERE g.id = $1`,
        [groupId]
      );
      const { max_members: maxMembers, member_count: memberCount } = capacityResult.rows[0];

      if (maxMembers !== null && memberCount >= maxMembers) {
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
