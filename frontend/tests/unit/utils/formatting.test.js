import { formatRoleName } from '@/utils/formatting';

describe('formatRoleName', () => {
  it('formats "admin" as "Admin"', () => {
    expect(formatRoleName('admin')).toBe('Admin');
  });

  it('formats "assignment_manager" as "Assignment Manager"', () => {
    expect(formatRoleName('assignment_manager')).toBe('Assignment Manager');
  });

  it('formats "user" as "User"', () => {
    expect(formatRoleName('user')).toBe('User');
  });

  it('returns empty string for undefined', () => {
    expect(formatRoleName(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatRoleName(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatRoleName('')).toBe('');
  });
});
