'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');
const { cleanDatabase, createUser, createHierarchy, addUserToSubject } = require('../helpers/db');

/**
 * Subject-first landing for students: multi-subject users pick a subject on
 * the dashboard (persisted in sessionStorage), single-subject users land
 * straight on their subject card.
 */
test.describe('Subject-first landing', () => {
  let alpha;
  let beta;

  test.beforeEach(async () => {
    await cleanDatabase();
    alpha = await createHierarchy({ subjectName: 'Landing Alpha', assignmentName: 'Landing A1' });
    beta = await createHierarchy({ subjectName: 'Landing Beta', assignmentName: 'Landing B1' });
  });

  test.describe('multi-subject student', () => {
    test.beforeEach(async ({ page }) => {
      const student = await createUser({ username: 'multisub', email: 'multisub@test.com', role: 'user' });
      await addUserToSubject(student.id, alpha.subject.id);
      await addUserToSubject(student.id, beta.subject.id);
      await loginAs(page, 'multisub');
    });

    test('sees the picker with both subjects', async ({ page }) => {
      await expect(page.getByText('Select your subject')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: /Landing Alpha/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Landing Beta/ })).toBeVisible();
      // No subject card is shown until one is picked
      await expect(page.getByRole('heading', { name: 'Landing Alpha' })).not.toBeVisible();
      await expect(page.getByRole('heading', { name: 'Landing Beta' })).not.toBeVisible();
    });

    test('picking a subject shows a single card with a Switch subject button', async ({ page }) => {
      await page.getByRole('button', { name: /Landing Alpha/ }).click();

      await expect(page.getByRole('heading', { name: 'Landing Alpha' })).toBeVisible();
      await expect(page.getByText('Landing A1')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Switch subject' })).toBeVisible();
      // Only the selected subject's card renders
      await expect(page.getByRole('heading', { name: 'Landing Beta' })).not.toBeVisible();
      await expect(page.getByText('Select your subject')).not.toBeVisible();
    });

    test('selection is remembered across a reload', async ({ page }) => {
      await page.getByRole('button', { name: /Landing Beta/ }).click();
      await expect(page.getByRole('heading', { name: 'Landing Beta' })).toBeVisible();

      await page.reload();

      await expect(page.getByRole('heading', { name: 'Landing Beta' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Select your subject')).not.toBeVisible();
      // The selection is persisted in sessionStorage
      const stored = await page.evaluate(() => window.sessionStorage.getItem('gap.currentSubject'));
      expect(stored).toBe(beta.subject.id);
    });

    test('Switch subject returns to the picker', async ({ page }) => {
      await page.getByRole('button', { name: /Landing Alpha/ }).click();
      await expect(page.getByRole('heading', { name: 'Landing Alpha' })).toBeVisible();

      await page.getByRole('button', { name: 'Switch subject' }).click();

      await expect(page.getByText('Select your subject')).toBeVisible();
      await expect(page.getByRole('button', { name: /Landing Alpha/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Landing Beta/ })).toBeVisible();

      // Picking the other subject works from here
      await page.getByRole('button', { name: /Landing Beta/ }).click();
      await expect(page.getByRole('heading', { name: 'Landing Beta' })).toBeVisible();
    });
  });

  test('single-subject student lands straight on the subject card without a picker', async ({ page }) => {
    const student = await createUser({ username: 'singlesub', email: 'singlesub@test.com', role: 'user' });
    await addUserToSubject(student.id, alpha.subject.id);
    await loginAs(page, 'singlesub');

    await expect(page.getByRole('heading', { name: 'Landing Alpha' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Select your subject')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch subject' })).not.toBeVisible();
  });

  test('student with no subject enrolment sees the not-enrolled empty state', async ({ page }) => {
    await createUser({ username: 'zerosub', email: 'zerosub@test.com', role: 'user' });
    await loginAs(page, 'zerosub');

    await expect(page.getByText('You are not enrolled in any subject yet. Contact your administrator.')).toBeVisible();
    await expect(page.getByText('Select your subject')).not.toBeVisible();
  });
});
