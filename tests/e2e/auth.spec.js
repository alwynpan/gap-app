'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, loginAsAdmin, logout, ADMIN_PASSWORD } = require('../helpers/auth');
const { cleanDatabase, createUser } = require('../helpers/db');

test.describe('Authentication', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test.describe('Login', () => {
    test('redirects to dashboard on valid admin credentials', async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', 'admin');
      await page.fill('#password', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByText('Dashboard')).toBeVisible();
    });

    test('redirects to dashboard on valid user credentials', async ({ page }) => {
      await createUser({ username: 'testlogin', email: 'testlogin@test.com' });
      await loginAs(page, 'testlogin');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('shows error on wrong password', async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', 'admin');
      await page.fill('#password', 'wrongpassword');
      await page.click('button[type="submit"]');
      await expect(page.locator('.bg-red-50')).toBeVisible();
    });

    test('shows error on non-existent user', async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', 'nosuchuser');
      await page.fill('#password', 'somepassword');
      await page.click('button[type="submit"]');
      await expect(page.locator('.bg-red-50')).toBeVisible();
    });

    test('stays on login page after failed attempt', async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', 'admin');
      await page.fill('#password', 'wrong');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Logout', () => {
    test('redirects to login page after logout', async ({ page }) => {
      await loginAsAdmin(page);
      await expect(page).toHaveURL(/\/dashboard/);

      await logout(page);
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Disabled account', () => {
    test('disabled user cannot log in', async ({ page }) => {
      await createUser({ username: 'disableduser', email: 'disabled@test.com', enabled: false });
      await page.goto('/login');
      await page.fill('#username', 'disableduser');
      await page.fill('#password', 'TestPass123!');
      await page.click('button[type="submit"]');
      await expect(page.locator('.bg-red-50')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Pending account', () => {
    test('pending (un-activated) user cannot log in and sees the setup-pending banner', async ({ page }) => {
      // Self-registration creates the user with status='pending' (password not yet set).
      // The pending guard fires before password verification, so any password is rejected.
      // Reach /register via the login link — the /register route only mounts once the
      // auth context has loaded registrationEnabled, so a direct goto can race the redirect.
      await page.goto('/login');
      await page.getByRole('link', { name: /register here/i }).click();
      await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
      await page.getByPlaceholder('Choose a username').fill('pendinguser');
      await page.getByPlaceholder('Enter your email').fill('pending@test.com');
      await page.getByPlaceholder('Enter your first name').fill('Pending');
      await page.getByPlaceholder('Enter your last name').fill('User');
      await page.getByRole('button', { name: /create account/i }).click();
      await expect(page.getByText(/registration successful/i)).toBeVisible({ timeout: 10000 });

      // Attempt to log in as the pending user with any password.
      await page.goto('/login');
      await page.fill('#username', 'pendinguser');
      await page.fill('#password', 'AnyPassword123!');
      await page.click('button[type="submit"]');

      // The pending-specific banner is shown rather than a generic invalid-credentials error.
      await expect(
        page.getByText('Account setup pending. Please check your email to set your password.')
      ).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Unauthenticated access', () => {
    test('redirects /dashboard to /login', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/);
    });

    test('redirects /users to /login', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/login/);
    });

    test('redirects /groups to /login', async ({ page }) => {
      await page.goto('/groups');
      await expect(page).toHaveURL(/\/login/);
    });

    test('redirects /settings to /login', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/login/);
    });

    test('redirects /users/import to /login', async ({ page }) => {
      await page.goto('/users/import');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
