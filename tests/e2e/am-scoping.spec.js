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

test.describe('Assignment manager scoping', () => {
  let managed; // { subject: S1, assignment: A1 }
  let unmanaged; // { subject: S2, assignment: A2 }

  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    const am = await createUser({ username: 'scopeam', email: 'scopeam@test.com', role: 'assignment_manager' });
    managed = await createHierarchy({ subjectName: 'Scoped S1', assignmentName: 'Scoped A1' });
    unmanaged = await createHierarchy({ subjectName: 'Scoped S2', assignmentName: 'Scoped A2' });
    await assignManager(am.id, managed.assignment.id);

    const user1 = await createUser({ username: 'scopeduser1', email: 'scopeduser1@test.com' });
    await addUserToSubject(user1.id, managed.subject.id);
    const user2 = await createUser({ username: 'scopeduser2', email: 'scopeduser2@test.com' });
    await addUserToSubject(user2.id, unmanaged.subject.id);

    await loginAs(page, 'scopeam');
  });

  test('sees only the managed subject on /subjects', async ({ page }) => {
    await page.goto('/subjects');
    await expect(page.getByText('Scoped S1')).toBeVisible();
    await expect(page.getByText('Scoped S2')).not.toBeVisible();
  });

  test('cannot open /users — redirected to dashboard (admin-only)', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('managed subject Members section lists S1 members but not S2-only members', async ({ page }) => {
    await page.goto(`/subjects/${managed.subject.id}`);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('scopeduser1', { exact: true })).toBeVisible();
    await expect(page.getByText('scopeduser2', { exact: true })).not.toBeVisible();
  });

  test('can create and delete a group in the managed assignment via the UI', async ({ page }) => {
    await page.goto(`/subjects/${managed.subject.id}/assignments/${managed.assignment.id}`);

    // Create
    await page.getByRole('button', { name: '+ Create Group' }).click();
    await page.getByPlaceholder('Enter group name').fill('AM Created Group');
    await page.getByRole('button', { name: /^create$/i }).click();
    await expect(page.getByText('Group created successfully')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('AM Created Group')).toBeVisible();

    // Delete
    await page.locator('button[aria-label="Delete Group"]').click();
    await page.getByRole('button', { name: /^Delete \d+ group/i }).click();
    await expect(page.getByText('Group deleted successfully')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('AM Created Group')).not.toBeVisible();
  });

  test('managed assignment shows management controls; groups are manageable', async ({ page }) => {
    await createGroup({ assignmentId: managed.assignment.id, name: 'Managed Group' });
    await page.goto(`/subjects/${managed.subject.id}/assignments/${managed.assignment.id}`);

    await expect(page.getByText('Managed Group')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Create Group' })).toBeVisible();
    const row = page.locator('table tbody tr').filter({ hasText: 'Managed Group' });
    await expect(row.locator('button[aria-label="Edit Group"]')).toBeVisible();
    await expect(row.locator('button[aria-label="Delete Group"]')).toBeVisible();
  });

  test('direct navigation to the unmanaged assignment offers no management controls', async ({ page }) => {
    await createGroup({ assignmentId: unmanaged.assignment.id, name: 'Unmanaged Group' });
    await page.goto(`/subjects/${unmanaged.subject.id}/assignments/${unmanaged.assignment.id}`);

    // The backend refuses the data (403) — nothing manageable is rendered
    await expect(page.getByText('Failed to load groups')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '+ Create Group' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Bulk Create' })).not.toBeVisible();
    await expect(page.locator('button[aria-label="Delete Group"]')).toHaveCount(0);
    await expect(page.getByText('Unmanaged Group')).not.toBeVisible();
  });

  test('cannot open the unmanaged subject detail page', async ({ page }) => {
    await page.goto(`/subjects/${unmanaged.subject.id}`);
    await expect(page.getByText('Failed to load subject')).toBeVisible({ timeout: 10000 });
    // No assignments of the unmanaged subject are leaked
    await expect(page.getByText('Scoped A2')).not.toBeVisible();
  });
});
