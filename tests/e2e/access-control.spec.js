'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, loginAsAdmin } = require('../helpers/auth');
const { cleanDatabase, createUser } = require('../helpers/db');

test.describe('Access control', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test.describe('Regular user', () => {
    test.beforeEach(async ({ page }) => {
      await createUser({ username: 'regularuser', email: 'regular@test.com', role: 'user' });
      await loginAs(page, 'regularuser');
    });

    test('cannot access /users — redirected to dashboard', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('cannot access /groups — redirected to dashboard', async ({ page }) => {
      await page.goto('/groups');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('cannot access /settings — redirected to dashboard', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe('Assignment manager', () => {
    test.beforeEach(async ({ page }) => {
      await createUser({ username: 'amuser', email: 'am@test.com', role: 'assignment_manager' });
      await loginAs(page, 'amuser');
    });

    test('can access /users', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/users/);
    });

    test('cannot access /groups — redirected to dashboard', async ({ page }) => {
      await page.goto('/groups');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('can access /groups/import — child route is AM-accessible even though /groups is admin-only', async ({
      page,
    }) => {
      await page.goto('/groups/import');
      await expect(page).toHaveURL(/\/groups\/import/);
    });

    test('can access /users/import', async ({ page }) => {
      await page.goto('/users/import');
      await expect(page).toHaveURL(/\/users\/import/);
    });

    test('can access /settings', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/settings/);
    });
  });

  test.describe('Admin', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('can access /users', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/users/);
    });

    test('can access /groups', async ({ page }) => {
      await page.goto('/groups');
      await expect(page).toHaveURL(/\/groups/);
    });
  });
});
