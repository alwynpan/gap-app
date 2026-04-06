module.exports = {
  testEnvironment: 'node',
  // Set process.env BEFORE any modules are loaded
  setupFiles: ['<rootDir>/tests/integration/setup/setupEnv.js'],
  globalSetup: '<rootDir>/tests/integration/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/integration/setup/globalTeardown.js',
  testMatch: ['**/tests/integration/**/*.test.js'],
  // Longer timeout for container startup and real DB queries
  testTimeout: 30000,
  // Run sequentially to share one container (faster than per-file containers)
  maxWorkers: 1,
  // pg pool singletons are intentionally kept open across test files and drained
  // by forceExit when the worker process exits — this is expected with testcontainers.
  forceExit: true,
  coverageReporters: ['text', 'cobertura'],
  coverageDirectory: 'coverage-integration',
  collectCoverageFrom: ['src/**/*.js', '!src/db/migrate.js', '!src/config/**/*.js'],
  // Integration tests exercise API behaviour rather than exhaustive code paths,
  // so thresholds are intentionally lower than the unit test suite.
  // Unit tests (jest.config.js) enforce the 80%/85% thresholds on the same files.
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 80,
      lines: 70,
      statements: 70,
    },
  },
};
