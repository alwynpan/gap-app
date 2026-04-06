'use strict';

const { test, expect } = require('@playwright/test');
const { cleanDatabase, createUser, createGroup, assignUserToGroup } = require('../helpers/db');
const { loginAs, logout, enableGroupJoinLock } = require('../helpers/auth');

test.describe('Dashboard — Feeling Lucky & Group Join Lock', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('user sees "Feeling Lucky" button when groups are available', async ({ page }) => {
    await createUser({ username: 'luckyuser', email: 'luckyuser@test.com' });
    await createGroup({ name: 'LuckyGroup' });
    await loginAs(page, 'luckyuser', 'TestPass123!');
    await expect(page.getByRole('button', { name: /feeling lucky/i })).toBeVisible();
    await expect(page.getByText('LuckyGroup')).toBeVisible();
  });

  test('clicking "Feeling Lucky" assigns user to a group', async ({ page }) => {
    await createUser({ username: 'luckyuser2', email: 'luckyuser2@test.com' });
    await createGroup({ name: 'LuckyGroupA' });
    await createGroup({ name: 'LuckyGroupB' });
    await loginAs(page, 'luckyuser2', 'TestPass123!');
    await page.getByRole('button', { name: /feeling lucky/i }).click();
    await expect(page.getByText(/you are in:/i)).toBeVisible({ timeout: 10000 });
  });

  test('user can join a specific group from the list', async ({ page }) => {
    await createUser({ username: 'joinuser', email: 'joinuser@test.com' });
    await createGroup({ name: 'JoinTarget' });
    await loginAs(page, 'joinuser', 'TestPass123!');
    // exact: true avoids matching "joinuser" in the header button accessible name
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText(/successfully joined/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/you are in:/i)).toBeVisible();
  });

  test('when group join lock is enabled, user sees locked message instead of groups', async ({ page }) => {
    await enableGroupJoinLock(page);
    await createGroup({ name: 'LockedGroup' });
    await createUser({ username: 'lockeduser', email: 'lockeduser@test.com' });
    // PublicRoute redirects authenticated users from /login, so logout first
    await logout(page);
    await loginAs(page, 'lockeduser', 'TestPass123!');
    await expect(page.getByText('Group joining is locked')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /feeling lucky/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Join', exact: true })).not.toBeVisible();
  });

  test('locked user in a group sees locked message and no Leave Group button', async ({ page }) => {
    await enableGroupJoinLock(page);
    const group = await createGroup({ name: 'LockedGroup2' });
    const user = await createUser({ username: 'ingroup', email: 'ingroup@test.com' });
    await assignUserToGroup(user.username, group.id);
    // PublicRoute redirects authenticated users from /login, so logout first
    await logout(page);
    await loginAs(page, 'ingroup', 'TestPass123!');
    await expect(page.getByText('Group joining is locked')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /leave group/i })).not.toBeVisible();
  });
});
