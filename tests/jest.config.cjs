/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/e2e/**/*.spec.js'],
  // Must exceed waitForAPI() worst case (~30s of retries) so beforeAll hooks do not abort early
  testTimeout: 60000,
  // Hit the same API; serial runs avoid global rate-limit races across files
  maxWorkers: 1,
  // E2E tests only exercise the API over HTTP; the backend runs in another process,
  // so Jest cannot measure server code here. We collect coverage for shared e2e helpers.
  collectCoverageFrom: ['e2e/api.js'],
  coverageDirectory: 'coverage',
};
