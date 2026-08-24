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
const { loginAs, logout, lockAssignmentJoining } = require('../helpers/auth');

test.describe('Dashboard — Feeling Lucky & Group Join Lock', () => {
  let subject;
  let assignment;

  test.beforeEach(async () => {
    await cleanDatabase();
    ({ subject, assignment } = await createHierarchy({ subjectName: 'Dash Subject', assignmentName: 'Dash A1' }));
  });

  test('user sees "Feeling Lucky" button when groups are available', async ({ page }) => {
    const user = await createUser({ username: 'luckyuser', email: 'luckyuser@test.com' });
    await addUserToSubject(user.id, subject.id);
    await createGroup({ assignmentId: assignment.id, name: 'LuckyGroup' });
    await loginAs(page, 'luckyuser', 'TestPass123!');
    await expect(page.getByRole('button', { name: /feeling lucky/i })).toBeVisible();
    await expect(page.getByText('LuckyGroup')).toBeVisible();
  });

  test('clicking "Feeling Lucky" assigns user to a group in the assignment', async ({ page }) => {
    const user = await createUser({ username: 'luckyuser2', email: 'luckyuser2@test.com' });
    await addUserToSubject(user.id, subject.id);
    await createGroup({ assignmentId: assignment.id, name: 'LuckyGroupA' });
    await createGroup({ assignmentId: assignment.id, name: 'LuckyGroupB' });
    await loginAs(page, 'luckyuser2', 'TestPass123!');
    await page.getByRole('button', { name: /feeling lucky/i }).click();
    await expect(page.getByText(/your group:/i)).toBeVisible({ timeout: 10000 });
  });

  test('user can join a specific group from the list', async ({ page }) => {
    const user = await createUser({ username: 'joinuser', email: 'joinuser@test.com' });
    await addUserToSubject(user.id, subject.id);
    await createGroup({ assignmentId: assignment.id, name: 'JoinTarget' });
    await loginAs(page, 'joinuser', 'TestPass123!');
    // exact: true avoids matching "joinuser" in the header button accessible name
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText(/successfully joined/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/your group:/i)).toBeVisible();
  });

  test('when the assignment is locked, user sees locked message instead of groups', async ({ page }) => {
    await lockAssignmentJoining(page, assignment.name);
    await createGroup({ assignmentId: assignment.id, name: 'LockedGroup' });
    const user = await createUser({ username: 'lockeduser', email: 'lockeduser@test.com' });
    await addUserToSubject(user.id, subject.id);
    // PublicRoute redirects authenticated users from /login, so logout first
    await logout(page);
    await loginAs(page, 'lockeduser', 'TestPass123!');
    await expect(page.getByText('Group joining is locked for this assignment')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /feeling lucky/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Join', exact: true })).not.toBeVisible();
  });

  test('user in a group of a locked assignment sees the message and no Leave Group button', async ({ page }) => {
    await lockAssignmentJoining(page, assignment.name);
    const group = await createGroup({ assignmentId: assignment.id, name: 'LockedGroup2' });
    const user = await createUser({ username: 'ingroup', email: 'ingroup@test.com' });
    await assignUserToGroup(user.username, group.id);
    // PublicRoute redirects authenticated users from /login, so logout first
    await logout(page);
    await loginAs(page, 'ingroup', 'TestPass123!');
    await expect(page.getByText('Group joining is locked for this assignment')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/your group:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /leave group/i })).not.toBeVisible();
  });
});
