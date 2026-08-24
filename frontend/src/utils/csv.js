/**
 * Shared CSV utilities used by import/export features.
 */

/**
 * Parse a CSV text string into a 2D array of strings.
 *
 * Scans the whole document with quote state preserved across line breaks, so a
 * quoted field containing a newline — which csvEscape below deliberately emits —
 * survives an export/import round trip instead of splitting into two rows.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  let sawContent = false;

  const endField = () => {
    row.push(cur.trim());
    cur = '';
  };
  const endRow = () => {
    endField();
    // Skip blank lines only. A row of empty fields (",,,") is real data with
    // missing values and must still reach the caller's own validation.
    const isBlankLine = row.length === 1 && row[0] === '' && !sawContent;
    if (!isBlankLine) {
      rows.push(row);
    }
    row = [];
    sawContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]; // eslint-disable-line security/detect-object-injection

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      sawContent = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n') {
      endRow();
    } else if (c !== '\r') {
      cur += c;
    }
  }

  // Trailing row without a final newline
  if (cur !== '' || row.length > 0) {
    endRow();
  }

  return rows;
}

// Spreadsheet apps evaluate a cell starting with any of these as a formula, so a
// user-supplied name or group name could execute on open.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Escape a single value for inclusion in a CSV file.
 *
 * Neutralises spreadsheet formula injection by prefixing an apostrophe, then
 * quotes the value if it contains commas, quotes, or newlines.
 */
export function csvEscape(value) {
  let str = value === null || value === undefined ? '' : String(value);

  // Check the raw first character as well as the first non-space one: a leading
  // tab or CR is itself a trigger, and trimStart() would hide it.
  const raw = str.charAt(0);
  const firstMeaningful = str.trimStart().charAt(0);
  if (FORMULA_TRIGGERS.includes(raw) || FORMULA_TRIGGERS.includes(firstMeaningful)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
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
