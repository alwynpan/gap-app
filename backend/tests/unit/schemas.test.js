'use strict';

// NOTE: isomorphic-dompurify is mocked in this test environment (see jest.config.js).
// The mock passes strings through trim() only — it does NOT strip HTML.
// HTML-stripping behaviour is covered by the real DOMPurify in the browser/production build.
// These tests therefore focus on validation logic (lengths, patterns, required fields).

const { sanitize } = require('../../src/utils/sanitize');
const {
  parseBody,
  usernameSchema,
  emailSchema,
  passwordSchema,
  newPasswordSchema,
  nameSchema,
  studentIdSchema,
  groupNameSchema,
  registerSchema,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  importUserRowSchema,
  createGroupSchema,
  updateGroupSchema,
  forgotPasswordSchema,
  setPasswordSchema,
  validateUUID,
} = require('../../src/utils/schemas');

// ── helpers ──────────────────────────────────────────────────────────────────

function ok(schema, value) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(true);
  return result.data;
}

function err(schema, value) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return result.error.issues[0]?.message;
}

// ── sanitize (mock: trim only) ────────────────────────────────────────────────

describe('sanitize', () => {
  it('returns a normal string unchanged', () => {
    expect(sanitize('hello world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitize('  hello  ')).toBe('hello');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitize('   ')).toBe('');
  });

  it('returns non-string values as-is (null)', () => {
    expect(sanitize(null)).toBeNull();
  });

  it('returns non-string values as-is (undefined)', () => {
    expect(sanitize(undefined)).toBeUndefined();
  });

  it('returns non-string values as-is (number)', () => {
    expect(sanitize(42)).toBe(42);
  });

  it('returns non-string values as-is (boolean)', () => {
    expect(sanitize(true)).toBe(true);
  });
});

// ── parseBody ─────────────────────────────────────────────────────────────────

describe('parseBody', () => {
  it('returns { data, error: null } on success', () => {
    const schema = usernameSchema;
    const result = parseBody(schema, 'alice');
    expect(result.error).toBeNull();
    expect(result.data).toBe('alice');
  });

  it('returns { data: null, error: string } on failure', () => {
    const schema = usernameSchema;
    const result = parseBody(schema, '');
    expect(result.data).toBeNull();
    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('Username is required');
  });

  it('returns first error message when multiple fields fail', () => {
    const result = parseBody(loginSchema, { username: '', password: '' });
    expect(result.data).toBeNull();
    expect(typeof result.error).toBe('string');
  });
});

// ── usernameSchema ───────────────────────────────────────────────────────────

describe('usernameSchema', () => {
  describe('valid inputs', () => {
    it.each(['alice', 'Bob_99', 'user.name', 'a-b-c', 'A1._-Z'])('accepts "%s"', (v) => {
      expect(ok(usernameSchema, v)).toBe(v);
    });

    it('accepts exactly 100 characters', () => {
      expect(ok(usernameSchema, 'a'.repeat(100))).toBe('a'.repeat(100));
    });

    it('trims whitespace before validation', () => {
      expect(ok(usernameSchema, '  alice  ')).toBe('alice');
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty string', () => {
      expect(err(usernameSchema, '')).toBe('Username is required');
    });

    it('rejects null (type error)', () => {
      expect(err(usernameSchema, null)).toEqual(expect.any(String));
    });

    it('rejects username longer than 100 characters', () => {
      expect(err(usernameSchema, 'a'.repeat(101))).toBe('Username must be at most 100 characters');
    });

    it.each(['user name', 'user@name', 'user!name', '<script>alert(1)</script>'])(
      'rejects invalid characters in "%s"',
      (v) => {
        expect(err(usernameSchema, v)).toBe(
          'Username may only contain letters, numbers, underscores, hyphens, and dots'
        );
      }
    );
  });
});

// ── emailSchema ──────────────────────────────────────────────────────────────

describe('emailSchema', () => {
  describe('valid inputs', () => {
    it.each(['user@example.com', 'first.last@domain.co.uk', 'test+tag@sub.domain.org'])('accepts "%s"', (v) => {
      expect(ok(emailSchema, v)).toBe(v);
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty string', () => {
      expect(err(emailSchema, '')).toBe('Email is required');
    });

    it('rejects null (type error)', () => {
      expect(err(emailSchema, null)).toEqual(expect.any(String));
    });

    it('rejects email longer than 255 characters', () => {
      const long = 'a'.repeat(250) + '@b.com';
      expect(err(emailSchema, long)).toBe('Email must be at most 255 characters');
    });

    it('rejects email missing @', () => {
      expect(err(emailSchema, 'userexample.com')).toBe('Invalid email format');
    });

    it('rejects email with no domain', () => {
      expect(err(emailSchema, 'user@')).toBe('Invalid email format');
    });

    it('rejects email with spaces', () => {
      expect(err(emailSchema, 'user @example.com')).toBe('Invalid email format');
    });

    it('rejects email without TLD', () => {
      expect(err(emailSchema, 'user@domain')).toBe('Invalid email format');
    });
  });
});

// ── passwordSchema ───────────────────────────────────────────────────────────

describe('passwordSchema', () => {
  describe('valid inputs', () => {
    it('accepts a 6-character password', () => {
      expect(ok(passwordSchema, 'abcdef')).toBe('abcdef');
    });

    it('accepts exactly 255 characters', () => {
      expect(ok(passwordSchema, 'a'.repeat(255))).toBe('a'.repeat(255));
    });

    it('accepts passwords with special characters (no sanitization)', () => {
      expect(ok(passwordSchema, 'p@$$w0rd<3')).toBe('p@$$w0rd<3');
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty string', () => {
      expect(err(passwordSchema, '')).toBe('Password is required');
    });

    it('rejects null (type error)', () => {
      expect(err(passwordSchema, null)).toEqual(expect.any(String));
    });

    it('rejects password shorter than 6 characters', () => {
      expect(err(passwordSchema, 'abcde')).toBe('Password must be at least 6 characters');
    });

    it('rejects password longer than 255 characters', () => {
      expect(err(passwordSchema, 'a'.repeat(256))).toBe('Password must be at most 255 characters');
    });
  });
});

// ── newPasswordSchema ─────────────────────────────────────────────────────────

describe('newPasswordSchema', () => {
  it('rejects password shorter than 6 characters', () => {
    expect(err(newPasswordSchema, 'short')).toBe('New password must be at least 6 characters');
  });

  it('rejects password longer than 255 characters', () => {
    expect(err(newPasswordSchema, 'a'.repeat(256))).toBe('New password must be at most 255 characters');
  });
});

// ── nameSchema ────────────────────────────────────────────────────────────────

describe('nameSchema', () => {
  describe('valid inputs', () => {
    it('accepts a normal name', () => {
      expect(ok(nameSchema('Name'), 'Alice')).toBe('Alice');
    });

    it('accepts exactly 100 characters', () => {
      expect(ok(nameSchema('Name'), 'a'.repeat(100))).toBe('a'.repeat(100));
    });

    it('trims whitespace before validation', () => {
      expect(ok(nameSchema('Name'), '  Alice  ')).toBe('Alice');
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty string with default label', () => {
      expect(err(nameSchema('Name'), '')).toBe('Name is required');
    });

    it('rejects null (type error)', () => {
      expect(err(nameSchema('Name'), null)).toEqual(expect.any(String));
    });

    it('rejects name longer than 100 characters', () => {
      expect(err(nameSchema('Name'), 'a'.repeat(101))).toBe('Name must be at most 100 characters');
    });

    it('uses custom label in error messages', () => {
      expect(err(nameSchema('First name'), '')).toBe('First name is required');
      expect(err(nameSchema('Last name'), 'a'.repeat(101))).toBe('Last name must be at most 100 characters');
    });
  });
});

// ── studentIdSchema ──────────────────────────────────────────────────────────

describe('studentIdSchema', () => {
  describe('valid inputs', () => {
    it('accepts a valid student ID', () => {
      const data = ok(studentIdSchema, 'STU-001');
      expect(data).toBe('STU-001');
    });

    it('accepts exactly 50 characters', () => {
      expect(ok(studentIdSchema, 'x'.repeat(50))).toBe('x'.repeat(50));
    });
  });

  describe('optional — absent values produce undefined', () => {
    it('transforms empty string to undefined', () => {
      expect(ok(studentIdSchema, '')).toBeUndefined();
    });

    it('transforms null to undefined', () => {
      expect(ok(studentIdSchema, null)).toBeUndefined();
    });

    it('transforms undefined to undefined', () => {
      expect(ok(studentIdSchema, undefined)).toBeUndefined();
    });
  });

  describe('invalid inputs', () => {
    it('rejects student ID longer than 50 characters', () => {
      expect(err(studentIdSchema, 'x'.repeat(51))).toBe('Student ID must be at most 50 characters');
    });
  });
});

// ── groupNameSchema ──────────────────────────────────────────────────────────

describe('groupNameSchema', () => {
  describe('valid inputs', () => {
    it('accepts a valid group name', () => {
      expect(ok(groupNameSchema, 'Team Alpha')).toBe('Team Alpha');
    });

    it('accepts exactly 100 characters', () => {
      expect(ok(groupNameSchema, 'g'.repeat(100))).toBe('g'.repeat(100));
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty string', () => {
      expect(err(groupNameSchema, '')).toBe('Group name is required');
    });

    it('rejects null (type error)', () => {
      expect(err(groupNameSchema, null)).toEqual(expect.any(String));
    });

    it('rejects group name longer than 100 characters', () => {
      expect(err(groupNameSchema, 'g'.repeat(101))).toBe('Group name must be at most 100 characters');
    });
  });
});

// ── registerSchema ────────────────────────────────────────────────────────────

describe('registerSchema', () => {
  const validBody = {
    username: 'alice',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    studentId: 'STU-001',
  };

  it('parses a valid registration body', () => {
    const data = ok(registerSchema, validBody);
    expect(data.username).toBe('alice');
    expect(data.email).toBe('alice@example.com');
  });

  it('succeeds without optional studentId', () => {
    const { studentId, ...body } = validBody;
    expect(ok(registerSchema, body).studentId).toBeUndefined();
  });

  it('succeeds without optional password', () => {
    expect(ok(registerSchema, validBody).password).toBeUndefined();
  });

  it('rejects missing username', () => {
    const { username, ...body } = validBody;
    expect(err(registerSchema, body)).toEqual(expect.any(String));
  });

  it('rejects invalid email', () => {
    const result = parseBody(registerSchema, { ...validBody, email: 'not-an-email' });
    expect(result.error).toBe('Invalid email format');
  });

  it('rejects missing firstName', () => {
    const { firstName, ...body } = validBody;
    expect(err(registerSchema, body)).toEqual(expect.any(String));
  });
});

// ── loginSchema ──────────────────────────────────────────────────────────────

describe('loginSchema', () => {
  it('parses valid login credentials', () => {
    const data = ok(loginSchema, { username: 'alice', password: 'secret' });
    expect(data.username).toBe('alice');
    expect(data.password).toBe('secret');
  });

  it('rejects missing username', () => {
    expect(err(loginSchema, { username: '', password: 'secret' })).toBe('Username is required');
  });

  it('rejects missing password', () => {
    expect(err(loginSchema, { username: 'alice', password: '' })).toBe('Password is required');
  });
});

// ── createUserSchema ──────────────────────────────────────────────────────────

describe('createUserSchema', () => {
  const validBody = {
    username: 'bob',
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Jones',
  };

  it('parses a valid create-user body', () => {
    const data = ok(createUserSchema, validBody);
    expect(data.username).toBe('bob');
  });

  it('rejects invalid username characters', () => {
    const result = parseBody(createUserSchema, { ...validBody, username: 'bad user' });
    expect(result.error).toBe('Username may only contain letters, numbers, underscores, hyphens, and dots');
  });

  it('rejects XSS payload in username field (regex catch)', () => {
    const result = parseBody(createUserSchema, { ...validBody, username: '<script>xss</script>' });
    expect(result.error).toBe('Username may only contain letters, numbers, underscores, hyphens, and dots');
  });
});

// ── updateUserSchema ──────────────────────────────────────────────────────────

describe('updateUserSchema', () => {
  it('succeeds with all fields optional (empty body)', () => {
    const data = ok(updateUserSchema, {});
    expect(data).toBeDefined();
  });

  it('accepts partial update (email only)', () => {
    const data = ok(updateUserSchema, { email: 'new@example.com' });
    expect(data.email).toBe('new@example.com');
  });

  it('rejects invalid email in update', () => {
    expect(err(updateUserSchema, { email: 'not-valid' })).toBe('Invalid email format');
  });

  it('accepts optional username field (M1)', () => {
    const data = ok(updateUserSchema, { username: 'alice' });
    expect(data.username).toBe('alice');
  });

  it('rejects invalid username characters (M1)', () => {
    expect(err(updateUserSchema, { username: 'bad user' })).toBe(
      'Username may only contain letters, numbers, underscores, hyphens, and dots'
    );
  });

  it('accepts optional groupId as UUID (M1)', () => {
    const data = ok(updateUserSchema, { groupId: '10000000-0000-4000-8000-000000000001' });
    expect(data.groupId).toBe('10000000-0000-4000-8000-000000000001');
  });

  it('accepts groupId as null (M1)', () => {
    const data = ok(updateUserSchema, { groupId: null });
    expect(data.groupId).toBeNull();
  });

  it('rejects groupId that is not a UUID (M1)', () => {
    expect(err(updateUserSchema, { groupId: 'not-a-uuid' })).toEqual(expect.any(String));
  });
});

// ── changePasswordSchema ──────────────────────────────────────────────────────

describe('changePasswordSchema', () => {
  it('accepts valid password change body', () => {
    const data = ok(changePasswordSchema, { currentPassword: 'old123', newPassword: 'new123' });
    expect(data.newPassword).toBe('new123');
  });

  it('rejects missing currentPassword', () => {
    expect(err(changePasswordSchema, { currentPassword: '', newPassword: 'new123' })).toBe(
      'Current password is required'
    );
  });

  it('rejects short newPassword', () => {
    expect(err(changePasswordSchema, { currentPassword: 'old123', newPassword: 'short' })).toBe(
      'New password must be at least 6 characters'
    );
  });

  it('rejects newPassword longer than 255 characters', () => {
    expect(err(changePasswordSchema, { currentPassword: 'old123', newPassword: 'a'.repeat(256) })).toBe(
      'New password must be at most 255 characters'
    );
  });
});

// ── importUserRowSchema ───────────────────────────────────────────────────────

describe('importUserRowSchema', () => {
  const validRow = {
    username: 'charlie',
    email: 'charlie@example.com',
    firstName: 'Charlie',
    lastName: 'Brown',
  };

  it('parses a valid import row', () => {
    const data = ok(importUserRowSchema, validRow);
    expect(data.username).toBe('charlie');
  });

  it('rejects row with missing email', () => {
    const { email, ...row } = validRow;
    expect(err(importUserRowSchema, row)).toEqual(expect.any(String));
  });

  it('rejects row with invalid email format', () => {
    expect(err(importUserRowSchema, { ...validRow, email: 'bad' })).toBe('Invalid email format');
  });
});

// ── createGroupSchema ─────────────────────────────────────────────────────────

describe('createGroupSchema', () => {
  it('accepts a valid group name', () => {
    const data = ok(createGroupSchema, { name: 'Team A' });
    expect(data.name).toBe('Team A');
  });

  it('rejects empty group name', () => {
    expect(err(createGroupSchema, { name: '' })).toBe('Group name is required');
  });

  it('rejects group name over 100 characters', () => {
    expect(err(createGroupSchema, { name: 'x'.repeat(101) })).toBe('Group name must be at most 100 characters');
  });
});

// ── updateGroupSchema ─────────────────────────────────────────────────────────

describe('updateGroupSchema', () => {
  it('accepts empty body (all fields optional)', () => {
    expect(ok(updateGroupSchema, {})).toBeDefined();
  });

  it('accepts partial update with name', () => {
    const data = ok(updateGroupSchema, { name: 'Renamed Group' });
    expect(data.name).toBe('Renamed Group');
  });

  it('rejects invalid name in update', () => {
    expect(err(updateGroupSchema, { name: '' })).toBe('Group name is required');
  });
});

// ── forgotPasswordSchema ──────────────────────────────────────────────────────

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    const data = ok(forgotPasswordSchema, { email: 'user@example.com' });
    expect(data.email).toBe('user@example.com');
  });

  it('rejects empty email', () => {
    expect(err(forgotPasswordSchema, { email: '' })).toBe('Email is required');
  });

  it('rejects invalid email format — no @ symbol (M2)', () => {
    expect(err(forgotPasswordSchema, { email: 'invalidemail' })).toBe('Invalid email format');
  });

  it('rejects invalid email format — no domain (M2)', () => {
    expect(err(forgotPasswordSchema, { email: 'user@' })).toBe('Invalid email format');
  });
});

// ── validateUUID ──────────────────────────────────────────────────────────────

describe('validateUUID', () => {
  it('returns true for a valid UUID v4', () => {
    expect(validateUUID('10000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it('returns true for a real UUID', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('returns false for a non-UUID string', () => {
    expect(validateUUID('not-a-uuid')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(validateUUID('')).toBe(false);
  });

  it('returns false for a UUID with wrong segment lengths', () => {
    expect(validateUUID('10000000-0000-4000-8000-00000000001')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(validateUUID('10000000-0000-4000-8000-000000000001'.toUpperCase())).toBe(true);
  });
});

// ── setPasswordSchema ─────────────────────────────────────────────────────────

describe('setPasswordSchema', () => {
  it('accepts valid token and password', () => {
    const data = ok(setPasswordSchema, { token: 'abc123', password: 'newpass1' });
    expect(data.token).toBe('abc123');
    expect(data.password).toBe('newpass1');
  });

  it('rejects missing token', () => {
    expect(err(setPasswordSchema, { token: '', password: 'newpass1' })).toBe('Token is required');
  });

  it('rejects short password', () => {
    expect(err(setPasswordSchema, { token: 'abc123', password: 'short' })).toBe(
      'Password must be at least 6 characters'
    );
  });
});
