'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, loginAsAdmin } = require('../helpers/auth');
const {
  cleanDatabase,
  createUser,
  createSubject,
  createAssignment,
  createHierarchy,
  assignManager,
} = require('../helpers/db');

test.describe('Assignments', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test.describe('Admin', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('drilling into a subject shows its assignments', async ({ page }) => {
      const { subject } = await createHierarchy({ subjectName: 'Drill Subject', assignmentName: 'Existing A1' });
      await page.goto('/subjects');
      await page.locator('table tbody tr').filter({ hasText: 'Drill Subject' }).click();

      await expect(page).toHaveURL(new RegExp(`/subjects/${subject.id}`));
      await expect(page.getByText('Existing A1')).toBeVisible();
      await expect(page.getByText('Assignments in this subject')).toBeVisible();
    });

    test('shows the empty state for a subject with no assignments', async ({ page }) => {
      const subject = await createSubject({ name: 'Empty Subject' });
      await page.goto(`/subjects/${subject.id}`);
      await expect(page.getByText('No assignments yet')).toBeVisible();
    });

    test('can create an assignment in a subject', async ({ page }) => {
      const subject = await createSubject({ name: 'Create Subject' });
      await page.goto(`/subjects/${subject.id}`);

      await page.getByRole('button', { name: '+ Create Assignment' }).click();
      await expect(page.getByRole('heading', { name: 'Create New Assignment' })).toBeVisible();
      await page.getByPlaceholder('Enter assignment name').fill('Assignment One');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('Assignment created successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Assignment One')).toBeVisible();
    });

    test('shows an error when creating a duplicate assignment name in the same subject', async ({ page }) => {
      const { subject } = await createHierarchy({ subjectName: 'Dup Subject', assignmentName: 'Dup Assignment' });
      await page.goto(`/subjects/${subject.id}`);

      await page.getByRole('button', { name: '+ Create Assignment' }).click();
      await page.getByPlaceholder('Enter assignment name').fill('Dup Assignment');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('An assignment with this name already exists in this subject')).toBeVisible();
    });

    test('the same assignment name is allowed in a different subject', async ({ page }) => {
      await createHierarchy({ subjectName: 'First Subject', assignmentName: 'Shared Assignment' });
      const other = await createSubject({ name: 'Second Subject' });

      await page.goto(`/subjects/${other.id}`);
      await page.getByRole('button', { name: '+ Create Assignment' }).click();
      await page.getByPlaceholder('Enter assignment name').fill('Shared Assignment');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('Assignment created successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Shared Assignment')).toBeVisible();
    });

    test('clicking an assignment row opens the groups view with a breadcrumb', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({
        subjectName: 'Crumb Subject',
        assignmentName: 'Crumb Assignment',
        groups: [{ name: 'Crumb Group' }],
      });
      await page.goto(`/subjects/${subject.id}`);
      await page.locator('table tbody tr').filter({ hasText: 'Crumb Assignment' }).click();

      await expect(page).toHaveURL(new RegExp(`/subjects/${subject.id}/assignments/${assignment.id}`));
      const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
      await expect(breadcrumb).toContainText('Subjects');
      await expect(breadcrumb).toContainText('Crumb Subject');
      await expect(breadcrumb).toContainText('Crumb Assignment');
      await expect(page.getByText('Crumb Group')).toBeVisible();
    });

    test('breadcrumb links navigate back up the hierarchy', async ({ page }) => {
      const { subject, assignment } = await createHierarchy({
        subjectName: 'Back Subject',
        assignmentName: 'Back Assignment',
      });
      await page.goto(`/subjects/${subject.id}/assignments/${assignment.id}`);

      const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
      await breadcrumb.getByRole('link', { name: 'Back Subject' }).click();
      await expect(page).toHaveURL(new RegExp(`/subjects/${subject.id}$`));

      await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Subjects' }).click();
      await expect(page).toHaveURL(/\/subjects$/);
    });
  });

  test.describe('Assignment manager', () => {
    test('cannot create or delete assignments in a managed subject', async ({ page }) => {
      const am = await createUser({ username: 'am-assign', email: 'am-assign@test.com', role: 'assignment_manager' });
      const { subject, assignment } = await createHierarchy({
        subjectName: 'AM Subject',
        assignmentName: 'AM Assignment',
      });
      await createAssignment({ subjectId: subject.id, name: 'Other Assignment' });
      await assignManager(am.id, assignment.id);

      await loginAs(page, 'am-assign');
      await page.goto(`/subjects/${subject.id}`);

      // The AM can view the subject's assignments…
      await expect(page.getByText('AM Assignment')).toBeVisible();
      // …but has no create or delete controls (admin only)
      await expect(page.getByRole('button', { name: '+ Create Assignment' })).not.toBeVisible();
      await expect(page.locator('button[aria-label="Delete Assignment"]')).toHaveCount(0);
    });
  });
});
