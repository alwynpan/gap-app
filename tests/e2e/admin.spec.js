'use strict';

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('../helpers/auth');
const { cleanDatabase, createUser, createGroup, createHierarchy, createAssignment } = require('../helpers/db');

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    await loginAsAdmin(page);
  });

  test.describe('User management', () => {
    test('can create a new user via the UI (subject is required for the user role)', async ({ page }) => {
      await createHierarchy({ subjectName: 'AdminSubject', assignmentName: 'A1' });
      await page.goto('/users');
      await page.getByRole('button', { name: /create user/i }).click();

      // Create User form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter username').fill('newuser');
      await page.getByPlaceholder('Enter email').fill('newuser@test.com');
      await page.getByPlaceholder('Enter first name').fill('New');
      await page.getByPlaceholder('Enter last name').fill('User');

      // Subject is mandatory for the user role (cascading select)
      await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'AdminSubject' });

      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('User created successfully')).toBeVisible({ timeout: 5000 });
      // Newly created user should appear in the list, enrolled in the subject
      const row = page.locator('table tbody tr').filter({ hasText: 'newuser' });
      await expect(row).toBeVisible();
      await expect(row.getByText('AdminSubject')).toBeVisible();
    });

    test('creating a user without choosing a subject shows a validation error', async ({ page }) => {
      await createHierarchy({ subjectName: 'AdminSubject', assignmentName: 'A1' });
      await page.goto('/users');
      await page.getByRole('button', { name: /create user/i }).click();

      await page.getByPlaceholder('Enter username').fill('nosubject');
      await page.getByPlaceholder('Enter email').fill('nosubject@test.com');
      await page.getByPlaceholder('Enter first name').fill('No');
      await page.getByPlaceholder('Enter last name').fill('Subject');

      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.locator('.bg-red-50')).toContainText('Subject is required');
    });

    test('can edit a user profile', async ({ page }) => {
      await createUser({ username: 'editme', email: 'editme@test.com' });
      await page.goto('/users');
      await page.getByRole('button', { name: 'Edit User Profile' }).first().click();

      // Edit User form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter first name').fill('Edited');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('Edited')).toBeVisible();
    });

    test('can delete a user', async ({ page }) => {
      await createUser({ username: 'deleteme', email: 'deleteme@test.com' });
      await page.goto('/users');

      await page.getByRole('button', { name: 'Delete User' }).first().click();
      // Confirm deletion in modal — button text is "Delete 1 user"
      await page.getByRole('button', { name: /^Delete \d+ user/i }).click();

      await expect(page.getByText('deleteme', { exact: true })).not.toBeVisible();
    });
  });

  test.describe('Create User — error paths', () => {
    test('shows error when creating a user with a duplicate username', async ({ page }) => {
      await createHierarchy({ subjectName: 'DupSubject', assignmentName: 'A1' });
      await createUser({ username: 'dupeuser', email: 'dupeuser@test.com' });
      await page.goto('/users');
      await page.getByRole('button', { name: /create user/i }).click();

      await page.getByPlaceholder('Enter username').fill('dupeuser');
      await page.getByPlaceholder('Enter email').fill('unique@test.com');
      await page.getByPlaceholder('Enter first name').fill('Test');
      await page.getByPlaceholder('Enter last name').fill('User');
      await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'DupSubject' });

      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.locator('.bg-red-50')).toContainText('Username or email already in use');
    });

    test('shows error when creating a user with a duplicate email', async ({ page }) => {
      await createHierarchy({ subjectName: 'DupSubject', assignmentName: 'A1' });
      await createUser({ username: 'uniqueuser', email: 'dupe@test.com' });
      await page.goto('/users');
      await page.getByRole('button', { name: /create user/i }).click();

      await page.getByPlaceholder('Enter username').fill('anotheruser');
      await page.getByPlaceholder('Enter email').fill('dupe@test.com');
      await page.getByPlaceholder('Enter first name').fill('Test');
      await page.getByPlaceholder('Enter last name').fill('User');
      await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'DupSubject' });

      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.locator('.bg-red-50')).toContainText('Username or email already in use');
    });
  });

  test.describe('Group management', () => {
    test('can create a new group under an assignment', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({ subjectName: 'GroupSubject', assignmentName: 'GA1' });
      await page.goto(`/subjects/${subject.id}/assignments/${assignment.id}`);
      await page.getByRole('button', { name: '+ Create Group' }).click();

      // Create Group form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter group name').fill('Test Group Alpha');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('Test Group Alpha')).toBeVisible();
    });

    test('shows error when creating a group with a duplicate name in the assignment', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({ subjectName: 'GroupSubject', assignmentName: 'GA1' });
      await createGroup({ assignmentId: assignment.id, name: 'DupGroup' });
      await page.goto(`/subjects/${subject.id}/assignments/${assignment.id}`);
      await page.getByRole('button', { name: '+ Create Group' }).click();

      await page.getByPlaceholder('Enter group name').fill('DupGroup');
      await page.getByRole('button', { name: /^create$/i }).click();

      // Backend returns 409 'Group name already exists'; the create form surfaces it inline.
      await expect(page.getByText('Group name already exists')).toBeVisible();
    });

    test('can create a group with the same name in a different assignment', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({
        subjectName: 'GroupSubject',
        assignmentName: 'GA1',
        groups: [{ name: 'SharedName' }],
      });
      const other = await createAssignment({ subjectId: subject.id, name: 'GA2' });

      await page.goto(`/subjects/${subject.id}/assignments/${other.id}`);
      await page.getByRole('button', { name: '+ Create Group' }).click();
      await page.getByPlaceholder('Enter group name').fill('SharedName');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('Group created successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('SharedName')).toBeVisible();

      // The original assignment still has its own group of the same name
      await page.goto(`/subjects/${subject.id}/assignments/${assignment.id}`);
      await expect(page.getByText('SharedName')).toBeVisible();
    });

    test('can edit a group name', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({
        subjectName: 'GroupSubject',
        assignmentName: 'GA1',
        groups: [{ name: 'OldGroupName' }],
      });
      await page.goto(`/subjects/${subject.id}/assignments/${assignment.id}`);

      // Use aria-label selector — <tr role="button"> also appears in getByRole('button') results
      await page.locator('button[aria-label="Edit Group"]').first().click();
      // Edit Group form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter group name').fill('NewGroupName');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('NewGroupName')).toBeVisible();
    });

    test('can delete a group', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({
        subjectName: 'GroupSubject',
        assignmentName: 'GA1',
        groups: [{ name: 'GroupToDelete' }],
      });
      await page.goto(`/subjects/${subject.id}/assignments/${assignment.id}`);

      // Use aria-label selector — <tr role="button"> also appears in getByRole('button') results
      await page.locator('button[aria-label="Delete Group"]').first().click();
      // Confirm deletion in modal — button text is "Delete 1 group"
      await page.getByRole('button', { name: /^Delete \d+ group/i }).click();

      await expect(page.getByText('GroupToDelete')).not.toBeVisible();
    });
  });
});
