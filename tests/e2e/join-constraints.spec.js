'use strict';

const { test, expect } = require('@playwright/test');
const { cleanDatabase, createUser, createGroup, assignUserToGroup } = require('../helpers/db');
const { loginAs } = require('../helpers/auth');

test.describe('Join Group Constraints', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('user cannot see a full group in the join list', async ({ page }) => {
    // The UI filters full groups client-side before rendering, so a full group
    // never appears with a Join button — this tests that filtering behaviour.
    const fullGroup = await createGroup({ name: 'FullGroup', maxMembers: 1 });
    const occupant = await createUser({ username: 'occupant', email: 'occupant@test.com' });
    await assignUserToGroup(occupant.username, fullGroup.id);

    const testUser = await createUser({ username: 'testjoin', email: 'testjoin@test.com' });
    await loginAs(page, testUser.username);

    // Full group must not appear in the available-groups list
    await expect(page.getByText('FullGroup')).not.toBeVisible();
    // No Join button is rendered because no groups are available
    await expect(page.getByRole('button', { name: 'Join', exact: true })).not.toBeVisible();
    await expect(page.getByText('No available groups to join')).toBeVisible();
  });

  test('user already in a group sees Leave button and no Join buttons', async ({ page }) => {
    const groupA = await createGroup({ name: 'GroupA' });
    await createGroup({ name: 'GroupB' });
    const testUser = await createUser({ username: 'ingrpuser', email: 'ingrpuser@test.com' });
    await assignUserToGroup(testUser.username, groupA.id);

    await loginAs(page, testUser.username);

    // When user has a group, the available-groups list is not shown at all;
    // instead the current-group panel with Leave Group is rendered.
    await expect(page.getByText(/you are in:/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('definition').filter({ hasText: 'GroupA' })).toBeVisible();
    await expect(page.getByRole('button', { name: /leave group/i })).toBeVisible();

    // Join buttons are not present when the user is already in a group
    await expect(page.getByRole('button', { name: 'Join', exact: true })).not.toBeVisible();
  });

  test('Feeling Lucky shows error when no groups are available', async ({ page }) => {
    // No groups in DB — available list is empty, button click triggers inline error
    const testUser = await createUser({ username: 'luckynone', email: 'luckynone@test.com' });
    await loginAs(page, testUser.username);

    await expect(page.getByText('No available groups to join')).toBeVisible({ timeout: 10000 });

    // The Feeling Lucky button is always rendered for a group-less user regardless of list size
    await page.getByRole('button', { name: /feeling lucky/i }).click();
    await expect(page.getByText('No available group to join')).toBeVisible({ timeout: 5000 });
  });
});
