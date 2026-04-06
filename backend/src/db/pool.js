const { Pool } = require('pg');
const dbConfig = require('../config/database');

const pool = new Pool(dbConfig);

// Prevent unhandled 'error' events on idle clients from crashing the process.
// This can happen in integration tests when the testcontainer is stopped while
// connections are still open, and in production during unexpected DB restarts.
pool.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('Unexpected pg pool error:', err.message);
  }
});

module.exports = pool;
