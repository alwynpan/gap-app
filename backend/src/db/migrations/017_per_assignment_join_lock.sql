-- 017: Move the group-join lock from a single global config row to a per-
-- assignment flag.
--
-- `config.group_join_locked` froze joining and leaving for every assignment in
-- every subject, and any assignment_manager could set it — including one who
-- manages no assignments at all. The lock now lives on the assignment, so a
-- manager can only freeze the assignments they actually manage.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS join_locked BOOLEAN NOT NULL DEFAULT false;

-- Carry the existing global state forward: if joining was locked system-wide,
-- every current assignment stays locked so nothing silently reopens.
-- Guarded on the table existing: `config` is vestigial now that its only key is
-- gone, so this migration must not hard-depend on it.
DO $$
BEGIN
  IF to_regclass('public.config') IS NOT NULL THEN
    UPDATE assignments
    SET join_locked = true
    WHERE EXISTS (
      SELECT 1 FROM config WHERE key = 'group_join_locked' AND value = 'true'
    );

    -- The global key is superseded; leaving it would let a stale row imply a
    -- lock that is no longer read.
    DELETE FROM config WHERE key = 'group_join_locked';
  END IF;
END $$;
