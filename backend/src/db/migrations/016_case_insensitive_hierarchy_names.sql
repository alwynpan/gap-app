-- 016: Enforce the case-insensitive name uniqueness the application already
-- assumes.
--
-- Subject.findByName, Assignment.findByName and Group.findByName all compare
-- with LOWER(), but the table constraints were case-sensitive. The check and the
-- insert are separate statements, so two concurrent requests creating 'Team A'
-- and 'team a' both passed their check and both committed. Mapping import then
-- reported the pair as an ambiguous group name.

-- Abort if duplicates already exist so an operator can rename them first.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM subjects GROUP BY LOWER(name) HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce case-insensitive subject names: subjects differing only by case exist. Rename them before rerunning this migration.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM assignments GROUP BY subject_id, LOWER(name) HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce case-insensitive assignment names: assignments in one subject differ only by case. Rename them before rerunning this migration.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM groups GROUP BY assignment_id, LOWER(name) HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce case-insensitive group names: groups in one assignment differ only by case. Rename them before rerunning this migration.';
    END IF;
END;
$$;

-- The case-sensitive constraints stay: UNIQUE (id, assignment_id) on groups is
-- the composite FK target for user_groups, and the others are harmless. These
-- indexes add the stricter case-insensitive rule on top.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_name_lower ON subjects (LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_subject_name_lower ON assignments (subject_id, LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_assignment_name_lower ON groups (assignment_id, LOWER(name));
