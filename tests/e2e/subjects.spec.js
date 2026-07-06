'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, loginAsAdmin } = require('../helpers/auth');
const {
  cleanDatabase,
  createUser,
  createSubject,
  createHierarchy,
  assignManager,
  addUserToSubject,
} = require('../helpers/db');

test.describe('Subjects', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test.describe('Admin', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('sees the empty state when no subjects exist', async ({ page }) => {
      await page.goto('/subjects');
      await expect(page.getByText('No subjects found')).toBeVisible();
    });

    test('can create a subject and it appears with zero counts', async ({ page }) => {
      await page.goto('/subjects');
      await page.getByRole('button', { name: '+ Create Subject' }).click();
      await expect(page.getByRole('heading', { name: 'Create New Subject' })).toBeVisible();

      await page.getByPlaceholder('Enter subject name').fill('COMP10001');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('Subject created successfully')).toBeVisible({ timeout: 5000 });
      const row = page.locator('table tbody tr').filter({ hasText: 'COMP10001' });
      await expect(row).toBeVisible();
      // Assignment and member counts start at zero
      await expect(row.locator('td').nth(1)).toHaveText('0');
      await expect(row.locator('td').nth(2)).toHaveText('0');
    });

    test('shows the counts of assignments and members', async ({ page }) => {
      const { subject } = await createHierarchy({ subjectName: 'Counted Subject', assignmentName: 'CA1' });
      const member = await createUser({ username: 'countmember', email: 'countmember@test.com' });
      await addUserToSubject(member.id, subject.id);

      await page.goto('/subjects');
      const row = page.locator('table tbody tr').filter({ hasText: 'Counted Subject' });
      await expect(row.locator('td').nth(1)).toHaveText('1');
      await expect(row.locator('td').nth(2)).toHaveText('1');
    });

    test('shows an error when creating a subject with a duplicate name', async ({ page }) => {
      await createSubject({ name: 'DupSubject' });
      await page.goto('/subjects');
      await page.getByRole('button', { name: '+ Create Subject' }).click();

      await page.getByPlaceholder('Enter subject name').fill('DupSubject');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('A subject with this name already exists')).toBeVisible();
    });

    test('clicking a subject row opens the subject detail page', async ({ page }) => {
      const subject = await createSubject({ name: 'Clickable Subject' });
      await page.goto('/subjects');
      await page.locator('table tbody tr').filter({ hasText: 'Clickable Subject' }).click();

      await expect(page).toHaveURL(new RegExp(`/subjects/${subject.id}`));
      await expect(page.getByRole('heading', { name: 'Clickable Subject' })).toBeVisible();
      // Breadcrumb links back to the subjects list
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Subjects');
    });

    test('can filter subjects with the search box', async ({ page }) => {
      await createSubject({ name: 'Alpha Subject' });
      await createSubject({ name: 'Beta Subject' });
      await page.goto('/subjects');

      await page.getByLabel('Search subjects').fill('Alpha');
      await expect(page.getByText('Alpha Subject')).toBeVisible();
      await expect(page.getByText('Beta Subject')).not.toBeVisible();
    });
  });

  test.describe('Role scoping', () => {
    test('regular user is redirected away from /subjects', async ({ page }) => {
      const user = await createUser({ username: 'subjuser', email: 'subjuser@test.com', role: 'user' });
      const { subject } = await createHierarchy({ subjectName: 'Scoped Subject', assignmentName: 'SA1' });
      await addUserToSubject(user.id, subject.id);
      await loginAs(page, 'subjuser');
      await page.goto('/subjects');
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('assignment manager sees only subjects containing assignments they manage', async ({ page }) => {
      const am = await createUser({ username: 'scopedam', email: 'scopedam@test.com', role: 'assignment_manager' });
      const managed = await createHierarchy({ subjectName: 'Managed Subject', assignmentName: 'MA1' });
      await createHierarchy({ subjectName: 'Unmanaged Subject', assignmentName: 'UA1' });
      await assignManager(am.id, managed.assignment.id);

      await loginAs(page, 'scopedam');
      await page.goto('/subjects');

      await expect(page.getByText('Managed Subject')).toBeVisible();
      await expect(page.getByText('Unmanaged Subject')).not.toBeVisible();
      // AMs cannot create or delete subjects
      await expect(page.getByRole('button', { name: '+ Create Subject' })).not.toBeVisible();
      await expect(page.locator('button[aria-label="Delete Subject"]')).toHaveCount(0);
    });

    test('assignment manager with no managed assignments sees the empty state', async ({ page }) => {
      await createUser({ username: 'idleam', email: 'idleam@test.com', role: 'assignment_manager' });
      await createHierarchy({ subjectName: 'Invisible Subject', assignmentName: 'IA1' });

      await loginAs(page, 'idleam');
      await page.goto('/subjects');

      await expect(page.getByText('No subjects found')).toBeVisible();
      await expect(page.getByText('Invisible Subject')).not.toBeVisible();
    });
  });
});
