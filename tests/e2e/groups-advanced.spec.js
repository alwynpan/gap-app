'use strict';

const { test, expect } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { cleanDatabase, createGroup, createUser, assignUserToGroup } = require('../helpers/db');
const { loginAsAdmin } = require('../helpers/auth');

test.describe('Groups — Advanced Admin Features', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  // ── Bulk Create ────────────────────────────────────────────────────────────

  test('bulk create groups with prefix and count', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Bulk Create' }).click();
    await expect(page.getByText('Bulk Create Groups')).toBeVisible();

    await page.getByPlaceholder('e.g. Team').fill('BulkGroup');
    await page.getByPlaceholder('e.g. 10').fill('3');

    // For n < 10, padding is 1 digit → names are BulkGroup1, BulkGroup2, BulkGroup3
    // Wait for "Create 3 Groups" button to become enabled (preview computed)
    await expect(page.getByRole('button', { name: 'Create 3 Groups' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create 3 Groups' }).click();
    await expect(page.getByText('Created 3 groups')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('BulkGroup1')).toBeVisible();
    await expect(page.getByText('BulkGroup2')).toBeVisible();
    await expect(page.getByText('BulkGroup3')).toBeVisible();
  });

  test('bulk create with member limit sets max_members on all groups', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Bulk Create' }).click();
    await page.getByPlaceholder('e.g. Team').fill('LimitedGroup');
    await page.getByPlaceholder('e.g. 10').fill('2');
    await page.getByPlaceholder('Unlimited').fill('5');
    // For n < 10, padding is 1 digit → LimitedGroup1, LimitedGroup2
    await expect(page.getByRole('button', { name: 'Create 2 Groups' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create 2 Groups' }).click();
    await expect(page.getByText('Created 2 groups')).toBeVisible({ timeout: 10000 });
    const row = page.locator('table tbody tr').filter({ hasText: 'LimitedGroup1' });
    await expect(row.getByText('0 / 5')).toBeVisible();
  });

  // ── Enable / Disable toggle ────────────────────────────────────────────────

  test('admin can disable an enabled group', async ({ page }) => {
    await createGroup({ name: 'ActiveGroup', enabled: true });
    await loginAsAdmin(page);
    await page.goto('/groups');
    const row = page.locator('table tbody tr').filter({ hasText: 'ActiveGroup' });
    await row.locator('button[aria-label="Disable Group"]').click();
    await expect(page.getByText('Group disabled successfully')).toBeVisible({ timeout: 5000 });
    await expect(row.locator('button[aria-label="Enable Group"]')).toBeVisible();
  });

  test('admin can re-enable a disabled group', async ({ page }) => {
    await createGroup({ name: 'DisabledGroup', enabled: false });
    await loginAsAdmin(page);
    await page.goto('/groups');
    const row = page.locator('table tbody tr').filter({ hasText: 'DisabledGroup' });
    await row.locator('button[aria-label="Enable Group"]').click();
    await expect(page.getByText('Group enabled successfully')).toBeVisible({ timeout: 5000 });
    await expect(row.locator('button[aria-label="Disable Group"]')).toBeVisible();
  });

  // ── Set Member Limit ───────────────────────────────────────────────────────

  test('admin can set a member limit on a group', async ({ page }) => {
    await createGroup({ name: 'LimitGroup' });
    await loginAsAdmin(page);
    await page.goto('/groups');
    const row = page.locator('table tbody tr').filter({ hasText: 'LimitGroup' });
    await row.locator('button[aria-label="Set Member Limit"]').click();
    // Use heading role to avoid strict mode violation with tooltip spans
    await expect(page.getByRole('heading', { name: 'Set Member Limit' })).toBeVisible();
    await page.getByPlaceholder('Unlimited').fill('10');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Group limit updated')).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('0 / 10')).toBeVisible();
  });

  test('admin can remove a member limit (set to unlimited)', async ({ page }) => {
    await createGroup({ name: 'LimitedGroup2', maxMembers: 5 });
    await loginAsAdmin(page);
    await page.goto('/groups');
    const row = page.locator('table tbody tr').filter({ hasText: 'LimitedGroup2' });
    await row.locator('button[aria-label="Set Member Limit"]').click();
    await page.getByPlaceholder('Unlimited').clear();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Group limit updated')).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('0 / ∞')).toBeVisible();
  });

  // ── Export Mappings ────────────────────────────────────────────────────────

  test('export mappings button triggers a CSV download', async ({ page }) => {
    const group = await createGroup({ name: 'ExportGroup' });
    await createUser({ username: 'exportuser', email: 'exportuser@test.com' });
    await assignUserToGroup('exportuser', group.id);
    await loginAsAdmin(page);
    await page.goto('/groups');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export mappings/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/group-mappings.*\.csv/);
  });

  // ── Import Group Mappings (CSV wizard) ────────────────────────────────────

  test('import group mappings wizard: upload CSV, preview, and import', async ({ page }) => {
    await createGroup({ name: 'ImportTarget' });
    await createUser({ username: 'importtarget', email: 'importtarget@test.com' });

    const csvContent = `email,group\nimporttarget@test.com,ImportTarget\n`;
    const tmpFile = path.join(os.tmpdir(), 'test-mappings.csv');
    fs.writeFileSync(tmpFile, csvContent);

    try {
      await loginAsAdmin(page);
      await page.goto('/groups/import');

      // Hidden file input — use setInputFiles to bypass browser file picker
      await page.locator('input[aria-label="Upload CSV file"]').setInputFiles(tmpFile);

      await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('importtarget@test.com')).toBeVisible();
      await expect(page.getByText('Ready')).toBeVisible();

      await page.getByRole('button', { name: /import 1 row/i }).click();

      // Confirmation modal has a countdown — wait for Confirm to become enabled
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled({ timeout: 8000 });
      await page.getByRole('button', { name: 'Confirm' }).click();

      await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Imported')).toBeVisible();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('import group mappings shows "Group not found" for unknown groups', async ({ page }) => {
    await createUser({ username: 'missinggroup', email: 'missinggroup@test.com' });
    const csvContent = `email,group\nmissinggroup@test.com,NoSuchGroup\n`;
    const tmpFile = path.join(os.tmpdir(), 'test-missing.csv');
    fs.writeFileSync(tmpFile, csvContent);

    try {
      await loginAsAdmin(page);
      await page.goto('/groups/import');
      await page.locator('input[aria-label="Upload CSV file"]').setInputFiles(tmpFile);
      await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Group not found')).toBeVisible();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
