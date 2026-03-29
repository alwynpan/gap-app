'use strict';

// Zod schemas for request body validation.
// Each string field schema sanitizes via DOMPurify transform before validation.
// Mirrors frontend/src/utils/schemas.js (ESM version).
const { z } = require('zod');
const { sanitize } = require('./sanitize');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate that a string is a well-formed UUID (v4 format).
 */
function validateUUID(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Parse and validate a request body against a Zod schema.
 * Returns { data, error } where error is the first error message string or null.
 */
function parseBody(schema, body) {
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

const usernameSchema = sanitizedString.pipe(
  z
    .string()
    .min(1, 'Username is required')
    .max(100, 'Username must be at most 100 characters')
    .regex(USERNAME_RE, 'Username may only contain letters, numbers, underscores, hyphens, and dots')
);

const emailSchema = sanitizedString.pipe(
  z
    .string()
    .min(1, 'Email is required')
    .max(255, 'Email must be at most 255 characters')
    .regex(EMAIL_RE, 'Invalid email format')
);

// Password is never sanitized (would corrupt special characters users intentionally type)
const passwordSchema = z
  .string({ required_error: 'Password is required', invalid_type_error: 'Password is required' })
  .min(1, 'Password is required')
  .min(6, 'Password must be at least 6 characters')
  .max(255, 'Password must be at most 255 characters');

const newPasswordSchema = z
  .string({ required_error: 'New password is required', invalid_type_error: 'New password is required' })
  .min(1, 'New password is required')
  .min(6, 'New password must be at least 6 characters')
  .max(255, 'New password must be at most 255 characters');

/** Factory — returns a name schema using the given label in error messages. */
function nameSchema(label) {
  return sanitizedString.pipe(
    z.string().min(1, `${label} is required`).max(100, `${label} must be at most 100 characters`)
  );
}

// studentId is optional; empty string, null, and undefined all treated as absent
const studentIdSchema = z
  .union([z.literal(''), sanitizedString.pipe(z.string().max(50, 'Student ID must be at most 50 characters'))])
  .optional()
  .nullable()
  .transform((v) => v || undefined);

const groupNameSchema = sanitizedString.pipe(
  z.string().min(1, 'Group name is required').max(100, 'Group name must be at most 100 characters')
);

// ── Endpoint schemas ─────────────────────────────────────────────────────────

const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  studentId: studentIdSchema,
});

const loginSchema = z.object({
  username: sanitizedString.pipe(z.string().min(1, 'Username is required')),
  password: z.string().min(1, 'Password is required'),
});

const createUserSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  studentId: studentIdSchema,
  role: z.enum(['admin', 'assignment_manager', 'user']).optional(),
  groupId: z.string().uuid().optional().nullable(),
  sendSetupEmail: z.boolean().optional(),
});

const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: nameSchema('First name').optional().nullable(),
  lastName: nameSchema('Last name').optional().nullable(),
  studentId: studentIdSchema,
  role: z.enum(['admin', 'assignment_manager', 'user']).optional(),
  enabled: z.boolean().optional(),
  username: usernameSchema.optional(),
  groupId: z.string().uuid().optional().nullable(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: newPasswordSchema,
});

const importUserRowSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  firstName: nameSchema('First name'),
  lastName: nameSchema('Last name'),
  studentId: studentIdSchema,
});

const importGroupMappingRowSchema = z.object({
  email: emailSchema,
  groupName: groupNameSchema,
});

const createGroupSchema = z.object({
  name: groupNameSchema,
  enabled: z.boolean().optional(),
  maxMembers: z.number().int().positive().optional().nullable(),
});

const updateGroupSchema = z.object({
  name: groupNameSchema.optional(),
  enabled: z.boolean().optional(),
  maxMembers: z.number().int().positive().optional().nullable(),
});

const updateConfigSchema = z.object({
  value: z
    .string({ required_error: 'Value is required', invalid_type_error: 'Value must be a string' })
    .min(1, 'Value is required'),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const setPasswordSchema = z.object({
  token: sanitizedString.pipe(z.string().min(1, 'Token is required')),
  password: passwordSchema,
});

module.exports = {
  sanitize,
  parseBody,
  validateUUID,
  updateConfigSchema,
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
  importGroupMappingRowSchema,
  createGroupSchema,
  updateGroupSchema,
  forgotPasswordSchema,
  setPasswordSchema,
};
