'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanDatabase, createUser } = require('../helpers/db');
const { loginAsAdmin } = require('../helpers/auth');

test.describe('Import Users', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('upload CSV and import new users successfully', async ({ page }) => {
    const csvContent = 'username,email,firstName,lastName\nnewimport,newimport@test.com,Import,Test\n';
    const tmpPath = path.join(os.tmpdir(), `import-new-${Date.now()}.csv`);

    try {
      fs.writeFileSync(tmpPath, csvContent, 'utf8');
      await loginAsAdmin(page);
      await page.goto('/users/import');

      await page.locator('input[aria-label="Upload CSV file"]').setInputFiles(tmpPath);

      // Step 2: Map Columns — auto-detect maps headers matching field names exactly
      await expect(page.getByRole('button', { name: /preview import/i })).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /preview import/i }).click();

      // Step 3: Preview — row should appear as "New"
      await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('cell', { name: 'newimport', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^import$/i }).click();

      // Step 4: Result
      await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/1 imported/)).toBeVisible();
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  });

  test('preview shows conflict for duplicate username', async ({ page }) => {
    await createUser({ username: 'dupuser', email: 'dupuser@test.com' });

    // Different email to trigger the username conflict path (not an email conflict)
    const csvContent = 'username,email,firstName,lastName\ndupuser,dupuser-other@test.com,Dup,User\n';
    const tmpPath = path.join(os.tmpdir(), `import-dup-${Date.now()}.csv`);

    try {
      fs.writeFileSync(tmpPath, csvContent, 'utf8');
      await loginAsAdmin(page);
      await page.goto('/users/import');

      await page.locator('input[aria-label="Upload CSV file"]').setInputFiles(tmpPath);

      await expect(page.getByRole('button', { name: /preview import/i })).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /preview import/i }).click();

      // Default conflictAction is 'skip', so the row should show "Existing – skip"
      await expect(page.getByText('Existing – skip')).toBeVisible({ timeout: 10000 });

      // The summary badge should indicate 1 conflict
      await expect(page.getByText(/1 conflict/)).toBeVisible();
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  });

  test('preview shows invalid for rows with missing required fields', async ({ page }) => {
    // Row has username but no email — email is a required field
    const csvContent = 'username,email,firstName,lastName\nnoemail,,Missing,Email\n';
    const tmpPath = path.join(os.tmpdir(), `import-missing-${Date.now()}.csv`);

    try {
      fs.writeFileSync(tmpPath, csvContent, 'utf8');
      await loginAsAdmin(page);
      await page.goto('/users/import');

      await page.locator('input[aria-label="Upload CSV file"]').setInputFiles(tmpPath);

      await expect(page.getByRole('button', { name: /preview import/i })).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /preview import/i }).click();

      // Row is marked invalid because email is missing
      await expect(page.getByText(/missing:/i)).toBeVisible({ timeout: 10000 });

      // The summary badge should indicate 1 invalid row
      await expect(page.getByText(/1 invalid/)).toBeVisible();

      // Import button is disabled when there are no importable rows
      await expect(page.getByRole('button', { name: /^import$/i })).toBeDisabled();
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  });
});
