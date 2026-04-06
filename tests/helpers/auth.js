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
 * Enable the group join lock from the settings page.
 * Must be called while already logged in as admin (or will log in as admin).
 * Leaves the page at /settings.
 */
async function enableGroupJoinLock(page) {
  await loginAsAdmin(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Enable group join lock' }).click();
  // Wait for toggle to confirm the lock is active before continuing
  await expect(page.getByRole('button', { name: 'Disable group join lock' })).toBeVisible({ timeout: 5000 });
}

module.exports = { loginAs, loginAsAdmin, logout, enableGroupJoinLock, ADMIN_PASSWORD, DEFAULT_PASSWORD };
