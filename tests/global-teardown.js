'use strict';

const { closePool } = require('./helpers/db');

module.exports = async function globalTeardown() {
  try {
    if (global.__E2E_TEARDOWN__) {
      await global.__E2E_TEARDOWN__();
    }
  } finally {
    await closePool();
  }
};
