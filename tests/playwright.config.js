'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  // All tests share one DB — run sequentially to avoid race conditions
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['allure-playwright', { outputFolder: 'allure-results', suiteTitle: true, detail: true }],
      ]
    : [
        ['list'],
        ['allure-playwright', { outputFolder: 'allure-results', suiteTitle: true, detail: true }],
      ],
  outputDir: './artifacts',

  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  globalSetup: './global-setup.js',
  globalTeardown: './global-teardown.js',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
