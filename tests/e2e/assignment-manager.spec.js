'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');
const { cleanDatabase, createUser, createGroup } = require('../helpers/db');

test.describe('Assignment Manager', () => {
  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    await createUser({ username: 'am1', email: 'am1@test.com', role: 'assignment_manager' });
    await loginAs(page, 'am1');
  });

  test('can navigate to /users page', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/users/);
    await expect(page.getByText('Manage Users')).toBeVisible();
  });

  test('cannot see the Create User button', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByRole('button', { name: /create user/i })).not.toBeVisible();
  });

  test('cannot see the Delete User button', async ({ page }) => {
    await createUser({ username: 'targetuser', email: 'target@test.com' });
    await page.goto('/users');
    await expect(page.getByRole('button', { name: 'Delete User' })).not.toBeVisible();
  });

  test('cannot access /groups — redirected to dashboard', async ({ page }) => {
    await page.goto('/groups');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('can assign a user to a group', async ({ page }) => {
    await createUser({ username: 'assignee', email: 'assignee@test.com', role: 'user' });
    await createGroup({ name: 'AssignGroup' });

    await page.goto('/users');

    // Click the Assign Group button for the user
    await page.getByRole('button', { name: 'Assign Group' }).first().click();

    // Select the group from the dropdown
    await page.getByRole('combobox', { name: /assign to group/i }).selectOption({ label: 'AssignGroup' });
    await page.getByRole('button', { name: 'Save' }).click();

    // Group name appears in the user row's group cell (title attribute is unique)
    await expect(page.locator('[title="AssignGroup"]')).toBeVisible();
  });
});
