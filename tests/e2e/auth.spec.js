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
  });
});
