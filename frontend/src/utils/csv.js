/**
 * Shared CSV utilities used by import/export features.
 */

/**
 * Parse a CSV text string into a 2D array of strings.
 * Handles quoted fields (including embedded commas and doubled-quote escapes).
 */
export function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const row = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]; // eslint-disable-line security/detect-object-injection
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

/**
 * Escape a single value for inclusion in a CSV file.
 * Wraps the value in quotes if it contains commas, quotes, or newlines.
 */
export function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV string from an array of row objects and trigger a browser download.
 * @param {Array<Object>} rows - Array of data objects
 * @param {string[]} headers - Column header names (must match object keys)
 * @param {string} filename - Filename for the downloaded file
 */
export function downloadCsv(rows, headers, filename) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(',')); // eslint-disable-line security/detect-object-injection
  }
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
