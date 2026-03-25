'use strict';

// Server-side XSS sanitization using DOMPurify + jsdom (via isomorphic-dompurify).
// DOMPurify with ALLOWED_TAGS:[] strips all HTML including script content,
// which is stronger than a regex approach that only removes tags but preserves inner text.
const DOMPurify = require('isomorphic-dompurify');

/**
 * Strip all HTML from a string and trim whitespace.
 * Non-string values are returned as-is.
 * Mirrors frontend/src/utils/sanitize.js.
 */
function sanitize(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

module.exports = { sanitize };
