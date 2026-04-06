const { Pool } = require('pg');
const dbConfig = require('../config/database');

const pool = new Pool(dbConfig);

// Prevent unhandled 'error' events on idle clients from crashing the process.
// This can happen in integration tests when the testcontainer is stopped while
// connections are still open, and in production during unexpected DB restarts.
pool.on('error', (err) => {
  // Suppress logging during any Jest run — integration tests set NODE_ENV=development
  // (for relaxed rate limits) so checking NODE_ENV alone is not sufficient.
  const isTestRun = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';
  if (!isTestRun) {
    // eslint-disable-next-line no-console
    console.error('Unexpected pg pool error:', err.message);
  }
});

module.exports = pool;
