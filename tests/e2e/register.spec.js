'use strict';

const { test, expect } = require('@playwright/test');
const { cleanDatabase, createUser, createPasswordResetToken } = require('../helpers/db');
const { loginAs } = require('../helpers/auth');

/**
 * Navigate to the register page via the Login page's "Register here" link.
 * Direct navigation to /register hits the catch-all redirect before the
 * registrationEnabled config fetch completes, so we use the link instead.
 */
async function goToRegister(page) {
  await page.goto('/login');
  const registerLink = page.getByRole('link', { name: /register here/i });
  await expect(registerLink).toBeVisible({ timeout: 10000 });
  await registerLink.click();
  await expect(page).toHaveURL(/\/register/);
}

test.describe('Self-Registration', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('register page is accessible and shows the form', async ({ page }) => {
    await goToRegister(page);
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Choose a username')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your first name')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your last name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('successful registration shows success message and redirects to login', async ({ page }) => {
    await goToRegister(page);
    await page.getByPlaceholder('Choose a username').fill('newuser');
    await page.getByPlaceholder('Enter your email').fill('newuser@test.com');
    await page.getByPlaceholder('Enter your first name').fill('New');
    await page.getByPlaceholder('Enter your last name').fill('User');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/registration successful/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('full registration flow: register → set password → login', async ({ page }) => {
    await goToRegister(page);
    await page.getByPlaceholder('Choose a username').fill('fullflowuser');
    await page.getByPlaceholder('Enter your email').fill('fullflow@test.com');
    await page.getByPlaceholder('Enter your first name').fill('Full');
    await page.getByPlaceholder('Enter your last name').fill('Flow');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/registration successful/i)).toBeVisible({ timeout: 10000 });

    // Create a setup token (simulates the emailed link)
    const token = await createPasswordResetToken('fullflow@test.com', { tokenType: 'setup' });

    // Set password
    await page.goto(`/set-password?token=${token}`);
    await page.getByPlaceholder('At least 6 characters').fill('SecurePass123!');
    await page.getByPlaceholder('Repeat your password').fill('SecurePass123!');
    await page.getByRole('button', { name: 'Set Password' }).click();
    await expect(page.getByText(/password set successfully/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    // Login with the new credentials
    await loginAs(page, 'fullflowuser', 'SecurePass123!');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('rejects registration with duplicate username', async ({ page }) => {
    await createUser({ username: 'taken', email: 'taken@test.com' });
    await goToRegister(page);
    await page.getByPlaceholder('Choose a username').fill('taken');
    await page.getByPlaceholder('Enter your email').fill('different@test.com');
    await page.getByPlaceholder('Enter your first name').fill('Dup');
    await page.getByPlaceholder('Enter your last name').fill('User');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 10000 });
  });

  test('rejects registration with duplicate email', async ({ page }) => {
    await createUser({ username: 'original', email: 'shared@test.com' });
    await goToRegister(page);
    await page.getByPlaceholder('Choose a username').fill('newname');
    await page.getByPlaceholder('Enter your email').fill('shared@test.com');
    await page.getByPlaceholder('Enter your first name').fill('Dup');
    await page.getByPlaceholder('Enter your last name').fill('Email');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 10000 });
  });

  test('"Already have an account?" link navigates to login', async ({ page }) => {
    await goToRegister(page);
    await page.getByRole('link', { name: 'Already have an account? Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
