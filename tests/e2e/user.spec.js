'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');
const { cleanDatabase, createUser, createGroup, assignUserToGroup } = require('../helpers/db');

test.describe('Regular User', () => {
  let user;

  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    user = await createUser({ username: 'normaluser', email: 'normal@test.com', role: 'user' });
    await loginAs(page, 'normaluser');
  });

  test('sees dashboard with profile information', async ({ page }) => {
    await expect(page.getByText('Dashboard')).toBeVisible();
    // Username shown exactly once in the profile <dd> element
    await expect(page.getByText('normaluser', { exact: true })).toBeVisible();
    // Role displayed as "User" in the profile <dd> element
    await expect(page.getByText('User', { exact: true })).toBeVisible();
  });

  test('sees "My Group" section when not in a group', async ({ page }) => {
    await expect(page.getByText('My Group')).toBeVisible();
    // When no groups exist, the list shows this specific message
    await expect(page.getByText('No available groups to join')).toBeVisible();
  });

  test('can join a group from the dashboard', async ({ page }) => {
    await createGroup({ name: 'JoinableGroup' });
    await page.reload();

    // Group appears in the available list
    await expect(page.getByText('JoinableGroup')).toBeVisible();
    await page.getByRole('button', { name: /^join$/i }).first().click();

    // After joining, the group name is shown in the profile (definition list)
    await expect(page.getByRole('definition').filter({ hasText: 'JoinableGroup' })).toBeVisible();
  });

  test('cannot access /users — redirected to dashboard', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('cannot access /groups — redirected to dashboard', async ({ page }) => {
    await page.goto('/groups');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('can leave a group after joining', async ({ page }) => {
    const group = await createGroup({ name: 'LeaveGroup' });
    await assignUserToGroup('normaluser', group.id);

    await page.reload();
    // Verify Leave Group button is visible (confirms user is in a group)
    await expect(page.getByRole('button', { name: /leave group/i })).toBeVisible();

    await page.getByRole('button', { name: /leave group/i }).click();
    // After leaving, the profile group field shows "Not assigned"
    await expect(page.getByText('Not assigned', { exact: true })).toBeVisible();
  });
});
