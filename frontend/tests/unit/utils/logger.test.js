import { maskEmail, maskName, maskToken, sanitizeMeta, logger } from '@/utils/logger';

describe('maskEmail', () => {
  it('masks middle chars, keeps first two and last char of local part plus domain', () => {
    expect(maskEmail('john.doe@example.com')).toBe('jo***e@example.com');
  });

  it('keeps short local parts (2 chars or fewer) unchanged', () => {
    expect(maskEmail('ab@test.com')).toBe('ab@test.com');
    expect(maskEmail('a@test.com')).toBe('a@test.com');
  });

  it('masks a 3-char local part', () => {
    expect(maskEmail('joe@test.com')).toBe('jo***e@test.com');
  });

  it('returns *** for strings without @', () => {
    expect(maskEmail('noatsign')).toBe('***@***');
  });

  it('returns null/undefined as-is', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeUndefined();
  });
});

describe('maskName', () => {
  it('keeps only the first letter of each word', () => {
    expect(maskName('John Doe')).toBe('J*** D***');
  });

  it('handles single-word names', () => {
    expect(maskName('Alice')).toBe('A***');
  });

  it('handles names with extra whitespace', () => {
    expect(maskName('  Jane   Smith  ')).toBe('J*** S***');
  });

  it('returns null/undefined as-is', () => {
    expect(maskName(null)).toBeNull();
    expect(maskName(undefined)).toBeUndefined();
  });
});

describe('maskToken', () => {
  it('shows only the first 8 characters followed by ellipsis', () => {
    expect(maskToken('eyJhbGciOiJIUzI1NiJ9.rest')).toBe('eyJhbGci...');
  });

  it('returns [REDACTED] for tokens shorter than 9 chars', () => {
    expect(maskToken('12345678')).toBe('[REDACTED]');
    expect(maskToken('short')).toBe('[REDACTED]');
  });

  it('returns [REDACTED] for falsy values', () => {
    expect(maskToken(null)).toBe('[REDACTED]');
    expect(maskToken('')).toBe('[REDACTED]');
    expect(maskToken(undefined)).toBe('[REDACTED]');
  });
});

describe('sanitizeMeta', () => {
  it('fully redacts password fields', () => {
    const meta = { password: 'secret', currentPassword: 'old', newPassword: 'new' };
    expect(sanitizeMeta(meta)).toEqual({
      password: '[REDACTED]',
      currentPassword: '[REDACTED]',
      newPassword: '[REDACTED]',
    });
  });

  it('fully redacts token fields', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.rest';
    const result = sanitizeMeta({ token, accessToken: token });
    expect(result.token).toBe('[REDACTED]');
    expect(result.accessToken).toBe('[REDACTED]');
  });

  it('masks email', () => {
    const result = sanitizeMeta({ email: 'alice@example.com', action: 'login' });
    expect(result.email).toBe('al***e@example.com');
    expect(result.action).toBe('login');
  });

  it('masks firstName, lastName, fullName, and name fields', () => {
    const result = sanitizeMeta({
      firstName: 'Alice',
      lastName: 'Smith',
      fullName: 'Alice Smith',
      name: 'Bob Jones',
    });
    expect(result.firstName).toBe('A***');
    expect(result.lastName).toBe('S***');
    expect(result.fullName).toBe('A*** S***');
    expect(result.name).toBe('B*** J***');
  });

  it('masks studentId', () => {
    const result = sanitizeMeta({ studentId: 'S9876543' });
    expect(result.studentId).toBe('S9***43');
  });

  it('masks short studentId with ***', () => {
    const result = sanitizeMeta({ studentId: 'S123' });
    expect(result.studentId).toBe('***');
  });

  it('leaves unrecognised fields unchanged', () => {
    const result = sanitizeMeta({ role: 'admin', userId: 'abc-123', status: 200 });
    expect(result).toEqual({ role: 'admin', userId: 'abc-123', status: 200 });
  });

  it('does not mutate the original object', () => {
    const original = { password: 'secret', email: 'test@test.com' };
    sanitizeMeta(original);
    expect(original.password).toBe('secret');
    expect(original.email).toBe('test@test.com');
  });

  it('returns non-objects as-is', () => {
    expect(sanitizeMeta(null)).toBeNull();
    expect(sanitizeMeta('string')).toBe('string');
    expect(sanitizeMeta([1, 2])).toEqual([1, 2]);
  });
});

describe('logger (dev mode)', () => {
  const origDev = process.env.DEV;

  beforeAll(() => {
    process.env.DEV = 'true';
  });

  afterAll(() => {
    if (origDev === undefined) {
      delete process.env.DEV;
    } else {
      process.env.DEV = origDev;
    }
  });

  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls console.info for info level', () => {
    logger.info('test message');
    expect(console.info).toHaveBeenCalledWith('test message', '');
  });

  it('calls console.warn for warn level', () => {
    logger.warn('warn message');
    expect(console.warn).toHaveBeenCalledWith('warn message', '');
  });

  it('calls console.error for error level', () => {
    logger.error('error message');
    expect(console.error).toHaveBeenCalledWith('error message', '');
  });

  it('sanitizes PII in meta before logging', () => {
    logger.info('login attempt', { email: 'user@example.com', password: 'secret' });
    expect(console.info).toHaveBeenCalledWith('login attempt', {
      email: 'us***r@example.com',
      password: '[REDACTED]',
    });
  });
});

describe('logger (production mode)', () => {
  const origDev = process.env.DEV;

  beforeAll(() => {
    delete process.env.DEV;
  });

  afterAll(() => {
    if (origDev === undefined) {
      delete process.env.DEV;
    } else {
      process.env.DEV = origDev;
    }
  });

  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('suppresses info in production', () => {
    logger.info('should not appear');
    expect(console.info).not.toHaveBeenCalled();
  });

  it('suppresses warn in production', () => {
    logger.warn('should not appear');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('suppresses error in production', () => {
    logger.error('should not appear');
    expect(console.error).not.toHaveBeenCalled();
  });
});
