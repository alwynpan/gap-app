// Zod schemas for form validation.
// Each string field schema sanitizes via DOMPurify transform before validation.
// Mirrors backend/src/utils/schemas.js (CJS version).
import { z } from 'zod';
import { sanitize } from './sanitize.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse and validate form data against a Zod schema.
 * Returns { data, error } where error is the first error message string or null.
 */
export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) {
    return { data: result.data, error: null };
  }
  const firstError = result.error.issues[0]?.message || 'Validation failed';
  return { data: null, error: firstError };
}

// ── Sanitized string base ────────────────────────────────────────────────────

/** A string that is DOMPurify-sanitized before further validation. */
const sanitizedString = z.string({ invalid_type_error: 'Expected a string' }).transform(sanitize);

// ── Field-level schemas ──────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const usernameSchema = sanitizedString.pipe(
  z
    .string()
    .min(1, 'Username is required')
    .max(100, 'Username must be at most 100 characters')
    .regex(USERNAME_RE, 'Username may only contain letters, numbers, underscores, hyphens, and dots')
);

export const emailSchema = sanitizedString.pipe(
  z
    .string()
    .min(1, 'Email is required')
    .max(255, 'Email must be at most 255 characters')
    .regex(EMAIL_RE, 'Invalid email format')
);

// Password is never sanitized (would corrupt special characters users intentionally type)
export const passwordSchema = z
  .string({ required_error: 'Password is required', invalid_type_error: 'Password is required' })
  .min(1, 'Password is required')
  .min(6, 'Password must be at least 6 characters')
  .max(255, 'Password must be at most 255 characters');

export const newPasswordSchema = z
  .string({
    required_error: 'New password is required',
    invalid_type_error: 'New password is required',
  })
  .min(1, 'New password is required')
  .min(6, 'New password must be at least 6 characters')
  .max(255, 'New password must be at most 255 characters');

/** Factory — returns a name schema using the given label in error messages. */
export function nameSchema(label) {
  return sanitizedString.pipe(
    z.string().min(1, `${label} is required`).max(100, `${label} must be at most 100 characters`)
  );
}

// studentId is optional; empty string, null, and undefined all treated as absent
export const studentIdSchema = z
  .union([z.literal(''), sanitizedString.pipe(z.string().max(50, 'Student ID must be at most 50 characters'))])
  .optional()
  .nullable()
  .transform((v) => v || undefined);

export const groupNameSchema = sanitizedString.pipe(
  z.string().min(1, 'Group name is required').max(100, 'Group name must be at most 100 characters')
);

// ── Endpoint schemas ─────────────────────────────────────────────────────────

export const loginSchema = z.object({
  username: sanitizedString.pipe(z.string().min(1, 'Username is required')),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  studentId: studentIdSchema,
});

export const createUserSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  studentId: studentIdSchema,
  role: z.string().optional(),
  groupId: z.string().optional().nullable(),
});

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: nameSchema('First name').optional().nullable(),
  lastName: nameSchema('Last name').optional().nullable(),
  studentId: studentIdSchema,
  enabled: z.boolean().optional(),
  role: z.enum(['admin', 'assignment_manager', 'user']).optional(),
});

export const changePasswordSchema = z.object({
  newPassword: newPasswordSchema,
});

export const createGroupSchema = z.object({
  name: groupNameSchema,
});

export const updateGroupSchema = z.object({
  name: groupNameSchema.optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const setPasswordSchema = z.object({
  password: passwordSchema,
});
