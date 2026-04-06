'use strict';

const { test, expect } = require('@playwright/test');
const { cleanDatabase, createUser } = require('../helpers/db');
const { loginAsAdmin } = require('../helpers/auth');

test.describe('Users — Enable/Disable via Edit Modal', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('admin can disable a user via the edit modal', async ({ page }) => {
    await createUser({ username: 'disabletest', email: 'disabletest@test.com', enabled: true });
    await loginAsAdmin(page);
    await page.goto('/users');

    const row = page.locator('table tbody tr').filter({ hasText: 'disabletest' });
    await row.locator('button[aria-label="Edit User Profile"]').click();
    // Use heading role to avoid strict mode with tooltip spans containing "Edit User"
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    const enabledCheckbox = page.locator('input[aria-label="Enabled"]');
    await enabledCheckbox.uncheck();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User updated successfully')).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('Inactive')).toBeVisible();
  });

  test('admin can re-enable a disabled user', async ({ page }) => {
    await createUser({ username: 'reenabletest', email: 'reenabletest@test.com', enabled: false });
    await loginAsAdmin(page);
    await page.goto('/users');

    const row = page.locator('table tbody tr').filter({ hasText: 'reenabletest' });
    await row.locator('button[aria-label="Edit User Profile"]').click();
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    const enabledCheckbox = page.locator('input[aria-label="Enabled"]');
    await enabledCheckbox.check();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User updated successfully')).toBeVisible({ timeout: 5000 });

    await expect(row.getByText('Active')).toBeVisible();
  });

  test('admin can edit user first and last name', async ({ page }) => {
    await createUser({ username: 'editdetails', email: 'editdetails@test.com', firstName: 'Old', lastName: 'Name' });
    await loginAsAdmin(page);
    await page.goto('/users');

    const row = page.locator('table tbody tr').filter({ hasText: 'editdetails' });
    await row.locator('button[aria-label="Edit User Profile"]').click();
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    const firstNameInput = page.getByPlaceholder('First name');
    await firstNameInput.clear();
    await firstNameInput.fill('New');

    const lastNameInput = page.getByPlaceholder('Last name');
    await lastNameInput.clear();
    await lastNameInput.fill('Updated');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User updated successfully')).toBeVisible({ timeout: 5000 });

    // Name column should reflect the change
    await expect(row.getByText('New Updated')).toBeVisible();
  });
});

test.describe('Delete User — constraints', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('deleting a user removes them from the list', async ({ page }) => {
    await createUser({ username: 'todelete', email: 'todelete@test.com' });
    await loginAsAdmin(page);
    await page.goto('/users');

    const row = page.locator('table tbody tr').filter({ hasText: 'todelete' });
    await row.locator('button[aria-label="Delete User"]').click();
    await page.getByRole('button', { name: /Delete \d+ user/i }).click();

    await expect(page.locator('table tbody tr').filter({ hasText: 'todelete' })).not.toBeVisible();
  });

  test('admin row does not have a delete button', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users');

    const adminRow = page.locator('table tbody tr').filter({ hasText: 'admin' });
    await expect(adminRow.locator('button[aria-label="Delete User"]')).not.toBeVisible();
  });
});
