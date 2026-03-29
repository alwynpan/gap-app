export const API_BASE =
  import.meta.env.VITE_API_URL || `${typeof window !== 'undefined' ? window.location.origin : ''}/api`;
