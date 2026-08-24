// Frontend schema tests run in jsdom — DOMPurify is available with a real DOM,
// so sanitize() here actually strips HTML (unlike the backend's test mock).
import { sanitize } from '@/utils/sanitize';
import {
  parseBody,
  loginSchema,
  usernameSchema,
  emailSchema,
  passwordSchema,
  newPasswordSchema,
  nameSchema,
  studentIdSchema,
  groupNameSchema,
  registerSchema,
  createUserSchema,
  changePasswordSchema,
  createGroupSchema,
  createSubjectSchema,
  createAssignmentSchema,
  updateGroupSchema,
  updateUserSchema,
  forgotPasswordSchema,
  setPasswordSchema,
} from '@/utils/schemas';

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

// ── sanitize (real DOMPurify in jsdom) ────────────────────────────────────────

describe('sanitize', () => {
  describe('positive cases', () => {
    it('returns a normal string unchanged', () => {
      expect(sanitize('hello world')).toBe('hello world');
    });

    it('trims leading and trailing whitespace', () => {
      expect(sanitize('  hello  ')).toBe('hello');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(sanitize('   ')).toBe('');
    });

    it('returns empty string unchanged', () => {
      expect(sanitize('')).toBe('');
    });
  });

  describe('HTML / XSS stripping', () => {
    it('strips simple HTML tags, preserving text content', () => {
      expect(sanitize('<b>bold</b>')).toBe('bold');
    });

    it('strips <script> tags and their content entirely', () => {
      // DOMPurify removes script content — stronger than regex which kept inner text
      expect(sanitize('<script>alert(1)</script>')).toBe('');
    });

    it('strips <img> with onerror payload', () => {
      expect(sanitize('<img onerror=alert(1)>')).toBe('');
    });

    it('strips <div> with onmouseover payload, preserving text', () => {
      expect(sanitize('<div onmouseover="alert(1)">text</div>')).toBe('text');
    });

    it('strips nested HTML tags', () => {
      expect(sanitize('<div><span>inner</span></div>')).toBe('inner');
    });

    it('strips self-closing tags', () => {
      expect(sanitize('before<br/>after')).toBe('beforeafter');
    });
  });

  describe('non-string values returned as-is', () => {
    it('returns null unchanged', () => {
      expect(sanitize(null)).toBeNull();
    });

    it('returns undefined unchanged', () => {
      expect(sanitize(undefined)).toBeUndefined();
    });

    it('returns a number unchanged', () => {
      expect(sanitize(42)).toBe(42);
    });

    it('returns a boolean unchanged', () => {
      expect(sanitize(true)).toBe(true);
    });
  });
});

// ── parseBody ─────────────────────────────────────────────────────────────────

describe('parseBody', () => {
  it('returns { data, error: null } on success', () => {
    const result = parseBody(usernameSchema, 'alice');
    expect(result.error).toBeNull();
    expect(result.data).toBe('alice');
  });

  it('returns { data: null, error: string } on failure', () => {
    const result = parseBody(usernameSchema, '');
    expect(result.data).toBeNull();
    expect(result.error).toBe('Username is required');
  });

  it('returns first error message on multi-field failure', () => {
    const result = parseBody(registerSchema, {
      username: '',
      email: 'bad',
      firstName: '',
      lastName: '',
    });
    expect(result.data).toBeNull();
    expect(typeof result.error).toBe('string');
  });
});

// ── usernameSchema ───────────────────────────────────────────────────────────

