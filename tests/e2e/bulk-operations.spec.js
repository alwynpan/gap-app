'use strict';

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('../helpers/auth');
const { cleanDatabase, createUser, createGroup } = require('../helpers/db');

test.describe('Bulk Operations — Users', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('admin can bulk delete multiple users', async ({ page }) => {
    await createUser({ username: 'bulkdelete1', email: 'bulkdelete1@test.com' });
    await createUser({ username: 'bulkdelete2', email: 'bulkdelete2@test.com' });
    await loginAsAdmin(page);
    await page.goto('/users');

    await page.locator('input[aria-label="Select bulkdelete1"]').check();
    await page.locator('input[aria-label="Select bulkdelete2"]').check();

    await page.getByRole('button', { name: 'Delete (2)' }).click();
    await expect(page.getByRole('heading', { name: 'Delete 2 users?' })).toBeVisible();
    await page.getByRole('button', { name: /Delete \d+ user/i }).click();

    await expect(page.getByText('bulkdelete1', { exact: true })).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('bulkdelete2', { exact: true })).not.toBeVisible();
  });

  test('Delete button only appears when users are selected', async ({ page }) => {
    await createUser({ username: 'selecttest', email: 'selecttest@test.com' });
    await loginAsAdmin(page);
    await page.goto('/users');

    // No selection yet — Delete button must not exist in the toolbar
    await expect(page.getByRole('button', { name: /^Delete \(\d+\)$/ })).not.toBeVisible();

    await page.locator('input[aria-label="Select selecttest"]').check();
    await expect(page.getByRole('button', { name: 'Delete (1)' })).toBeVisible();
  });

  test('admin can send setup emails to pending users', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users');

    // Create a pending user via the admin UI (leave "Send 'Set Password' email now" unchecked)
    await page.getByRole('button', { name: /create user/i }).click();
    await page.getByPlaceholder('Enter username').fill('pendinguser1');
    await page.getByPlaceholder('Enter email').fill('pendinguser1@test.com');
    await page.getByPlaceholder('Enter first name').fill('Pending');
    await page.getByPlaceholder('Enter last name').fill('User');

    // Ensure the checkbox is unchecked so the user is created as pending
    const sendEmailCheckbox = page.locator('#sendSetupEmail');
    if (await sendEmailCheckbox.isChecked()) {
      await sendEmailCheckbox.uncheck();
    }

    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('User created successfully')).toBeVisible({ timeout: 5000 });

    // The "Send Setup Emails (1)" button should appear in the toolbar
    await expect(page.getByRole('button', { name: /Send Setup Emails? \(1\)/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Send Setup Emails? \(1\)/i }).click();

    // Confirm in modal
    await expect(page.getByRole('heading', { name: /Send setup emails?/i })).toBeVisible();
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText(/Setup email sent to 1 user/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Bulk Operations — Groups', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('admin can bulk delete multiple groups', async ({ page }) => {
    await createGroup({ name: 'BulkDeleteGroup1' });
    await createGroup({ name: 'BulkDeleteGroup2' });
    await loginAsAdmin(page);
    await page.goto('/groups');

    await page.locator('input[aria-label="Select BulkDeleteGroup1"]').check();
    await page.locator('input[aria-label="Select BulkDeleteGroup2"]').check();

    await page.getByRole('button', { name: 'Delete (2)' }).click();
    await expect(page.getByRole('heading', { name: 'Delete 2 groups?' })).toBeVisible();
    await page.getByRole('button', { name: /Delete \d+ group/i }).click();

    await expect(page.getByText('BulkDeleteGroup1', { exact: true })).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('BulkDeleteGroup2', { exact: true })).not.toBeVisible();
  });
});
