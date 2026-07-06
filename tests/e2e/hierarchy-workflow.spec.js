'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, loginAsAdmin, logout } = require('../helpers/auth');
const { cleanDatabase, createUser, assignUserToGroup, query } = require('../helpers/db');

/**
 * End-to-end admin → user workflow across the full Subject → Assignment →
 * Group hierarchy, exercised through the UI wherever possible.
 */
test.describe('Hierarchy workflow', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('admin builds the hierarchy, places a user, and the user joins/leaves groups', async ({ page }) => {
    test.setTimeout(120000);
    await createUser({ username: 'flowuser', email: 'flowuser@test.com', role: 'user' });

    await loginAsAdmin(page);

    // ── 1. Create the subject ────────────────────────────────────────────
    await page.goto('/subjects');
    await page.getByRole('button', { name: '+ Create Subject' }).click();
    await page.getByPlaceholder('Enter subject name').fill('Flow Subject');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('Subject created successfully')).toBeVisible({ timeout: 5000 });

    // ── 2. Drill in and create the assignment ────────────────────────────
    await page.locator('table tbody tr').filter({ hasText: 'Flow Subject' }).click();
    await page.getByRole('button', { name: '+ Create Assignment' }).click();
    await page.getByPlaceholder('Enter assignment name').fill('Flow Assignment');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('Assignment created successfully')).toBeVisible({ timeout: 5000 });

    // ── 3. Drill in and create two groups ────────────────────────────────
    await page.locator('table tbody tr').filter({ hasText: 'Flow Assignment' }).click();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Flow Assignment');

    await page.getByRole('button', { name: '+ Create Group' }).click();
    await page.getByPlaceholder('Enter group name').fill('Flow Group A');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('Group created successfully')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: '+ Create Group' }).click();
    await page.getByPlaceholder('Enter group name').fill('Flow Group B');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('Flow Group B')).toBeVisible({ timeout: 5000 });

    // ── 4. Enrol the user in the subject via Manage Subjects ─────────────
    await page.goto('/users');
    const userRow = page.locator('table tbody tr').filter({ hasText: 'flowuser' });
    await userRow.getByRole('button', { name: 'Manage Subjects' }).click();
    await expect(page.getByRole('heading', { name: /Manage Subjects — flowuser/ })).toBeVisible();
    await page.locator('label').filter({ hasText: 'Flow Subject' }).locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Subjects updated successfully')).toBeVisible({ timeout: 5000 });
    await expect(userRow.getByText('Flow Subject')).toBeVisible();

    // ── 5. Place the user in Flow Group A via the Assign Group modal ─────
    await userRow.getByRole('button', { name: 'Assign Group' }).click();
    await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'Flow Subject' });
    await page.getByLabel('Assignment', { exact: true }).selectOption({ label: 'Flow Assignment' });
    await page.getByLabel('Group', { exact: true }).selectOption({ label: 'Flow Group A' });
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(page.getByText('User group updated successfully')).toBeVisible({ timeout: 10000 });
    await expect(userRow.locator('[title*="Flow Group A"]')).toBeVisible();

    // ── 6. The user sees their placement on the dashboard ────────────────
    await logout(page);
    await loginAs(page, 'flowuser');
    await expect(page.getByRole('heading', { name: 'Flow Subject' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Flow Assignment')).toBeVisible();
    await expect(page.getByText(/your group:/i)).toBeVisible();
    await expect(page.getByText('Flow Group A')).toBeVisible();

    // ── 7. Leave, then join the other group ──────────────────────────────
    await page.getByRole('button', { name: /leave group/i }).click();
    await expect(page.getByText(/successfully left group/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Join', exact: true }).first()).toBeVisible();

    await page
      .locator('li')
      .filter({ hasText: 'Flow Group B' })
      .getByRole('button', { name: 'Join', exact: true })
      .click();
    await expect(page.getByText(/successfully joined/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/your group:/i)).toBeVisible();
    await expect(page.getByText('Flow Group B')).toBeVisible();

    // ── 8. A second join for the same assignment is rejected with 409 ────
    await page.getByRole('button', { name: /leave group/i }).click();
    await expect(page.getByText(/successfully left group/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Join', exact: true }).first()).toBeVisible();

    // Re-create a membership behind the UI's back so the visible Join button
    // targets an assignment the user already belongs to.
    const groupARows = await query("SELECT id FROM groups WHERE name = 'Flow Group A'");
    await assignUserToGroup('flowuser', groupARows[0].id);

    await page
      .locator('li')
      .filter({ hasText: 'Flow Group B' })
      .getByRole('button', { name: 'Join', exact: true })
      .click();
    await expect(page.getByText('User is already in a group for this assignment')).toBeVisible({ timeout: 10000 });
  });
});
