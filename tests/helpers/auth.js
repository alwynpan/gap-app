'use strict';

const { expect } = require('@playwright/test');

const ADMIN_PASSWORD = 'AdminPass123!';
const DEFAULT_PASSWORD = 'TestPass123!';

async function loginAs(page, username, password = DEFAULT_PASSWORD) {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

async function loginAsAdmin(page) {
  return loginAs(page, 'admin', ADMIN_PASSWORD);
}

async function logout(page) {
  // Open user menu via the aria-haspopup trigger in the header
  await page.locator('button[aria-haspopup="true"]').click();
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForURL('**/login', { timeout: 10000 });
}

/**
 * Lock group joining for ONE assignment through the settings UI.
 * The lock is per assignment, so the caller names which one.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} assignmentName Row to toggle, as shown on /settings.
 */
async function lockAssignmentJoining(page, assignmentName) {
  await loginAsAdmin(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: `Lock group joining for ${assignmentName}` }).click();
  // Wait for the toggle to flip before continuing
  await expect(page.getByRole('button', { name: `Unlock group joining for ${assignmentName}` })).toBeVisible({
    timeout: 5000,
  });
}

module.exports = { loginAs, loginAsAdmin, logout, lockAssignmentJoining, ADMIN_PASSWORD, DEFAULT_PASSWORD };