describe('usernameSchema', () => {
  describe('valid inputs', () => {
    it.each(['alice', 'Bob_99', 'user.name', 'a-b-c'])('accepts "%s"', (v) => {
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

    it('rejects null', () => {
      expect(err(usernameSchema, null)).toEqual(expect.any(String));
    });

    it('rejects username longer than 100 characters', () => {
      expect(err(usernameSchema, 'a'.repeat(101))).toBe('Username must be at most 100 characters');
    });

    it.each(['user name', 'user@name', 'user!name'])('rejects invalid characters in "%s"', (v) => {
      expect(err(usernameSchema, v)).toBe('Username may only contain letters, numbers, underscores, hyphens, and dots');
    });

    it('rejects XSS payload (DOMPurify strips content, leaving empty string)', () => {
      // <script>alert(1)</script> → DOMPurify strips to '' → min(1) fails
      expect(err(usernameSchema, '<script>alert(1)</script>')).toBe('Username is required');
    });
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

    it('rejects null', () => {
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

    it('rejects XSS payload in email field', () => {
      // DOMPurify strips <script> content, leaving empty string → "Email is required"
      expect(err(emailSchema, '<script>alert(1)</script>')).toBe('Email is required');
    });
  });
});

// ── passwordSchema ───────────────────────────────────────────────────────────

describe('passwordSchema', () => {
  describe('valid inputs', () => {
    it('accepts a 6-character password', () => {
      expect(ok(passwordSchema, 'abcdef')).toBe('abcdef');
    });

    it('accepts a 255-character password', () => {
      expect(ok(passwordSchema, 'a'.repeat(255))).toBe('a'.repeat(255));
    });

    it('accepts passwords with special characters (not sanitized)', () => {
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
  it('rejects short password with "New password" message', () => {
    expect(err(newPasswordSchema, 'short')).toBe('New password must be at least 6 characters');
  });

  it('accepts a valid new password', () => {
    expect(ok(newPasswordSchema, 'validpass')).toBe('validpass');
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

    it('strips HTML from name fields', () => {
      // DOMPurify: <b>Alice</b> → 'Alice' → valid
      expect(ok(nameSchema('Name'), '<b>Alice</b>')).toBe('Alice');
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty string', () => {
      expect(err(nameSchema('Name'), '')).toBe('Name is required');
    });

    it('rejects null', () => {
      expect(err(nameSchema('Name'), null)).toEqual(expect.any(String));
    });

    it('rejects name longer than 100 characters', () => {
      expect(err(nameSchema('Name'), 'a'.repeat(101))).toBe('Name must be at most 100 characters');
    });

    it('uses custom label in error messages', () => {
      expect(err(nameSchema('First name'), '')).toBe('First name is required');
      expect(err(nameSchema('Last name'), 'a'.repeat(101))).toBe('Last name must be at most 100 characters');
    });

    it('rejects XSS payload that strips to empty string', () => {
      expect(err(nameSchema('Name'), '<script>alert(1)</script>')).toBe('Name is required');
    });
  });
});

// ── studentIdSchema ──────────────────────────────────────────────────────────

describe('studentIdSchema', () => {
  describe('valid inputs', () => {
    it('accepts a valid student ID', () => {
      expect(ok(studentIdSchema, 'STU-001')).toBe('STU-001');
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

    it('rejects null', () => {
      expect(err(groupNameSchema, null)).toEqual(expect.any(String));
    });

    it('rejects group name longer than 100 characters', () => {
      expect(err(groupNameSchema, 'g'.repeat(101))).toBe('Group name must be at most 100 characters');
    });
  });
});

// ── loginSchema ───────────────────────────────────────────────────────────────

describe('loginSchema', () => {
  it('accepts valid username and password', () => {
    const data = ok(loginSchema, { username: 'alice', password: 'secret' });
    expect(data.username).toBe('alice');
    expect(data.password).toBe('secret');
  });

  it('rejects empty username', () => {
    expect(err(loginSchema, { username: '', password: 'secret' })).toBe('Username is required');
  });

  it('rejects empty password', () => {
    expect(err(loginSchema, { username: 'alice', password: '' })).toBe('Password is required');
  });

  it('sanitizes username (strips HTML)', () => {
    // DOMPurify strips script tags, leaving empty string → fails min(1)
    expect(err(loginSchema, { username: '<script>alert(1)</script>', password: 'secret' })).toBe(
      'Username is required'
    );
  });

  it('does not sanitize password (preserves special characters)', () => {
    const data = ok(loginSchema, { username: 'alice', password: 'p@$$<w>ord' });
    expect(data.password).toBe('p@$$<w>ord');
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
    // eslint-disable-next-line no-unused-vars
    const { studentId: _sid, ...body } = validBody;
    expect(ok(registerSchema, body).studentId).toBeUndefined();
  });

  it('rejects missing username', () => {
    // eslint-disable-next-line no-unused-vars
    const { username: _u, ...body } = validBody;
    const result = parseBody(registerSchema, body);
    expect(typeof result.error).toBe('string');
  });

  it('rejects invalid email format', () => {
    const result = parseBody(registerSchema, { ...validBody, email: 'not-an-email' });
    expect(result.error).toBe('Invalid email format');
  });
});

// ── createUserSchema ─────────────────────────────────────────────────────────

describe('createUserSchema', () => {
  const validBody = {
    username: 'alice',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
  };

  it('accepts valid input with all required fields', () => {
    const data = ok(createUserSchema, validBody);
    expect(data.username).toBe('alice');
    expect(data.email).toBe('alice@example.com');
    expect(data.firstName).toBe('Alice');
    expect(data.lastName).toBe('Smith');
  });

  it('accepts optional role field', () => {
    const data = ok(createUserSchema, { ...validBody, role: 'assignment_manager' });
    expect(data.role).toBe('assignment_manager');
  });

  it('accepts optional groupId as valid UUID when assignmentId is provided', () => {
    const data = ok(createUserSchema, {
      ...validBody,
      assignmentId: '660e8400-e29b-41d4-a716-446655440000',
      groupId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(data.assignmentId).toBe('660e8400-e29b-41d4-a716-446655440000');
    expect(data.groupId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects groupId without assignmentId', () => {
    expect(
      err(createUserSchema, {
        ...validBody,
        groupId: '550e8400-e29b-41d4-a716-446655440000',
      })
    ).toBe('Select an assignment first');
  });

  it('rejects groupId when assignmentId is an empty string (coerced to null)', () => {
    expect(
      err(createUserSchema, {
        ...validBody,
        assignmentId: '',
        groupId: '550e8400-e29b-41d4-a716-446655440000',
      })
    ).toBe('Select an assignment first');
  });

  it('coerces empty string assignmentId to null', () => {
    const data = ok(createUserSchema, { ...validBody, assignmentId: '' });
    expect(data.assignmentId).toBeNull();
  });

  it('accepts assignmentId alone as a valid UUID', () => {
    const data = ok(createUserSchema, {
      ...validBody,
      assignmentId: '660e8400-e29b-41d4-a716-446655440000',
    });
    expect(data.assignmentId).toBe('660e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects invalid assignmentId (non-UUID)', () => {
    expect(err(createUserSchema, { ...validBody, assignmentId: 'not-a-uuid' })).toEqual(expect.any(String));
  });

  it('accepts subjectIds as an array of UUIDs', () => {
    const data = ok(createUserSchema, {
      ...validBody,
      subjectIds: ['550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000'],
    });
    expect(data.subjectIds).toHaveLength(2);
  });

  it('accepts an empty subjectIds array', () => {
    const data = ok(createUserSchema, { ...validBody, subjectIds: [] });
    expect(data.subjectIds).toEqual([]);
  });

  it('rejects subjectIds containing a non-UUID entry', () => {
    expect(err(createUserSchema, { ...validBody, subjectIds: ['not-a-uuid'] })).toBe('Invalid ID format');
  });

  it('accepts assignmentIds as an array of UUIDs', () => {
    const data = ok(createUserSchema, {
      ...validBody,
      assignmentIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(data.assignmentIds).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
  });

  it('rejects assignmentIds containing a non-UUID entry', () => {
    expect(err(createUserSchema, { ...validBody, assignmentIds: ['nope'] })).toBe('Invalid ID format');
  });

  it('accepts optional studentId', () => {
    const data = ok(createUserSchema, { ...validBody, studentId: 'STU-001' });
    expect(data.studentId).toBe('STU-001');
  });

  it('coerces empty string groupId to null', () => {
    const data = ok(createUserSchema, { ...validBody, groupId: '' });
    expect(data.groupId).toBeNull();
  });

  it('accepts sendSetupEmail as true', () => {
    const data = ok(createUserSchema, { ...validBody, sendSetupEmail: true });
    expect(data.sendSetupEmail).toBe(true);
  });

  it('accepts sendSetupEmail as false', () => {
    const data = ok(createUserSchema, { ...validBody, sendSetupEmail: false });
    expect(data.sendSetupEmail).toBe(false);
  });

  it('rejects missing username', () => {
    // eslint-disable-next-line no-unused-vars
    const { username: _u, ...body } = validBody;
    const result = parseBody(createUserSchema, body);
    expect(typeof result.error).toBe('string');
  });

  it('rejects missing email', () => {
    // eslint-disable-next-line no-unused-vars
    const { email: _e, ...body } = validBody;
    const result = parseBody(createUserSchema, body);
    expect(typeof result.error).toBe('string');
  });

  it('rejects missing firstName', () => {
    // eslint-disable-next-line no-unused-vars
    const { firstName: _f, ...body } = validBody;
    const result = parseBody(createUserSchema, body);
    expect(typeof result.error).toBe('string');
  });

  it('rejects missing lastName', () => {
    // eslint-disable-next-line no-unused-vars
    const { lastName: _l, ...body } = validBody;
    const result = parseBody(createUserSchema, body);
    expect(typeof result.error).toBe('string');
  });

  it('rejects invalid role value', () => {
    expect(err(createUserSchema, { ...validBody, role: 'superuser' })).toEqual(expect.any(String));
  });

  it('rejects invalid groupId (non-UUID)', () => {
    expect(err(createUserSchema, { ...validBody, groupId: 'not-a-uuid' })).toEqual(expect.any(String));
  });
});

// ── createGroupSchema / updateGroupSchema ─────────────────────────────────────

describe('createGroupSchema', () => {
  const validAssignmentId = '660e8400-e29b-41d4-a716-446655440000';

  it('accepts a valid group name with assignmentId', () => {
    const data = ok(createGroupSchema, { assignmentId: validAssignmentId, name: 'Alpha' });
    expect(data.name).toBe('Alpha');
    expect(data.assignmentId).toBe(validAssignmentId);
  });

  it('rejects empty name', () => {
    expect(err(createGroupSchema, { assignmentId: validAssignmentId, name: '' })).toBe('Group name is required');
  });

  it('rejects missing assignmentId', () => {
    expect(err(createGroupSchema, { name: 'Alpha' })).toEqual(expect.any(String));
  });

  it('rejects non-UUID assignmentId', () => {
    expect(err(createGroupSchema, { assignmentId: 'not-a-uuid', name: 'Alpha' })).toBe('Invalid assignment ID');
  });
});

// ── createSubjectSchema ───────────────────────────────────────────────────────

describe('createSubjectSchema', () => {
  it('accepts a valid subject name', () => {
    expect(ok(createSubjectSchema, { name: 'COMP90041' }).name).toBe('COMP90041');
  });

  it('sanitizes HTML from the name', () => {
    expect(ok(createSubjectSchema, { name: '<b>Maths</b>' }).name).toBe('Maths');
  });

  it('rejects empty name', () => {
    expect(err(createSubjectSchema, { name: '' })).toBe('Subject name is required');
  });

  it('rejects a name longer than 100 characters', () => {
    expect(err(createSubjectSchema, { name: 'a'.repeat(101) })).toBe('Subject name must be at most 100 characters');
  });

  it('rejects missing name', () => {
    expect(err(createSubjectSchema, {})).toEqual(expect.any(String));
  });
});

// ── createAssignmentSchema ────────────────────────────────────────────────────

describe('createAssignmentSchema', () => {
  const validSubjectId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts a valid subjectId and name', () => {
    const data = ok(createAssignmentSchema, { subjectId: validSubjectId, name: 'Assignment 1' });
    expect(data.subjectId).toBe(validSubjectId);
    expect(data.name).toBe('Assignment 1');
  });

  it('rejects empty name', () => {
    expect(err(createAssignmentSchema, { subjectId: validSubjectId, name: '' })).toBe('Assignment name is required');
  });

  it('rejects a name longer than 100 characters', () => {
    expect(err(createAssignmentSchema, { subjectId: validSubjectId, name: 'a'.repeat(101) })).toBe(
      'Assignment name must be at most 100 characters'
    );
  });

  it('rejects non-UUID subjectId', () => {
    expect(err(createAssignmentSchema, { subjectId: 'not-a-uuid', name: 'Assignment 1' })).toBe('Invalid subject ID');
  });

  it('rejects missing subjectId', () => {
    expect(err(createAssignmentSchema, { name: 'Assignment 1' })).toEqual(expect.any(String));
  });
});

describe('updateGroupSchema', () => {
  it('accepts empty body (name is optional)', () => {
    expect(ok(updateGroupSchema, {})).toBeDefined();
  });

  it('accepts partial update with name', () => {
    expect(ok(updateGroupSchema, { name: 'Beta' }).name).toBe('Beta');
  });

  it('rejects empty string for name when provided', () => {
    expect(err(updateGroupSchema, { name: '' })).toBe('Group name is required');
  });
});

// ── updateUserSchema ──────────────────────────────────────────────────────────

describe('updateUserSchema', () => {
  it('accepts empty body (all fields optional)', () => {
    expect(ok(updateUserSchema, {})).toBeDefined();
  });

  it('accepts valid role values', () => {
    expect(ok(updateUserSchema, { role: 'admin' }).role).toBe('admin');
    expect(ok(updateUserSchema, { role: 'assignment_manager' }).role).toBe('assignment_manager');
    expect(ok(updateUserSchema, { role: 'user' }).role).toBe('user');
  });

  it('rejects invalid role value', () => {
    expect(err(updateUserSchema, { role: 'superuser' })).toEqual(expect.any(String));
  });

  it('accepts update without role (role is optional)', () => {
    const result = ok(updateUserSchema, { email: 'new@example.com' });
    expect(result.email).toBe('new@example.com');
    expect(result.role).toBeUndefined();
  });
});

// ── changePasswordSchema ──────────────────────────────────────────────────────

describe('changePasswordSchema', () => {
  it('accepts valid password change', () => {
    const data = ok(changePasswordSchema, { newPassword: 'newpass123' });
    expect(data.newPassword).toBe('newpass123');
  });

  it('rejects short newPassword', () => {
    expect(err(changePasswordSchema, { newPassword: 'short' })).toBe('New password must be at least 6 characters');
  });
});

// ── forgotPasswordSchema ──────────────────────────────────────────────────────

describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    expect(ok(forgotPasswordSchema, { email: 'user@example.com' }).email).toBe('user@example.com');
  });

  it('rejects invalid email format', () => {
    expect(err(forgotPasswordSchema, { email: 'notanemail' })).toBe('Invalid email format');
  });
});

// ── setPasswordSchema ─────────────────────────────────────────────────────────

describe('setPasswordSchema', () => {
  it('accepts valid token and password', () => {
    const data = ok(setPasswordSchema, { password: 'newpass1' });
    expect(data.password).toBe('newpass1');
  });

  it('rejects short password', () => {
    expect(err(setPasswordSchema, { password: 'short' })).toBe('Password must be at least 6 characters');
  });
});
