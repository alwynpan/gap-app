'use strict';

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');
const { cleanDatabase, createUser, createGroup } = require('../helpers/db');

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await cleanDatabase();
    await loginAs(page, 'admin', 'AdminPass123!');
  });

  test.describe('User management', () => {
    test('can create a new user via the UI', async ({ page }) => {
      await page.goto('/users');
      await page.getByRole('button', { name: /create user/i }).click();

      // Create User form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter username').fill('newuser');
      await page.getByPlaceholder('Enter email').fill('newuser@test.com');
      await page.getByPlaceholder('Enter first name').fill('New');
      await page.getByPlaceholder('Enter last name').fill('User');

      await page.getByRole('button', { name: /^create$/i }).click();

      // Newly created user should appear in the list
      await expect(page.getByText('newuser', { exact: true })).toBeVisible();
    });

    test('can edit a user profile', async ({ page }) => {
      await createUser({ username: 'editme', email: 'editme@test.com' });
      await page.goto('/users');
      await page.getByRole('button', { name: 'Edit User Profile' }).first().click();

      // Edit User form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter first name').fill('Edited');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('Edited')).toBeVisible();
    });

    test('can delete a user', async ({ page }) => {
      await createUser({ username: 'deleteme', email: 'deleteme@test.com' });
      await page.goto('/users');

      await page.getByRole('button', { name: 'Delete User' }).first().click();
      // Confirm deletion in modal — button text is "Delete 1 user"
      await page.getByRole('button', { name: /^Delete \d+ user/i }).click();

      await expect(page.getByText('deleteme', { exact: true })).not.toBeVisible();
    });
  });

  test.describe('Create User — error paths', () => {
    test('shows error when creating a user with a duplicate username', async ({ page }) => {
      await createUser({ username: 'dupeuser', email: 'dupeuser@test.com' });
      await page.goto('/users');
      await page.getByRole('button', { name: /create user/i }).click();

      await page.getByPlaceholder('Enter username').fill('dupeuser');
      await page.getByPlaceholder('Enter email').fill('unique@test.com');
      await page.getByPlaceholder('Enter first name').fill('Test');
      await page.getByPlaceholder('Enter last name').fill('User');

      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.locator('.bg-red-50')).toContainText('Username or email already in use');
    });

    test('shows error when creating a user with a duplicate email', async ({ page }) => {
      await createUser({ username: 'uniqueuser', email: 'dupe@test.com' });
      await page.goto('/users');
      await page.getByRole('button', { name: /create user/i }).click();

      await page.getByPlaceholder('Enter username').fill('anotheruser');
      await page.getByPlaceholder('Enter email').fill('dupe@test.com');
      await page.getByPlaceholder('Enter first name').fill('Test');
      await page.getByPlaceholder('Enter last name').fill('User');

      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.locator('.bg-red-50')).toContainText('Username or email already in use');
    });
  });

  test.describe('Group management', () => {
    test('can create a new group', async ({ page }) => {
      await page.goto('/groups');
      await page.getByRole('button', { name: /create group/i }).click();

      // Create Group form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter group name').fill('Test Group Alpha');
      await page.getByRole('button', { name: /^create$/i }).click();

      await expect(page.getByText('Test Group Alpha')).toBeVisible();
    });

    test('can edit a group name', async ({ page }) => {
      await createGroup({ name: 'OldGroupName' });
      await page.goto('/groups');

      // Use aria-label selector — <tr role="button"> also appears in getByRole('button') results
      await page.locator('button[aria-label="Edit Group"]').first().click();
      // Edit Group form uses placeholders — labels don't have htmlFor
      await page.getByPlaceholder('Enter group name').fill('NewGroupName');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('NewGroupName')).toBeVisible();
    });

    test('can delete a group', async ({ page }) => {
      await createGroup({ name: 'GroupToDelete' });
      await page.goto('/groups');

      // Use aria-label selector — <tr role="button"> also appears in getByRole('button') results
      await page.locator('button[aria-label="Delete Group"]').first().click();
      // Confirm deletion in modal — button text is "Delete 1 group"
      await page.getByRole('button', { name: /^Delete \d+ group/i }).click();

      await expect(page.getByText('GroupToDelete')).not.toBeVisible();
    });
  });
});
