'use strict';

/**
 * Human-readable, PII-aware logger for the G.A.P. backend.
 *
 * Output format (single line per event):
 *   [ISO-8601] LEVEL  message  {"context":"..."}
 *
 * Examples:
 *   [2024-01-15T10:30:01.123Z] INFO   Server started on port 3001
 *   [2024-01-15T10:30:02.456Z] INFO   GET /api/users 200 172.17.0.1 15ms  {"userId":"abc-123","role":"admin"}
 *   [2024-01-15T10:30:03.789Z] ERROR  Login error  {"err":"Database connection timeout","code":"ETIMEDOUT"}
 */

const LEVEL_LABELS = {
  trace: 'TRACE',
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  fatal: 'FATAL',
};

const isSilent = () => process.env.NODE_ENV === 'test' || process.env.LOG_LEVEL === 'silent';

// ---------------------------------------------------------------------------
// PII masking utilities
// ---------------------------------------------------------------------------

/**
 * Masks an email address, keeping the first two chars of the local part and
 * the full domain — enough context to correlate log entries without exposing
 * the full address.
 *
 * Examples:
 *   john.doe@example.com  →  jo***e@example.com
 *   ab@test.com           →  ab@test.com       (short local part: show as-is)
 *   a@test.com            →  a@test.com        (single char: show as-is)
 */
function maskEmail(email) {
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
function maskName(name) {
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
 * Example: "eyJhbGciOiJIUzI1NiJ9.xxx" → "eyJhbGci..."
 */
function maskToken(token) {
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
function maskStudentId(id) {
  if (!id || typeof id !== 'string') {
    return id;
  }
  if (id.length <= 4) {
    return '***';
  }
  return `${id.slice(0, 2)}***${id.slice(-2)}`;
}

// Fields that are always fully redacted
const REDACT_FIELDS = new Set(['password', 'currentPassword', 'newPassword', 'passwordHash', 'password_hash']);

// Fields whose values are access/auth tokens and should be masked
const TOKEN_FIELDS = new Set(['token', 'resetToken', 'authorization', 'accessToken', 'refreshToken']);

/**
 * Returns a shallow-cloned copy of `meta` with known PII fields redacted or
 * masked. Intended for log context objects — not a deep sanitiser.
 */
function redactMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return meta;
  }
  const safe = { ...meta };
  for (const key of Object.keys(safe)) {
    if (REDACT_FIELDS.has(key)) {
      safe[key] = '[REDACTED]'; // eslint-disable-line security/detect-object-injection
    } else if (TOKEN_FIELDS.has(key)) {
      const tv = safe[key]; // eslint-disable-line security/detect-object-injection
      safe[key] = tv === null || tv === undefined ? tv : maskToken(String(tv)); // eslint-disable-line security/detect-object-injection
    } else if (key === 'email') {
      safe[key] = maskEmail(safe[key]); // eslint-disable-line security/detect-object-injection
    } else if (key === 'firstName' || key === 'lastName' || key === 'fullName' || key === 'name') {
      safe[key] = maskName(safe[key]); // eslint-disable-line security/detect-object-injection
    } else if (key === 'studentId' || key === 'student_id') {
      const sv = safe[key]; // eslint-disable-line security/detect-object-injection
      safe[key] = sv === null || sv === undefined ? sv : maskStudentId(String(sv)); // eslint-disable-line security/detect-object-injection
    }
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

function formatLine(level, msg, meta) {
  const ts = new Date().toISOString();
  const label = LEVEL_LABELS[level] || 'INFO '; // eslint-disable-line security/detect-object-injection
  let line = `[${ts}] ${label}  ${msg}`;
  if (meta !== undefined && meta !== null) {
    const safeMeta = typeof meta === 'object' ? redactMeta(meta) : meta;
    line += `  ${JSON.stringify(safeMeta)}`;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Logger instance
// ---------------------------------------------------------------------------

const logger = {
  trace: (msg, meta) => {
    if (!isSilent()) {
      process.stdout.write(formatLine('trace', msg, meta) + '\n');
    }
  },
  debug: (msg, meta) => {
    if (!isSilent()) {
      process.stdout.write(formatLine('debug', msg, meta) + '\n');
    }
  },
  info: (msg, meta) => {
    if (!isSilent()) {
      process.stdout.write(formatLine('info', msg, meta) + '\n');
    }
  },
  warn: (msg, meta) => {
    if (!isSilent()) {
      process.stderr.write(formatLine('warn', msg, meta) + '\n');
    }
  },
  error: (msg, meta) => {
    if (!isSilent()) {
      process.stderr.write(formatLine('error', msg, meta) + '\n');
    }
  },
  fatal: (msg, meta) => {
    // Always log fatal errors, even in test mode
    process.stderr.write(formatLine('fatal', msg, meta) + '\n');
  },
};

module.exports = { logger, maskEmail, maskName, maskToken, maskStudentId, redactMeta };
