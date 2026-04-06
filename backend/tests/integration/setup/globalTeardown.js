'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONTAINER_CONFIG_FILE = path.join(os.tmpdir(), 'gap-integration-container.json');

module.exports = async () => {
  // Stop the container via the reference stored by globalSetup.
  // globalSetup and globalTeardown share the same Jest process (Jest 28+).
  if (global.__TESTCONTAINER_STOP__) {
    await global.__TESTCONTAINER_STOP__();
  }

  // Clean up temp config file.
  if (fs.existsSync(CONTAINER_CONFIG_FILE)) {
    fs.unlinkSync(CONTAINER_CONFIG_FILE);
  }
};
