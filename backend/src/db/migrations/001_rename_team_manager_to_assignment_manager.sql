-- Rename team_manager role to assignment_manager
UPDATE roles SET name = 'assignment_manager', updated_at = CURRENT_TIMESTAMP
WHERE name = 'team_manager';
