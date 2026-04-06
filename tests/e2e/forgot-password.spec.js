'use strict';

const { test, expect } = require('@playwright/test');
const { cleanDatabase, createUser, createPasswordResetToken } = require('../helpers/db');

test.describe('Forgot Password', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('shows the reset password form', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByText('Reset your password')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();
  });

  test('shows success message after submitting a valid email', async ({ page }) => {
    await createUser({ username: 'resetuser', email: 'resetuser@test.com' });
    await page.goto('/forgot-password');
    await page.getByPlaceholder('Enter your email address').fill('resetuser@test.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(
      page.getByText(/reset link has been sent|if that email is registered/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows success message even for unknown email (avoids email enumeration)', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByPlaceholder('Enter your email address').fill('nobody@nowhere.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(
      page.getByText(/reset link has been sent|if that email is registered/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('back to login link navigates to /login', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('link', { name: 'Back to login' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Set Password', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('shows Invalid Link when no token is provided', async ({ page }) => {
    await page.goto('/set-password');
    await expect(page.getByText('Invalid Link')).toBeVisible();
    await expect(page.getByText('This link is invalid or has already been used.')).toBeVisible();
  });

  test('shows the set password form when a valid token is in the URL', async ({ page }) => {
    const user = await createUser({ username: 'tokenuser', email: 'tokenuser@test.com' });
    const token = await createPasswordResetToken(user.email);
    await page.goto(`/set-password?token=${token}`);
    await expect(page.getByText('Set your password')).toBeVisible();
    await expect(page.getByPlaceholder('At least 6 characters')).toBeVisible();
    await expect(page.getByPlaceholder('Repeat your password')).toBeVisible();
  });

  test('sets password successfully and redirects to login', async ({ page }) => {
    const user = await createUser({ username: 'tokenuser2', email: 'tokenuser2@test.com' });
    const token = await createPasswordResetToken(user.email);
    await page.goto(`/set-password?token=${token}`);
    await page.getByPlaceholder('At least 6 characters').fill('NewPass123!');
    await page.getByPlaceholder('Repeat your password').fill('NewPass123!');
    await page.getByRole('button', { name: 'Set Password' }).click();
    await expect(
      page.getByText(/password set successfully|you can now log in/i)
    ).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('shows error when passwords do not match', async ({ page }) => {
    const user = await createUser({ username: 'tokenuser3', email: 'tokenuser3@test.com' });
    const token = await createPasswordResetToken(user.email);
    await page.goto(`/set-password?token=${token}`);
    await page.getByPlaceholder('At least 6 characters').fill('NewPass123!');
    await page.getByPlaceholder('Repeat your password').fill('Different456!');
    await page.getByRole('button', { name: 'Set Password' }).click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
  });

  test('shows error for invalid token', async ({ page }) => {
    await page.goto('/set-password?token=invalid-token-that-does-not-exist');
    await page.getByPlaceholder('At least 6 characters').fill('NewPass123!');
    await page.getByPlaceholder('Repeat your password').fill('NewPass123!');
    await page.getByRole('button', { name: 'Set Password' }).click();
    await expect(page.getByText(/invalid or expired token|failed to set password/i)).toBeVisible({ timeout: 10000 });
  });
});
