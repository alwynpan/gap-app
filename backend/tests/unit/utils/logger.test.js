'use strict';

const { maskEmail, maskName, maskToken, maskStudentId, redactMeta } = require('../../../src/utils/logger');

// ---------------------------------------------------------------------------
// logger output (uses module reload so isSilent=false paths are exercised)
// ---------------------------------------------------------------------------

describe('logger output methods', () => {
  let activeLogger;
  let stdoutSpy;
  let stderrSpy;
  const origNodeEnv = process.env.NODE_ENV;
  const origLogLevel = process.env.LOG_LEVEL;

  beforeAll(() => {
    // Load a fresh module instance with NODE_ENV != test so isSilent is false
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;
    jest.resetModules();
    activeLogger = require('../../../src/utils/logger').logger;
  });

  afterAll(() => {
    process.env.NODE_ENV = origNodeEnv;
    if (origLogLevel !== undefined) {
      process.env.LOG_LEVEL = origLogLevel;
    }
    jest.resetModules();
  });

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('info writes a formatted line to stdout', () => {
    activeLogger.info('hello world');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = stdoutSpy.mock.calls[0][0];
    expect(output).toMatch(/\[.*\] INFO {3}hello world\n/);
  });

  it('warn writes a formatted line to stderr', () => {
    activeLogger.warn('something odd');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toMatch(/WARN /);
  });

  it('error writes a formatted line to stderr', () => {
    activeLogger.error('boom', { err: 'oops' });
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = stderrSpy.mock.calls[0][0];
    expect(output).toMatch(/ERROR/);
    expect(output).toContain('boom');
  });

  it('debug writes to stdout', () => {
    activeLogger.debug('debug msg');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy.mock.calls[0][0]).toMatch(/DEBUG/);
  });

  it('trace writes to stdout', () => {
    activeLogger.trace('trace msg');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy.mock.calls[0][0]).toMatch(/TRACE/);
  });

  it('fatal always writes to stderr even in test mode', () => {
    // fatal bypasses isSilent
    activeLogger.fatal('fatal error');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toMatch(/FATAL/);
  });

  it('redacts PII from meta before writing', () => {
    activeLogger.info('user logged in', { email: 'secret@example.com', password: 'pass123' });
    const output = stdoutSpy.mock.calls[0][0];
    expect(output).not.toContain('secret@example.com');
    expect(output).not.toContain('pass123');
    expect(output).toContain('[REDACTED]');
  });

  it('includes meta as JSON when provided', () => {
    activeLogger.info('test', { role: 'admin', userId: 'u-1' });
    const output = stdoutSpy.mock.calls[0][0];
    expect(output).toContain('"role":"admin"');
    expect(output).toContain('"userId":"u-1"');
  });

  it('silent when LOG_LEVEL=silent', () => {
    process.env.LOG_LEVEL = 'silent';
    jest.resetModules();
    const silentLogger = require('../../../src/utils/logger').logger;
    silentLogger.info('should be suppressed');
    silentLogger.error('also suppressed');
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    delete process.env.LOG_LEVEL;
    jest.resetModules();
  });
});

describe('maskEmail', () => {
  it('masks middle chars, keeps first two and last char of local part plus domain', () => {
    expect(maskEmail('john.doe@example.com')).toBe('jo***e@example.com');
  });

  it('keeps short local parts unchanged (2 chars or fewer)', () => {
    expect(maskEmail('ab@test.com')).toBe('ab@test.com');
    expect(maskEmail('a@test.com')).toBe('a@test.com');
  });

  it('masks a 3-char local part', () => {
    expect(maskEmail('joe@test.com')).toBe('jo***e@test.com');
  });

  it('returns *** for missing or invalid email', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeUndefined();
    expect(maskEmail('noatsign')).toBe('***@***');
  });

  it('returns non-string values as-is', () => {
    expect(maskEmail(42)).toBe(42);
  });
});

describe('maskName', () => {
  it('keeps only the first letter of each word', () => {
    expect(maskName('John Doe')).toBe('J*** D***');
  });

  it('handles single-word names', () => {
    expect(maskName('Alice')).toBe('A***');
  });

  it('handles extra whitespace between words', () => {
    expect(maskName('  Jane   Smith  ')).toBe('J*** S***');
  });

  it('returns null/undefined as-is', () => {
    expect(maskName(null)).toBeNull();
    expect(maskName(undefined)).toBeUndefined();
  });

  it('returns non-string values as-is', () => {
    expect(maskName(42)).toBe(42);
  });
});

describe('maskToken', () => {
  it('shows only the first 8 characters followed by ellipsis', () => {
    expect(maskToken('eyJhbGciOiJIUzI1NiJ9.rest')).toBe('eyJhbGci...');
  });

  it('returns [REDACTED] for short tokens', () => {
    expect(maskToken('short')).toBe('[REDACTED]');
    expect(maskToken('12345678')).toBe('[REDACTED]');
  });

  it('returns [REDACTED] for falsy values', () => {
    expect(maskToken(null)).toBe('[REDACTED]');
    expect(maskToken('')).toBe('[REDACTED]');
    expect(maskToken(undefined)).toBe('[REDACTED]');
  });
});

describe('maskStudentId', () => {
  it('shows first two and last two characters', () => {
    expect(maskStudentId('S1234567')).toBe('S1***67');
  });

  it('returns *** for short IDs (4 chars or fewer)', () => {
    expect(maskStudentId('S123')).toBe('***');
    expect(maskStudentId('AB')).toBe('***');
  });

  it('returns null/undefined as-is', () => {
    expect(maskStudentId(null)).toBeNull();
    expect(maskStudentId(undefined)).toBeUndefined();
  });
});

describe('redactMeta', () => {
  it('fully redacts password fields', () => {
    const meta = { password: 'secret123', currentPassword: 'old', newPassword: 'new' };
    const result = redactMeta(meta);
    expect(result.password).toBe('[REDACTED]');
    expect(result.currentPassword).toBe('[REDACTED]');
    expect(result.newPassword).toBe('[REDACTED]');
  });

  it('masks token fields', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.rest';
    const result = redactMeta({ token, accessToken: token });
    expect(result.token).toBe('eyJhbGci...');
    expect(result.accessToken).toBe('eyJhbGci...');
  });

  it('masks email field', () => {
    const result = redactMeta({ email: 'alice@example.com', action: 'login' });
    expect(result.email).toBe('al***e@example.com');
    expect(result.action).toBe('login');
  });

  it('masks firstName and lastName fields', () => {
    const result = redactMeta({ firstName: 'Alice', lastName: 'Smith' });
    expect(result.firstName).toBe('A***');
    expect(result.lastName).toBe('S***');
  });

  it('masks studentId field', () => {
    const result = redactMeta({ studentId: 'S9876543' });
    expect(result.studentId).toBe('S9***43');
  });

  it('leaves unrecognised fields unchanged', () => {
    const result = redactMeta({ role: 'admin', userId: 'abc-123', status: 200 });
    expect(result).toEqual({ role: 'admin', userId: 'abc-123', status: 200 });
  });

  it('does not mutate the original object', () => {
    const original = { password: 'secret', email: 'test@test.com' };
    redactMeta(original);
    expect(original.password).toBe('secret');
    expect(original.email).toBe('test@test.com');
  });

  it('returns non-objects as-is', () => {
    expect(redactMeta(null)).toBeNull();
    expect(redactMeta('string')).toBe('string');
    expect(redactMeta([1, 2])).toEqual([1, 2]);
  });
});
