'use strict';

const { test, expect } = require('@playwright/test');
const { cleanDatabase, createUser } = require('../helpers/db');
const { loginAsAdmin, loginAs, logout, enableGroupJoinLock } = require('../helpers/auth');

test.describe('Settings — Group Join Lock', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('admin can navigate to settings from dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    // exact: true avoids matching the h3 "Group Settings" which also contains "Settings"
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  });

  test('settings page shows Group Settings with lock toggle', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await expect(page.getByText('Group Settings')).toBeVisible();
    await expect(page.getByText('Lock group joining')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable group join lock' })).toBeVisible();
  });

  test('admin can enable the group join lock', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Enable group join lock' }).click();
    await expect(page.getByText('Settings updated successfully')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Disable group join lock' })).toBeVisible();
  });

  test('admin can disable the group join lock after enabling it', async ({ page }) => {
    await enableGroupJoinLock(page);
    await page.getByRole('button', { name: 'Disable group join lock' }).click();
    await expect(page.getByText('Settings updated successfully')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Enable group join lock' })).toBeVisible();
  });

  test('when group join lock is enabled, user dashboard shows locked message', async ({ page }) => {
    await enableGroupJoinLock(page);
    await createUser({ username: 'locktest', email: 'locktest@test.com' });
    // PublicRoute redirects authenticated users from /login, so logout first
    await logout(page);
    await loginAs(page, 'locktest', 'TestPass123!');
    await expect(page.getByText('Group joining is locked')).toBeVisible({ timeout: 10000 });
  });
});
