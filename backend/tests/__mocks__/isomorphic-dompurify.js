'use strict';

// Lightweight mock of isomorphic-dompurify for Jest (node environment).
// The real package loads jsdom which pulls in ESM-only dependencies that
// Jest cannot transform. In unit tests, sanitization is a no-op — the
// route/schema logic under test does not depend on HTML stripping behaviour.
const DOMPurify = {
  sanitize: (value) => (typeof value === 'string' ? value.trim() : value),
};

module.exports = DOMPurify;
