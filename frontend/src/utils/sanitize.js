// Client-side XSS sanitization using DOMPurify.
// DOMPurify with ALLOWED_TAGS:[] strips all HTML including script content,
// which is stronger than a regex approach that only removes tags but preserves inner text.
// Mirrors backend/src/utils/sanitize.js.
import DOMPurify from 'dompurify';

/**
 * Strip all HTML from a string and trim whitespace.
 * Non-string values are returned as-is.
 */
export function sanitize(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}
