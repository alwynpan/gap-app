'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs, logout } = require('../helpers/auth');
const {
  cleanDatabase,
  createUser,
  createHierarchy,
  addUserToSubject,
  assignManager,
  assignUserToGroup,
  query,
} = require('../helpers/db');

const SUSPEND_WARNING =
  'Suspending removes their group memberships in this subject. Re-enabling will NOT restore groups.';

/**
 * Per-subject suspension: an assignment manager suspends a student from a
 * managed subject, which deletes the student's group memberships in that
 * subject only; re-enabling restores subject access but not groups.
 */
test.describe('Subject member suspension', () => {
  let s1; // { subject, assignment, groups } — managed by the AM
  let s2; // second enrolment, untouched by suspension
  let student;

  test.beforeEach(async () => {
    await cleanDatabase();
    s1 = await createHierarchy({
      subjectName: 'Susp S1',
      assignmentName: 'Susp A1',
      groups: [{ name: 'S1 Group' }],
    });
    s2 = await createHierarchy({
      subjectName: 'Susp S2',
      assignmentName: 'Susp A2',
      groups: [{ name: 'S2 Group' }],
    });

    student = await createUser({ username: 'suspstudent', email: 'suspstudent@test.com', role: 'user' });
    // Enrols the student in both subjects and places them in a group in each
    await assignUserToGroup('suspstudent', s1.groups[0].id);
    await assignUserToGroup('suspstudent', s2.groups[0].id);

    const am = await createUser({ username: 'suspam', email: 'suspam@test.com', role: 'assignment_manager' });
    await assignManager(am.id, s1.assignment.id);
  });

  test('AM suspends and re-enables a student; groups are removed in that subject only', async ({ page }) => {
    test.setTimeout(120000);

    // ── 1. AM opens the managed subject and sees the Members section ──────
    await loginAs(page, 'suspam');
    await page.goto(`/subjects/${s1.subject.id}`);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });

    const row = page.locator('table tbody tr').filter({ hasText: 'suspstudent' });
    await expect(row).toBeVisible();

    // ── 2. Suspend — confirm modal warns about group membership removal ───
    await row.locator('button[aria-label="Suspend Member"]').click();
    await expect(page.getByRole('heading', { name: 'Suspend suspstudent?' })).toBeVisible();
    await expect(page.getByText(SUSPEND_WARNING)).toBeVisible();
    await page.getByRole('button', { name: 'Suspend', exact: true }).click();

    await expect(page.getByText('Member suspended')).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('Suspended', { exact: true })).toBeVisible();

    // ── 3. DB: S1 group membership deleted, S2 membership intact ──────────
    const s1Groups = await query('SELECT * FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
      student.id,
      s1.assignment.id,
    ]);
    expect(s1Groups).toHaveLength(0);

    const s2Groups = await query('SELECT * FROM user_groups WHERE user_id = $1 AND assignment_id = $2', [
      student.id,
      s2.assignment.id,
    ]);
    expect(s2Groups).toHaveLength(1);

    const s1Membership = await query('SELECT enabled FROM user_subjects WHERE user_id = $1 AND subject_id = $2', [
      student.id,
      s1.subject.id,
    ]);
    expect(s1Membership[0].enabled).toBe(false);
    const s2Membership = await query('SELECT enabled FROM user_subjects WHERE user_id = $1 AND subject_id = $2', [
      student.id,
      s2.subject.id,
    ]);
    expect(s2Membership[0].enabled).toBe(true);

    // ── 4. Student sees only S2 — single remaining subject auto-selected ──
    await logout(page);
    await loginAs(page, 'suspstudent');
    await expect(page.getByRole('heading', { name: 'Susp S2' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Select your subject')).not.toBeVisible();
    await expect(page.getByText('Susp S1')).not.toBeVisible();
    // Their S2 group membership is untouched
    await expect(page.getByText(/your group:/i)).toBeVisible();
    await expect(page.getByText('S2 Group')).toBeVisible();

    // ── 5. AM re-enables the student ───────────────────────────────────────
    await logout(page);
    await loginAs(page, 'suspam');
    await page.goto(`/subjects/${s1.subject.id}`);
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[aria-label="Enable Member"]').click();
    await expect(page.getByText('Member enabled')).toBeVisible({ timeout: 5000 });
    await expect(row.getByText('Suspended', { exact: true })).not.toBeVisible();

    // ── 6. Student sees S1 again, but is no longer grouped there ──────────
    await logout(page);
    // Clear the persisted subject selection so the picker state is deterministic
    await page.evaluate(() => window.sessionStorage.clear());
    await loginAs(page, 'suspstudent');

    // Two subjects again → picker offers both
    await expect(page.getByText('Select your subject')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Susp S1/ }).click();

    await expect(page.getByRole('heading', { name: 'Susp S1' })).toBeVisible();
    // Re-enabling does not restore groups — S1 Group is joinable again
    await expect(page.getByText(/your group:/i)).not.toBeVisible();
    await expect(page.getByText('S1 Group')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  });

  test('AM who does not manage the subject sees no Members section', async ({ page }) => {
    // Enrolled as a member of S1 but managing nothing in it — the page loads
    // (member read access) without any member-management UI.
    const otherAm = await createUser({ username: 'otheram', email: 'otheram@test.com', role: 'assignment_manager' });
    await addUserToSubject(otherAm.id, s1.subject.id);

    await loginAs(page, 'otheram');
    await page.goto(`/subjects/${s1.subject.id}`);

    await expect(page.getByRole('heading', { name: 'Susp S1' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Assignments in this subject')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members' })).not.toBeVisible();
    await expect(page.locator('button[aria-label="Suspend Member"]')).toHaveCount(0);
  });

  test('regular user is route-guarded away from the subject detail page', async ({ page }) => {
    await loginAs(page, 'suspstudent');
    await page.goto(`/subjects/${s1.subject.id}`);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
