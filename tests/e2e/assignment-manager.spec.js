'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');
const {
  cleanDatabase,
  createUser,
  createGroup,
  createHierarchy,
  addUserToSubject,
  assignManager,
  assignUserToGroup,
} = require('../helpers/db');

test.describe('Assignment Manager', () => {
  let am;
  let subject;
  let assignment;

  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    am = await createUser({ username: 'am1', email: 'am1@test.com', role: 'assignment_manager' });
    ({ subject, assignment } = await createHierarchy({ subjectName: 'AM Subject', assignmentName: 'AM Assignment' }));
    await assignManager(am.id, assignment.id);
    await loginAs(page, 'am1');
  });

  test('can navigate to /users page', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/users/);
    await expect(page.getByText('Manage Users')).toBeVisible();
  });

  test('cannot see the Create User button', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByText('Manage Users')).toBeVisible();
    await expect(page.getByRole('button', { name: /create user/i })).not.toBeVisible();
  });

  test('cannot see the Delete User button', async ({ page }) => {
    const target = await createUser({ username: 'targetuser', email: 'target@test.com' });
    await addUserToSubject(target.id, subject.id);
    await page.goto('/users');
    // The user in the managed subject is visible, but has no delete control
    await expect(page.getByText('targetuser', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete User' })).not.toBeVisible();
  });

  test('/groups redirects to /subjects for an assignment manager', async ({ page }) => {
    await page.goto('/groups');
    await expect(page).toHaveURL(/\/subjects/);
  });

  test('edit-user modal hides the Role select (no role escalation) but allows editing other fields', async ({
    page,
  }) => {
    const target = await createUser({ username: 'edittarget', email: 'edittarget@test.com', role: 'user' });
    await addUserToSubject(target.id, subject.id);
    await page.goto('/users');

    // Scope to the target user's row.
    const row = page.locator('table tbody tr').filter({ hasText: 'edittarget' });
    await row.getByRole('button', { name: 'Edit User Profile' }).click();

    // Modal opens.
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    // The Role <select> is admin-only — it must not be present for an assignment manager.
    const editForm = page.locator('form').filter({ has: page.getByPlaceholder('Enter first name') });
    await expect(editForm.getByRole('combobox')).toHaveCount(0);

    // The AM can still update an allowed field (first name).
    await page.getByPlaceholder('Enter first name').fill('AmEdited');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('User updated successfully')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('AmEdited')).toBeVisible();
  });

  test('built-in admin is not listed for an assignment manager (subject-scoped view)', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByText('Manage Users')).toBeVisible();
    // AMs only see users enrolled in subjects they manage; the admin account is
    // not enrolled anywhere, so its row (and any edit control on it) is absent.
    const adminRow = page.locator('table tbody tr').filter({ hasText: 'admin@gap.local' });
    await expect(adminRow).toHaveCount(0);
  });

  test('can assign a user to a group via the Assign Group modal', async ({ page }) => {
    const assignee = await createUser({ username: 'assignee', email: 'assignee@test.com', role: 'user' });
    await addUserToSubject(assignee.id, subject.id);
    await createGroup({ assignmentId: assignment.id, name: 'AssignGroup' });

    await page.goto('/users');

    const row = page.locator('table tbody tr').filter({ hasText: 'assignee' });
    await row.getByRole('button', { name: 'Assign Group' }).click();

    // Cascade: Subject → Assignment → Group
    await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'AM Subject' });
    await page.getByLabel('Assignment', { exact: true }).selectOption({ label: 'AM Assignment' });
    await page.getByLabel('Group', { exact: true }).selectOption({ label: 'AssignGroup' });
    await page.getByRole('button', { name: 'Assign', exact: true }).click();

    await expect(page.getByText('User group updated successfully')).toBeVisible({ timeout: 10000 });
    // Membership is summarised in the Subjects cell title: "Subject › Assignment › Group"
    await expect(row.locator('[title*="AssignGroup"]')).toBeVisible();
  });

  test('can unassign a user from a group via the Assign Group modal', async ({ page }) => {
    const group = await createGroup({ assignmentId: assignment.id, name: 'UnassignGroup' });
    await createUser({ username: 'assigned', email: 'assigned@test.com', role: 'user' });
    await assignUserToGroup('assigned', group.id);

    await page.goto('/users');

    const row = page.locator('table tbody tr').filter({ hasText: 'assigned' });
    await expect(row.locator('[title*="UnassignGroup"]')).toBeVisible({ timeout: 10000 });

    await row.getByRole('button', { name: 'Assign Group' }).click();

    // Selecting the assignment with an existing membership reveals the remove action
    await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'AM Subject' });
    await page.getByLabel('Assignment', { exact: true }).selectOption({ label: 'AM Assignment' });
    await page.getByRole('button', { name: 'Remove from group' }).click();

    await expect(page.getByText('User group updated successfully')).toBeVisible({ timeout: 10000 });
    await expect(row.locator('[title*="UnassignGroup"]')).toHaveCount(0);
  });
});
