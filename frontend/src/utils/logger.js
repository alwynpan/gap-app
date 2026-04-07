/**
 * PII-safe frontend logger.
 *
 * Wraps the browser console and sanitises known PII fields before they are
 * written to developer tools or any log forwarding service. Use this instead
 * of raw `console.*` calls throughout the application.
 *
 * Only logs in development; all output is suppressed in production builds.
 */

// ---------------------------------------------------------------------------
// PII masking utilities
// ---------------------------------------------------------------------------

/**
 * Masks an email address, keeping the first two chars of the local part and
 * the full domain.
 *
 * Example: john.doe@example.com → jo***e@example.com
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') {
    return email;
  }
  const atIdx = email.indexOf('@');
  if (atIdx < 0) {
    return '***@***';
  }
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (local.length <= 2) {
    return `${local}@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

/**
 * Masks a full name, keeping only the first letter of each word.
 *
 * Example: "John Doe" → "J*** D***"
 */
export function maskName(name) {
  if (!name || typeof name !== 'string') {
    return name;
  }
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part.length > 0 ? `${part[0]}***` : ''))
    .join(' ');
}

/**
 * Masks an access or JWT token, keeping only the first 8 characters.
 *
 * Example: "eyJhbGci..." → "eyJhbGci..."
 */
export function maskToken(token) {
  if (!token || typeof token !== 'string') {
    return '[REDACTED]';
  }
  return token.length > 8 ? `${token.slice(0, 8)}...` : '[REDACTED]';
}

/**
 * Masks a student ID, keeping the first two and last two characters.
 *
 * Example: "S1234567" → "S1***67"
 */
export function maskStudentId(id) {
  if (!id || typeof id !== 'string') {
    return id;
  }
  return id.length > 4 ? `${id.slice(0, 2)}***${id.slice(-2)}` : '***';
}

// Fields that are always fully redacted
const REDACT_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
]);

/**
 * Returns a shallow-cloned copy of `meta` with known PII fields redacted or
 * masked. Safe to pass to any console method.
 */
export function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return meta;
  }
  const safe = { ...meta };
  /* eslint-disable security/detect-object-injection */
  for (const key of Object.keys(safe)) {
    if (REDACT_FIELDS.has(key)) {
      safe[key] = '[REDACTED]';
    } else if (key === 'email') {
      safe[key] = maskEmail(safe[key]);
    } else if (key === 'firstName' || key === 'lastName' || key === 'fullName' || key === 'name') {
      safe[key] = maskName(safe[key]);
    } else if (key === 'studentId') {
      safe[key] = maskStudentId(String(safe[key]));
    }
  }
  /* eslint-enable security/detect-object-injection */
  return safe;
}

// ---------------------------------------------------------------------------
// Logger — only active in development builds
//
// Note: import.meta.env.DEV is evaluated at call time (not module load time)
// so that test helpers can toggle process.env.DEV to control logger output.
// ---------------------------------------------------------------------------

/* eslint-disable no-console */
export const logger = {
  info: (msg, meta) => {
    if (import.meta.env.DEV) {
      console.info(msg, meta !== undefined ? sanitizeMeta(meta) : '');
    }
  },
  warn: (msg, meta) => {
    if (import.meta.env.DEV) {
      console.warn(msg, meta !== undefined ? sanitizeMeta(meta) : '');
    }
  },
  error: (msg, meta) => {
    if (import.meta.env.DEV) {
      console.error(msg, meta !== undefined ? sanitizeMeta(meta) : '');
    }
  },
  debug: (msg, meta) => {
    if (import.meta.env.DEV) {
      console.debug(msg, meta !== undefined ? sanitizeMeta(meta) : '');
    }
  },
};
/* eslint-enable no-console */
