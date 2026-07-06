'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, loginAsAdmin } = require('../helpers/auth');
const { cleanDatabase, createUser, createHierarchy, addUserToSubject, query } = require('../helpers/db');

test.describe('Access control', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test.describe('Regular user', () => {
    test.beforeEach(async ({ page }) => {
      await createUser({ username: 'regularuser', email: 'regular@test.com', role: 'user' });
      await loginAs(page, 'regularuser');
    });

    test('cannot access /users — redirected to dashboard', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('cannot access /groups — redirected to dashboard via /subjects', async ({ page }) => {
      await page.goto('/groups');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('cannot access /subjects — redirected to dashboard', async ({ page }) => {
      await page.goto('/subjects');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('cannot access a subject detail URL — redirected to dashboard', async ({ page }) => {
      const { subject } = await createHierarchy({ subjectName: 'ACL Subject', assignmentName: 'ACL Assignment' });
      await page.goto(`/subjects/${subject.id}`);
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('cannot access an assignment groups URL — redirected to dashboard', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({
        subjectName: 'ACL Subject',
        assignmentName: 'ACL Assignment',
      });
      await page.goto(`/subjects/${subject.id}/assignments/${assignment.id}`);
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('enrolled user is still redirected from /subjects to /dashboard', async ({ page }) => {
      // Subject membership grants API read access but not the admin/AM pages.
      const rows = await query("SELECT id FROM users WHERE username = 'regularuser'");
      const { subject } = await createHierarchy({ subjectName: 'Enrolled Subject', assignmentName: 'A1' });
      await addUserToSubject(rows[0].id, subject.id);
      await page.goto('/subjects');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('cannot access /settings — redirected to dashboard', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe('Assignment manager', () => {
    test.beforeEach(async ({ page }) => {
      await createUser({ username: 'amuser', email: 'am@test.com', role: 'assignment_manager' });
      await loginAs(page, 'amuser');
    });

    test('can access /users', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/users/);
    });

    test('/groups redirects to /subjects', async ({ page }) => {
      await page.goto('/groups');
      await expect(page).toHaveURL(/\/subjects/);
    });

    test('can access /subjects', async ({ page }) => {
      await page.goto('/subjects');
      await expect(page).toHaveURL(/\/subjects/);
      await expect(page.getByRole('heading', { name: 'Manage Subjects' })).toBeVisible();
    });

    test('can access /groups/import', async ({ page }) => {
      await page.goto('/groups/import');
      await expect(page).toHaveURL(/\/groups\/import/);
    });

    test('can access /users/import', async ({ page }) => {
      await page.goto('/users/import');
      await expect(page).toHaveURL(/\/users\/import/);
    });

    test('can access /settings', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/settings/);
    });
  });

  test.describe('Admin', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('can access /users', async ({ page }) => {
      await page.goto('/users');
      await expect(page).toHaveURL(/\/users/);
    });

    test('/groups redirects to /subjects', async ({ page }) => {
      await page.goto('/groups');
      await expect(page).toHaveURL(/\/subjects/);
    });

    test('can access a subject detail page', async ({ page }) => {
      const { subject } = await createHierarchy({ subjectName: 'Admin ACL Subject', assignmentName: 'A1' });
      await page.goto(`/subjects/${subject.id}`);
      await expect(page).toHaveURL(new RegExp(`/subjects/${subject.id}`));
      await expect(page.getByRole('heading', { name: 'Admin ACL Subject' })).toBeVisible();
    });
  });
});
