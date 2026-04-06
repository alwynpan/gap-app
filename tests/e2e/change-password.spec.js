'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, logout, DEFAULT_PASSWORD } = require('../helpers/auth');
const { cleanDatabase, createUser } = require('../helpers/db');

test.describe('Change Password', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  async function openChangePasswordModal(page) {
    await page.locator('button[aria-haspopup="true"]').click();
    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();
  }

  test('user can change their password successfully', async ({ page }) => {
    const newPassword = 'NewPass456!';
    await createUser({ username: 'pwchangeuser', email: 'pwchangeuser@test.com' });
    await loginAs(page, 'pwchangeuser');

    await openChangePasswordModal(page);
    await page.getByPlaceholder('Enter current password').fill(DEFAULT_PASSWORD);
    await page.getByPlaceholder('Enter new password').fill(newPassword);
    await page.getByPlaceholder('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Change Password' }).click();

    await expect(page.locator('.bg-green-50')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Password changed successfully')).toBeVisible();

    // Modal auto-closes after success; verify the new password works by logging in again
    await logout(page);
    await loginAs(page, 'pwchangeuser', newPassword);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('shows error for wrong current password', async ({ page }) => {
    await createUser({ username: 'wrongpwuser', email: 'wrongpwuser@test.com' });
    await loginAs(page, 'wrongpwuser');

    await openChangePasswordModal(page);
    await page.getByPlaceholder('Enter current password').fill('WrongPassword1!');
    await page.getByPlaceholder('Enter new password').fill('NewPass456!');
    await page.getByPlaceholder('Confirm new password').fill('NewPass456!');
    await page.getByRole('button', { name: 'Change Password' }).click();

    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Current password is incorrect')).toBeVisible();
  });

  test('shows error when new passwords do not match', async ({ page }) => {
    await createUser({ username: 'mismatchpwuser', email: 'mismatchpwuser@test.com' });
    await loginAs(page, 'mismatchpwuser');

    await openChangePasswordModal(page);
    await page.getByPlaceholder('Enter current password').fill(DEFAULT_PASSWORD);
    await page.getByPlaceholder('Enter new password').fill('NewPass456!');
    await page.getByPlaceholder('Confirm new password').fill('DifferentPass789!');
    await page.getByRole('button', { name: 'Change Password' }).click();

    // Client-side check fires before any API call
    await expect(page.locator('.bg-red-50')).toBeVisible();
    await expect(page.getByText('New passwords do not match')).toBeVisible();
  });
});
