'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, logout } = require('../helpers/auth');
const {
  cleanDatabase,
  createUser,
  createGroup,
  createHierarchy,
  addUserToSubject,
  assignUserToGroup,
} = require('../helpers/db');

test.describe('Regular User', () => {
  let subject;
  let assignment;

  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    ({ subject, assignment } = await createHierarchy({ subjectName: 'User Subject', assignmentName: 'User A1' }));
    const user = await createUser({ username: 'normaluser', email: 'normal@test.com', role: 'user' });
    await addUserToSubject(user.id, subject.id);
    await loginAs(page, 'normaluser');
  });

  test('sees dashboard with profile information including subjects', async ({ page }) => {
    await expect(page.getByText('Dashboard')).toBeVisible();
    // Username shown exactly once in the profile <dd> element
    await expect(page.getByText('normaluser', { exact: true })).toBeVisible();
    // Role displayed as "User" in the profile <dd> element
    await expect(page.getByText('User', { exact: true })).toBeVisible();
    // Enrolled subject listed in the profile
    await expect(page.getByText('User Subject').first()).toBeVisible();
  });

  test('sees the subject card with the assignment and no-groups message', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'User Subject' })).toBeVisible();
    await expect(page.getByText('User A1')).toBeVisible();
    // When no groups exist under the assignment, the list shows this specific message
    await expect(page.getByText('No available groups to join')).toBeVisible();
  });

  test('can join a group from the dashboard', async ({ page }) => {
    await createGroup({ assignmentId: assignment.id, name: 'JoinableGroup' });
    await page.reload();

    // Group appears in the available list of the assignment
    await expect(page.getByText('JoinableGroup')).toBeVisible();
    await page.getByRole('button', { name: 'Join', exact: true }).first().click();

    // After joining, the assignment section shows the current-group panel
    await expect(page.getByText(/successfully joined/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/your group:/i)).toBeVisible();
    await expect(page.getByText('JoinableGroup')).toBeVisible();
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
    const group = await createGroup({ assignmentId: assignment.id, name: 'LeaveGroup' });
    await assignUserToGroup('normaluser', group.id);

    await page.reload();
    // Verify Leave Group button is visible (confirms user is in a group)
    await expect(page.getByRole('button', { name: /leave group/i })).toBeVisible();

    await page.getByRole('button', { name: /leave group/i }).click();
    await expect(page.getByText(/successfully left group/i)).toBeVisible({ timeout: 10000 });
    // After leaving, the join list is offered again for the assignment
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  });

  test('user with no subject enrolment sees the not-enrolled message', async ({ page }) => {
    await createUser({ username: 'nosubjectuser', email: 'nosubject@test.com', role: 'user' });
    // PublicRoute redirects authenticated users away from /login, so log out first
    await logout(page);
    await loginAs(page, 'nosubjectuser');
    await expect(page.getByText('You are not enrolled in any subject yet. Contact your administrator.')).toBeVisible();
  });
});
