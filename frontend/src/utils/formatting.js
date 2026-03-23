export const formatRoleName = (role) => (role || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
