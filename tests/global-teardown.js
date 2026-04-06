'use strict';

module.exports = async function globalTeardown() {
  if (global.__E2E_TEARDOWN__) {
    await global.__E2E_TEARDOWN__();
  }
};
