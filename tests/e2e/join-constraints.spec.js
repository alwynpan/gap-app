'use strict';

const { test, expect } = require('@playwright/test');
const {
  cleanDatabase,
  createUser,
  createGroup,
  createHierarchy,
  addUserToSubject,
  assignUserToGroup,
} = require('../helpers/db');
const { loginAs } = require('../helpers/auth');

test.describe('Join Group Constraints', () => {
  let subject;
  let assignment;

  test.beforeEach(async () => {
    await cleanDatabase();
    ({ subject, assignment } = await createHierarchy({ subjectName: 'Join Subject', assignmentName: 'Join A1' }));
  });

  test('user cannot see a full group in the join list', async ({ page }) => {
    // The UI filters full groups client-side before rendering, so a full group
    // never appears with a Join button — this tests that filtering behaviour.
    const fullGroup = await createGroup({ assignmentId: assignment.id, name: 'FullGroup', maxMembers: 1 });
    const occupant = await createUser({ username: 'occupant', email: 'occupant@test.com' });
    await assignUserToGroup(occupant.username, fullGroup.id);

    const testUser = await createUser({ username: 'testjoin', email: 'testjoin@test.com' });
    await addUserToSubject(testUser.id, subject.id);
    await loginAs(page, testUser.username);

    // The subject card renders the assignment section
    await expect(page.getByRole('heading', { name: 'Join Subject' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Join A1')).toBeVisible();

    // Full group must not appear in the available-groups list
    await expect(page.getByText('FullGroup')).not.toBeVisible();
    // No Join button is rendered because no groups are available
    await expect(page.getByRole('button', { name: 'Join', exact: true })).not.toBeVisible();
    await expect(page.getByText('No available groups to join')).toBeVisible();
  });

  test('user already in a group sees Leave button and no Join buttons', async ({ page }) => {
    const groupA = await createGroup({ assignmentId: assignment.id, name: 'GroupA' });
    await createGroup({ assignmentId: assignment.id, name: 'GroupB' });
    const testUser = await createUser({ username: 'ingrpuser', email: 'ingrpuser@test.com' });
    await assignUserToGroup(testUser.username, groupA.id);

    await loginAs(page, testUser.username);

    // The assignment section shows the current group instead of the join list
    await expect(page.getByText(/your group:/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('GroupA')).toBeVisible();
    await expect(page.getByRole('button', { name: /leave group/i })).toBeVisible();

    // Join buttons (and other groups of the assignment) are not offered
    await expect(page.getByRole('button', { name: 'Join', exact: true })).not.toBeVisible();
    await expect(page.getByText('GroupB')).not.toBeVisible();
  });

  test('Feeling Lucky shows error when no groups are available', async ({ page }) => {
    // No groups under the assignment — available list is empty, button click triggers inline error
    const testUser = await createUser({ username: 'luckynone', email: 'luckynone@test.com' });
    await addUserToSubject(testUser.id, subject.id);
    await loginAs(page, testUser.username);

    await expect(page.getByText('No available groups to join')).toBeVisible({ timeout: 10000 });

    // The Feeling Lucky button is always rendered for a group-less assignment regardless of list size
    await page.getByRole('button', { name: /feeling lucky/i }).click();
    await expect(page.getByText('No available group to join')).toBeVisible({ timeout: 5000 });
  });

  test('disabled groups are not offered in the join list', async ({ page }) => {
    await createGroup({ assignmentId: assignment.id, name: 'DisabledJoinGroup', enabled: false });
    const testUser = await createUser({ username: 'nodisabled', email: 'nodisabled@test.com' });
    await addUserToSubject(testUser.id, subject.id);
    await loginAs(page, testUser.username);

    await expect(page.getByText('No available groups to join')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('DisabledJoinGroup')).not.toBeVisible();
  });
});
