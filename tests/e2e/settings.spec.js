'use strict';

const { test, expect } = require('@playwright/test');
const { cleanDatabase, createUser, createHierarchy, createAssignment, addUserToSubject } = require('../helpers/db');
const { loginAsAdmin, loginAs, logout, lockAssignmentJoining } = require('../helpers/auth');

test.describe('Settings — per-assignment group join lock', () => {
  test.beforeEach(async () => {
    await cleanDatabase();
  });

  test('admin can navigate to settings from dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  });

  test('settings page lists each assignment with a lock toggle', async ({ page }) => {
    await createHierarchy({ subjectName: 'Lock Subject', assignmentName: 'Lock A1' });
    await loginAsAdmin(page);
    await page.goto('/settings');

    await expect(page.getByText('Group joining')).toBeVisible();
    await expect(page.getByText('Lock A1')).toBeVisible();
    await expect(page.getByText('Lock Subject')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lock group joining for Lock A1' })).toBeVisible();
  });

  test('admin can lock joining for one assignment', async ({ page }) => {
    await createHierarchy({ subjectName: 'Lock Subject', assignmentName: 'Lock A1' });
    await loginAsAdmin(page);
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Lock group joining for Lock A1' }).click();
    await expect(page.getByText('Group joining locked')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Unlock group joining for Lock A1' })).toBeVisible();
  });

  test('admin can unlock an assignment again', async ({ page }) => {
    await createHierarchy({ subjectName: 'Lock Subject', assignmentName: 'Lock A1' });
    await lockAssignmentJoining(page, 'Lock A1');

    await page.getByRole('button', { name: 'Unlock group joining for Lock A1' }).click();
    await expect(page.getByText('Group joining unlocked')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Lock group joining for Lock A1' })).toBeVisible();
  });

  test('locking one assignment leaves a sibling assignment open', async ({ page }) => {
    // Both assignments must live under ONE subject, so reuse it rather than
    // calling createHierarchy twice (subject names are unique).
    const { subject } = await createHierarchy({ subjectName: 'Two A Subject', assignmentName: 'Locked A' });
    await createAssignment({ subjectId: subject.id, name: 'Open A' });
    await lockAssignmentJoining(page, 'Locked A');

    await expect(page.getByRole('button', { name: 'Lock group joining for Open A' })).toBeVisible();
  });

  test('a locked assignment shows the locked message on the user dashboard', async ({ page }) => {
    const { subject } = await createHierarchy({ subjectName: 'Lock Subject', assignmentName: 'Lock A1' });
    const user = await createUser({ username: 'locktest', email: 'locktest@test.com' });
    await addUserToSubject(user.id, subject.id);

    await lockAssignmentJoining(page, 'Lock A1');
    // PublicRoute redirects authenticated users away from /login, so log out first
    await logout(page);
    await loginAs(page, 'locktest', 'TestPass123!');

    await expect(page.getByText('Group joining is locked for this assignment')).toBeVisible({ timeout: 10000 });
  });
});
