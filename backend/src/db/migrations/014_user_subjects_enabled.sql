-- 014: Per-subject membership enablement.
--
-- Adds a reversible per-subject suspension flag to user_subjects. Suspending
-- a member (enabled = false) also deletes their user_groups rows within the
-- subject's assignments — that cleanup is application-enforced in
-- Subject.setMemberEnabled, mirroring Subject.removeUser. Non-destructive to
-- existing data: all current memberships default to enabled.
ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;
