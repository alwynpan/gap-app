/**
 * Shared HTTP helpers for e2e specs (also gives Jest something meaningful to cover).
 */
const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function waitForAPI(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.get(`${API_BASE}/health`, { timeout: 3000 });
      return;
    } catch (_error) {
      if (i === maxRetries - 1) {
        throw new Error('API not available after waiting');
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

module.exports = { API_BASE, waitForAPI };
