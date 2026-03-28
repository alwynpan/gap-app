/**
 * Shared HTTP helpers for e2e specs (also gives Jest something meaningful to cover).
 */
const axios = require('axios');

const BASE_URL = process.env.API_BASE || 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api`;

async function waitForAPI(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.get(`${BASE_URL}/health`, { timeout: 3000 });
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
