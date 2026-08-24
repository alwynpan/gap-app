'use strict';

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('../helpers/auth');
const { cleanDatabase, createUser, createHierarchy, assignUserToGroup, query } = require('../helpers/db');

/**
 * Two-step typed confirmation for destructive deletes:
 * step 1 requires the exact entity name, step 2 requires the word "delete".
 */
test.describe('Typed deletion confirmation', () => {
  let subject;
  let assignment;
  let group;

  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    const created = await createHierarchy({
      subjectName: 'Doomed Subject',
      assignmentName: 'Doomed Assignment',
      groups: [{ name: 'Doomed Group' }],
    });
    subject = created.subject;
    assignment = created.assignment;
    group = created.groups[0];
    await createUser({ username: 'survivor', email: 'survivor@test.com' });
    await assignUserToGroup('survivor', group.id);
    await loginAsAdmin(page);
  });

  const nameInput = (page) => page.getByLabel('Confirmation name');
  const wordInput = (page) => page.getByLabel('Confirmation word');
  const continueBtn = (page) => page.getByRole('button', { name: 'Continue' });
  const deleteBtn = (page) => page.getByRole('button', { name: 'Delete', exact: true });

  test.describe('Subject deletion', () => {
    const openDeleteModal = async (page) => {
      await page.goto('/subjects');
      await page.locator('button[aria-label="Delete Subject"]').click();
      await expect(page.getByRole('heading', { name: 'Delete subject' })).toBeVisible();
    };

    test('Continue stays disabled until the exact subject name is typed', async ({ page }) => {
      await openDeleteModal(page);

      // Disabled initially
      await expect(continueBtn(page)).toBeDisabled();

      // Wrong name keeps it disabled
      await nameInput(page).fill('Wrong Subject');
      await expect(continueBtn(page)).toBeDisabled();

      // Case matters — a near miss keeps it disabled
      await nameInput(page).fill('doomed subject');
      await expect(continueBtn(page)).toBeDisabled();

      // Exact name enables Continue
      await nameInput(page).fill('Doomed Subject');
      await expect(continueBtn(page)).toBeEnabled();
    });

    test('step 2 requires the word "delete" and cascades on confirm; users survive', async ({ page }) => {
      await openDeleteModal(page);
      await nameInput(page).fill('Doomed Subject');
      await continueBtn(page).click();

      // Step 2 — Delete disabled until the exact word 'delete'
      await expect(wordInput(page)).toBeVisible();
      await expect(deleteBtn(page)).toBeDisabled();
      await wordInput(page).fill('remove');
      await expect(deleteBtn(page)).toBeDisabled();
      await wordInput(page).fill('delete');
      await expect(deleteBtn(page)).toBeEnabled();
      await deleteBtn(page).click();

      await expect(page.getByText('Subject deleted successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Doomed Subject')).not.toBeVisible();

      // DB cascade: subject, assignments, groups and memberships are gone…
      expect(await query('SELECT 1 FROM subjects WHERE id = $1', [subject.id])).toHaveLength(0);
      expect(await query('SELECT 1 FROM assignments WHERE id = $1', [assignment.id])).toHaveLength(0);
      expect(await query('SELECT 1 FROM groups WHERE id = $1', [group.id])).toHaveLength(0);
      expect(await query('SELECT 1 FROM user_groups WHERE group_id = $1', [group.id])).toHaveLength(0);
      expect(await query('SELECT 1 FROM user_subjects WHERE subject_id = $1', [subject.id])).toHaveLength(0);
      // …but the user account survives
      expect(await query("SELECT 1 FROM users WHERE username = 'survivor'")).toHaveLength(1);
    });

    test('Cancel at step 2 keeps the subject and resets the modal state', async ({ page }) => {
      await openDeleteModal(page);
      await nameInput(page).fill('Doomed Subject');
      await continueBtn(page).click();
      await expect(wordInput(page)).toBeVisible();
      await wordInput(page).fill('delete');
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Subject intact in UI and DB
      await expect(page.getByText('Doomed Subject')).toBeVisible();
      expect(await query('SELECT 1 FROM subjects WHERE id = $1', [subject.id])).toHaveLength(1);

      // Reopening starts back at step 1 with an empty input
      await page.locator('button[aria-label="Delete Subject"]').click();
      await expect(nameInput(page)).toBeVisible();
      await expect(nameInput(page)).toHaveValue('');
      await expect(continueBtn(page)).toBeDisabled();
    });
  });

  test.describe('Assignment deletion', () => {
    const openDeleteModal = async (page) => {
      await page.goto(`/subjects/${subject.id}`);
      await page.locator('button[aria-label="Delete Assignment"]').click();
      await expect(page.getByRole('heading', { name: 'Delete assignment' })).toBeVisible();
    };

    test('Continue stays disabled until the exact assignment name is typed', async ({ page }) => {
      await openDeleteModal(page);

      await expect(continueBtn(page)).toBeDisabled();
      await nameInput(page).fill('Wrong Assignment');
      await expect(continueBtn(page)).toBeDisabled();
      await nameInput(page).fill('Doomed Assignment');
      await expect(continueBtn(page)).toBeEnabled();
    });

    test('step 2 requires the word "delete" and cascades on confirm; subject and users survive', async ({ page }) => {
      await openDeleteModal(page);
      await nameInput(page).fill('Doomed Assignment');
      await continueBtn(page).click();

      await expect(wordInput(page)).toBeVisible();
      await expect(deleteBtn(page)).toBeDisabled();
      await wordInput(page).fill('remove');
      await expect(deleteBtn(page)).toBeDisabled();
      await wordInput(page).fill('delete');
      await expect(deleteBtn(page)).toBeEnabled();
      await deleteBtn(page).click();

      await expect(page.getByText('Assignment deleted successfully')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Doomed Assignment')).not.toBeVisible();

      // DB cascade: assignment, its groups and memberships are gone…
      expect(await query('SELECT 1 FROM assignments WHERE id = $1', [assignment.id])).toHaveLength(0);
      expect(await query('SELECT 1 FROM groups WHERE id = $1', [group.id])).toHaveLength(0);
      expect(await query('SELECT 1 FROM user_groups WHERE assignment_id = $1', [assignment.id])).toHaveLength(0);
      // …but the subject, its enrolments and the user survive
      expect(await query('SELECT 1 FROM subjects WHERE id = $1', [subject.id])).toHaveLength(1);
      expect(await query('SELECT 1 FROM user_subjects WHERE subject_id = $1', [subject.id])).toHaveLength(1);
      expect(await query("SELECT 1 FROM users WHERE username = 'survivor'")).toHaveLength(1);
    });

    test('Cancel at step 2 keeps the assignment and resets the modal state', async ({ page }) => {
      await openDeleteModal(page);
      await nameInput(page).fill('Doomed Assignment');
      await continueBtn(page).click();
      await expect(wordInput(page)).toBeVisible();
      await wordInput(page).fill('delete');
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByText('Doomed Assignment')).toBeVisible();
      expect(await query('SELECT 1 FROM assignments WHERE id = $1', [assignment.id])).toHaveLength(1);

      // Reopening starts back at step 1 with an empty input
      await page.locator('button[aria-label="Delete Assignment"]').click();
      await expect(nameInput(page)).toBeVisible();
      await expect(nameInput(page)).toHaveValue('');
      await expect(continueBtn(page)).toBeDisabled();
    });
  });
});
