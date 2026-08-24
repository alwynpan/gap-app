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
} = require('../helpers/db');

/**
 * Assignment manager user management happens on the subject detail page
 * (Members section) — /users is admin-only and redirects AMs to the dashboard.
 */
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

  test('cannot open /users — redirected to dashboard', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Manage Users' })).not.toBeVisible();
  });

  test('cannot open /users/import — redirected to dashboard', async ({ page }) => {
    await page.goto('/users/import');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('/groups redirects to /subjects for an assignment manager', async ({ page }) => {
    await page.goto('/groups');
    await expect(page).toHaveURL(/\/subjects/);
  });

  test('sees the Members section on a managed subject page', async ({ page }) => {
    const target = await createUser({ username: 'targetuser', email: 'target@test.com' });
    await addUserToSubject(target.id, subject.id);

    await page.goto(`/subjects/${subject.id}`);

    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Users enrolled in this subject')).toBeVisible();
    const row = page.locator('table tbody tr').filter({ hasText: 'targetuser' });
    await expect(row).toBeVisible();
    // "+ Add Existing User" is admin-only — not offered to an AM
    await expect(page.getByRole('button', { name: '+ Add Existing User' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: '+ Create User' })).toBeVisible();
  });

  test('can suspend and re-enable a member from the subject page', async ({ page }) => {
    const target = await createUser({ username: 'suspendable', email: 'suspendable@test.com' });
    await addUserToSubject(target.id, subject.id);

    await page.goto(`/subjects/${subject.id}`);
    const row = page.locator('table tbody tr').filter({ hasText: 'suspendable' });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Suspend via the confirmation modal
    await row.locator('button[aria-label="Suspend Member"]').click();
    await expect(page.getByRole('heading', { name: 'Suspend suspendable?' })).toBeVisible();
    await page.getByRole('button', { name: 'Suspend', exact: true }).click();
    await expect(page.getByText('Member suspended')).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('Suspended', { exact: true })).toBeVisible();

    // Re-enable
    await row.locator('button[aria-label="Enable Member"]').click();
    await expect(page.getByText('Member enabled')).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('Suspended', { exact: true })).not.toBeVisible();
  });

  test('can create a user in the managed subject via the Members section', async ({ page }) => {
    await page.goto(`/subjects/${subject.id}`);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: '+ Create User' }).click();
    await page.getByPlaceholder('Enter username').fill('amcreated');
    await page.getByPlaceholder('Enter email').fill('amcreated@test.com');
    await page.getByPlaceholder('Enter first name').fill('Am');
    await page.getByPlaceholder('Enter last name').fill('Created');
    await page.getByRole('button', { name: /^create$/i }).click();

    await expect(page.getByText('User created successfully')).toBeVisible({ timeout: 5000 });
    const row = page.locator('table tbody tr').filter({ hasText: 'amcreated' });
    await expect(row).toBeVisible();
    // Created without a password — the account awaits email setup
    await expect(row.getByText('Pending', { exact: true })).toBeVisible();
  });

  test('can assign a member to a group via the Members section Assign Group modal', async ({ page }) => {
    const assignee = await createUser({ username: 'assignee', email: 'assignee@test.com', role: 'user' });
    await addUserToSubject(assignee.id, subject.id);
    await createGroup({ assignmentId: assignment.id, name: 'AssignGroup' });

    await page.goto(`/subjects/${subject.id}`);
    const row = page.locator('table tbody tr').filter({ hasText: 'assignee' });
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.locator('button[aria-label="Assign Group"]').click();

    // Cascade: Subject → Assignment → Group
    await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'AM Subject' });
    await page.getByLabel('Assignment', { exact: true }).selectOption({ label: 'AM Assignment' });
    await page.getByLabel('Group', { exact: true }).selectOption({ label: 'AssignGroup' });
    await page.getByRole('button', { name: 'Assign', exact: true }).click();

    await expect(page.getByText('User group updated successfully')).toBeVisible({ timeout: 10000 });
  });
});
