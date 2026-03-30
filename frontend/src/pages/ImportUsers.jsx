import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Check, AlertTriangle, ChevronDown } from 'lucide-react';
import Header from '../components/Header.jsx';
import CsvDropzone from '../components/CsvDropzone.jsx';
import { sanitize } from '../utils/sanitize.js';
import { parseCsv } from '../utils/csv.js';
import { API_BASE } from '../config.js';

const FIELD_OPTIONS = [
  { value: '', label: '— Skip —' },
  { value: 'username', label: 'Username' },
  { value: 'email', label: 'Email' },
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'studentId', label: 'Student ID' },
  { value: 'fullNameFL', label: 'Full Name (First, Last)' },
  { value: 'fullNameLF', label: 'Full Name (Last, First)' },
];

const REQUIRED_FIELDS = ['username', 'email'];

// Name fields form a mutually-exclusive group: selecting any one of them
// removes related options from other column dropdowns.
const NAME_FIELDS = new Set(['firstName', 'lastName', 'fullNameFL', 'fullNameLF']);
const FULL_NAME_FIELDS = new Set(['fullNameFL', 'fullNameLF']);

/**
 * Return the FIELD_OPTIONS available for a given column, excluding values
 * already selected in other columns.  Name fields use group logic:
 *  – if firstName or lastName is taken → hide that field + both fullName options
 *  – if a fullName option is taken → hide firstName, lastName, and both fullName options
 *
 * @param {number}  columnIndex    – the column we're computing options for
 * @param {Object}  currentMapping – full mapping state
 * @param {boolean} strict         – when true, apply strict name-group rules
 *   (used by the clearing logic). When false (default, used for rendering),
 *   a column that already holds a name field sees all name options so the
 *   user can switch between them.
 */
function getAvailableOptions(columnIndex, currentMapping, strict = false) {
  const currentValue = currentMapping[columnIndex] || ''; // eslint-disable-line security/detect-object-injection
  // When rendering, if this column already has a name field we show all name
  // options so the user can switch (the onChange cascade-clears conflicts).
  const allowNameSwitch = !strict && NAME_FIELDS.has(currentValue);

  // Collect values used by OTHER columns
  const usedElsewhere = new Set();
  // Track which name-group exclusions are triggered by other columns
  const excludeNameFields = new Set();

  for (const [idx, value] of Object.entries(currentMapping)) {
    if (Number(idx) === columnIndex || !value) {
      continue;
    }
    usedElsewhere.add(value);

    if (NAME_FIELDS.has(value)) {
      if (FULL_NAME_FIELDS.has(value)) {
        excludeNameFields.add('firstName');
        excludeNameFields.add('lastName');
        excludeNameFields.add('fullNameFL');
        excludeNameFields.add('fullNameLF');
      } else {
        excludeNameFields.add(value);
        excludeNameFields.add('fullNameFL');
        excludeNameFields.add('fullNameLF');
      }
    }
  }

  return FIELD_OPTIONS.filter((o) => {
    if (!o.value) {
      return true;
    } // always show "— Skip —"
    if (NAME_FIELDS.has(o.value)) {
      if (allowNameSwitch) {
        return true;
      }
      if (excludeNameFields.has(o.value)) {
        return false;
      }
      return true;
    }
    // Non-name field: hide if taken by another column
    if (usedElsewhere.has(o.value)) {
      return false;
    }
    return true;
  });
}

const HEADER_SYNONYMS = {
  username: ['username', 'user', 'login', 'user name'],
  email: ['email', 'e-mail', 'mail', 'email address'],
  firstName: ['first name', 'firstname', 'first', 'given name', 'given'],
  lastName: ['last name', 'lastname', 'last', 'surname', 'family name', 'family'],
  studentId: ['student id', 'studentid', 'sid', 'student number', 'student no', 'id number'],
  fullNameFL: ['full name', 'fullname', 'name'],
  fullNameLF: ['name (last, first)', 'last, first'],
};

function autoDetect(headers) {
  const result = {};
  const assigned = new Set();
  headers.forEach((h, i) => {
    const norm = h.toLowerCase().trim();
    let matched = false;
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      if (synonyms.includes(norm) && !assigned.has(field)) {
        result[i] = field; // eslint-disable-line security/detect-object-injection
        assigned.add(field);
        // If a name field is assigned, block conflicting name fields
        if (FULL_NAME_FIELDS.has(field)) {
          assigned.add('firstName');
          assigned.add('lastName');
          assigned.add('fullNameFL');
          assigned.add('fullNameLF');
        } else if (field === 'firstName' || field === 'lastName') {
          assigned.add('fullNameFL');
          assigned.add('fullNameLF');
        }
        matched = true;
        return;
      }
    }
    if (!matched) {
      result[i] = ''; // eslint-disable-line security/detect-object-injection
    }
  });
  return result;
}

function applyMapping(rawRow, mapping, colCount) {
  const user = {};
  for (let i = 0; i < colCount; i++) {
    const field = mapping[i] || ''; // eslint-disable-line security/detect-object-injection
    const val = (rawRow[i] || '').trim(); // eslint-disable-line security/detect-object-injection
    if (!field || !val) {
      continue;
    }
    switch (field) {
      case 'username':
        user.username = val;
        break;
      case 'email':
        user.email = val;
        break;
      case 'firstName':
        user.firstName = val;
        break;
      case 'lastName':
        user.lastName = val;
        break;
      case 'studentId':
        user.studentId = val;
        break;
      case 'fullNameFL': {
        const ci = val.indexOf(',');
        if (ci !== -1) {
          if (!user.firstName) {
            user.firstName = val.slice(0, ci).trim();
          }
          if (!user.lastName) {
            user.lastName = val.slice(ci + 1).trim();
          }
        } else {
          const parts = val.split(/\s+/).filter(Boolean);
          if (!user.firstName) {
            user.firstName = parts[0] || '';
          }
          if (!user.lastName) {
            user.lastName = parts.slice(1).join(' ') || '';
          }
        }
        break;
      }
      case 'fullNameLF': {
        const ci = val.indexOf(',');
        if (ci !== -1) {
          if (!user.lastName) {
            user.lastName = val.slice(0, ci).trim();
          }
          if (!user.firstName) {
            user.firstName = val.slice(ci + 1).trim();
          }
        } else {
          const parts = val.split(/\s+/).filter(Boolean);
          if (!user.lastName) {
            user.lastName = parts[0] || '';
          }
          if (!user.firstName) {
            user.firstName = parts.slice(1).join(' ') || '';
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return user;
}

function getMissingFields(user) {
  const missing = REQUIRED_FIELDS.filter((f) => !user[f]); // eslint-disable-line security/detect-object-injection
  if (!user.firstName && !user.lastName) {
    missing.push('firstName', 'lastName');
  }
  return missing;
}

// ── Step indicator ─────────────────────────────────────────────────────────

const STEPS = ['Upload', 'Map Columns', 'Preview', 'Result'];

function StepIndicator({ current }) {
  return (
    <ol className="flex items-center gap-0 mb-8">
      {STEPS.map((label, idx) => {
        const n = idx + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={n} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${
                  done
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : active
                      ? 'border-primary-600 text-primary-600'
                      : 'border-gray-300 text-gray-400'
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : n}
              </span>
              <span
                className={`text-sm ${active ? 'font-semibold text-primary-700' : done ? 'text-gray-600' : 'text-gray-400'}`}
              >
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && <div className="mx-3 h-px w-10 bg-gray-300" />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ImportUsers() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // Step 1
  const [fileName, setFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [parseError, setParseError] = useState('');

  // Step 2
  const [mapping, setMapping] = useState({});
  const [mappingError, setMappingError] = useState('');
  const [sendSetupEmail, setSendSetupEmail] = useState(false);

  // Step 3
  const [previewRows, setPreviewRows] = useState([]);
  const [existingByUsername, setExistingByUsername] = useState(new Map());
  const [existingByEmail, setExistingByEmail] = useState(new Map());
  const [existingByStudentId, setExistingByStudentId] = useState(new Map());
  const [conflictAction, setConflictAction] = useState('skip');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step 4
  const [result, setResult] = useState(null);

  // ── File handling ────────────────────────────────────────────────────────

  const processFile = (file) => {
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a CSV (.csv) file.');
      return;
    }
    setParseError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const rows = parseCsv(evt.target.result);
        if (rows.length < 2) {
          setParseError('CSV must contain a header row and at least one data row.');
          return;
        }
        const headers = rows[0];
        const dataRows = rows.slice(1).filter((r) => r.some((c) => c));
        if (dataRows.length === 0) {
          setParseError('No data rows found in the CSV.');
          return;
        }
        setCsvHeaders(headers);
        setCsvRows(dataRows);
        setFileName(file.name);
        setMapping(autoDetect(headers));
        setStep(2);
      } catch {
        setParseError('Failed to parse the CSV file. Please check it is valid UTF-8.');
      }
    };
    reader.onerror = () => {
      setParseError('Failed to read file. Please try again.');
    };
    reader.readAsText(file);
  };

  // ── Step 2 → 3 ──────────────────────────────────────────────────────────

  const validateMapping = () => {
    const mapped = new Set(Object.values(mapping));
    // username and email are always required
    const missing = REQUIRED_FIELDS.filter((f) => f !== 'firstName' && f !== 'lastName' && !mapped.has(f));
    // Name requirement: at least one of firstName/lastName, or a full-name field
    const hasFullName = mapped.has('fullNameFL') || mapped.has('fullNameLF');
    const hasAnyName = mapped.has('firstName') || mapped.has('lastName');
    if (!hasFullName && !hasAnyName) {
      missing.push('firstName');
      missing.push('lastName');
    }
    if (missing.length > 0) {
      const labels = missing.map((f) => FIELD_OPTIONS.find((o) => o.value === f)?.label || f);
      return `Required fields not mapped: ${labels.join(', ')}`;
    }
    return null;
  };

  const loadPreview = async () => {
    const err = validateMapping();
    if (err) {
      setMappingError(err);
      return;
    }
    setMappingError('');
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await axios.get(`${API_BASE}/users`);
      const existing = res.data.users || [];
      const byUname = new Map(existing.map((u) => [u.username?.toLowerCase(), u]));
      const byMail = new Map(existing.map((u) => [u.email?.toLowerCase(), u]));
      const bySid = new Map(existing.filter((u) => u.student_id).map((u) => [u.student_id.toLowerCase(), u]));
      setExistingByUsername(byUname);
      setExistingByEmail(byMail);
      setExistingByStudentId(bySid);

      // Track seen values to detect intra-CSV duplicates
      const seenUsernames = new Set();
      const seenEmails = new Set();
      const seenStudentIds = new Set();
      const rows = csvRows.map((rawRow, idx) => {
        const user = applyMapping(rawRow, mapping, csvHeaders.length);
        const uname = user.username?.toLowerCase();
        const mail = user.email?.toLowerCase();
        const sid = user.studentId?.toLowerCase();
        const duplicate =
          (uname && seenUsernames.has(uname)) || (mail && seenEmails.has(mail)) || (sid && seenStudentIds.has(sid));
        if (uname) {
          seenUsernames.add(uname);
        }
        if (mail) {
          seenEmails.add(mail);
        }
        if (sid) {
          seenStudentIds.add(sid);
        }
        return { ...user, _rowIndex: idx + 1, _missing: getMissingFields(user), _duplicate: duplicate };
      });
      setPreviewRows(rows);
      setStep(3);
    } catch (e) {
      setPreviewError(e.response?.data?.error || 'Failed to load existing users for conflict check.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Conflict status (computed, not stored) ───────────────────────────────

  const getConflictStatus = (row) => {
    if (row._duplicate) {
      return 'duplicate';
    }
    const byUsername = row.username && existingByUsername.get(row.username.toLowerCase());
    if (byUsername) {
      if (conflictAction === 'skip') {
        return 'skip';
      }
      if (byUsername.role_name === 'admin' || byUsername.role_name === 'assignment_manager') {
        return 'protected';
      }
      // When overwriting, check if the incoming email/studentId belongs to a different user
      const emailOwner = row.email && existingByEmail.get(row.email.toLowerCase());
      if (emailOwner && emailOwner.id !== byUsername.id) {
        return 'conflict';
      }
      const sidOwner = row.studentId && existingByStudentId.get(row.studentId.toLowerCase());
      if (sidOwner && sidOwner.id !== byUsername.id) {
        return 'conflict';
      }
      return 'overwrite';
    }
    // Check if email or studentId is taken by a DIFFERENT existing user
    if (row.email && existingByEmail.get(row.email.toLowerCase())) {
      return 'conflict';
    }
    if (row.studentId && existingByStudentId.get(row.studentId.toLowerCase())) {
      return 'conflict';
    }
    return 'new';
  };

  // ── Import ───────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const validUsers = previewRows
        .filter((r) => {
          if (r._missing.length > 0 || r._duplicate) {
            return false;
          }
          const st = getConflictStatus(r);
          return st !== 'conflict';
        })
        .map(({ _rowIndex, _missing, _duplicate, ...user }) => {
          const clean = {};
          for (const [k, v] of Object.entries(user)) {
            clean[k] = typeof v === 'string' ? sanitize(v) : v; // eslint-disable-line security/detect-object-injection
          }
          return clean;
        });

      const res = await axios.post(`${API_BASE}/users/import`, {
        users: validUsers,
        conflictAction,
        sendSetupEmail,
      });
      setResult({
        ...res.data,
        skippedInvalid: previewRows.filter((r) => r._missing.length > 0 || r._duplicate).length,
      });
      setStep(4);
    } catch (e) {
      setSubmitError(e.response?.data?.error || 'Import failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep(1);
    setFileName('');
    setCsvHeaders([]);
    setCsvRows([]);
    setParseError('');
    setMapping({});
    setMappingError('');
    setSendSetupEmail(false);
    setPreviewRows([]);
    setExistingByUsername(new Map());
    setExistingByEmail(new Map());
    setExistingByStudentId(new Map());
    setConflictAction('skip');
    setPreviewError('');
    setSubmitError('');
    setResult(null);
  };

  // ── Preview summary counts ───────────────────────────────────────────────

  const newCount = previewRows.filter(
    (r) => r._missing.length === 0 && !r._duplicate && getConflictStatus(r) === 'new'
  ).length;
  const conflictCount = previewRows.filter(
    (r) => r._missing.length === 0 && !r._duplicate && ['skip', 'overwrite', 'protected'].includes(getConflictStatus(r))
  ).length;
  const duplicateCount = previewRows.filter((r) => r._missing.length === 0 && r._duplicate).length;
  const unresolvableCount = previewRows.filter(
    (r) => r._missing.length === 0 && !r._duplicate && getConflictStatus(r) === 'conflict'
  ).length;
  const invalidCount = previewRows.filter((r) => r._missing.length > 0).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 bg-gray-50">
      <Header pageName="Import Users" />

      <main className="w-[85%] mx-auto py-6">
        <div className="px-4 py-6 sm:px-0 max-w-5xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => navigate('/users')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Users
            </button>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Users from CSV</h2>
          <p className="text-gray-500 text-sm mb-6">
            Upload a CSV file, map its columns to user fields, review conflicts, then import.
          </p>

          <StepIndicator current={step} />

          {/* ── Step 1: Upload ────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload CSV File</h3>

              <CsvDropzone onFile={processFile} />

              {parseError && (
                <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {parseError}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button onClick={() => navigate('/users')} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Map Columns ───────────────────────────────────────── */}
          {step === 2 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Map Columns</h3>
              <p className="text-sm text-gray-500 mb-6">
                File: <span className="font-medium text-gray-700">{fileName}</span> &nbsp;·&nbsp; {csvRows.length} data
                row{csvRows.length !== 1 ? 's' : ''}
              </p>

              <div className="overflow-x-auto mb-6">
                <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {csvHeaders.map((h, i) => (
                        <th key={i} className="px-4 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                          {h || <span className="text-gray-400 italic">Column {i + 1}</span>}
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-primary-50">
                      {csvHeaders.map((_, i) => {
                        const colMapping = mapping[i] || ''; // eslint-disable-line security/detect-object-injection
                        const availableOpts = getAvailableOptions(i, mapping);
                        return (
                          <th key={i} className="px-3 py-2 border-b border-gray-200">
                            <div className="relative">
                              <select
                                value={colMapping}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  setMapping((prev) => {
                                    const next = { ...prev, [i]: newValue };
                                    // Clear other columns whose values are no longer valid
                                    for (const [idx, val] of Object.entries(next)) {
                                      if (Number(idx) === i || !val) {
                                        continue;
                                      }
                                      const available = getAvailableOptions(Number(idx), next, true);
                                      if (!available.some((o) => o.value === val)) {
                                        next[idx] = ''; // eslint-disable-line security/detect-object-injection
                                      }
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={`Map column ${i + 1}`}
                                className="w-full appearance-none border border-gray-300 rounded-md pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                              >
                                {availableOpts.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 3).map((row, ri) => (
                      <tr key={ri} className="border-b border-gray-100 last:border-0">
                        {csvHeaders.map((_, ci) => {
                          const cellVal = row[ci]; // eslint-disable-line security/detect-object-injection
                          return (
                            <td key={ci} className="px-4 py-2 text-gray-600 max-w-[180px] truncate">
                              {cellVal || <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {csvRows.length > 3 && (
                      <tr>
                        <td colSpan={csvHeaders.length} className="px-4 py-2 text-center text-xs text-gray-400 italic">
                          … and {csvRows.length - 3} more row{csvRows.length - 3 !== 1 ? 's' : ''}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {mappingError && (
                <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {mappingError}
                </div>
              )}

              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendSetupEmail}
                    onChange={(e) => setSendSetupEmail(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      Send &ldquo;Set Password&rdquo; email to new users
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Each new user will receive an email with a link to set their password. Not sent for overwritten
                      accounts.
                    </p>
                  </div>
                </label>
              </div>

              {previewError && (
                <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {previewError}
                </div>
              )}

              <div className="flex justify-between items-center">
                <button
                  onClick={() => {
                    setStep(1);
                    setMappingError('');
                    setPreviewError('');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={loadPreview}
                  disabled={previewLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {previewLoading ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Loading…
                    </>
                  ) : (
                    <>
                      Preview Import
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Preview ───────────────────────────────────────────── */}
          {step === 3 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Import Preview</h3>
              <p className="text-sm text-gray-500 mb-4">
                Review the users to be imported. Rows with missing required fields are shown but will be skipped.
              </p>

              {/* Summary */}
              <div className="flex gap-3 mb-5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-medium">
                  <Check className="w-3.5 h-3.5" />
                  {newCount} new
                </span>
                {conflictCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full text-xs font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
                  </span>
                )}
                {duplicateCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-full text-xs font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} in file
                  </span>
                )}
                {unresolvableCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-full text-xs font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {unresolvableCount} conflict{unresolvableCount !== 1 ? 's' : ''} (email/ID taken)
                  </span>
                )}
                {invalidCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {invalidCount} invalid (will skip)
                  </span>
                )}
              </div>

              {/* Options */}
              <div className="flex flex-wrap gap-6 mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                <fieldset>
                  <legend className="font-medium text-gray-700 mb-2">For existing users:</legend>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictAction"
                        value="skip"
                        checked={conflictAction === 'skip'}
                        onChange={() => setConflictAction('skip')}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span>Skip</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictAction"
                        value="overwrite"
                        checked={conflictAction === 'overwrite'}
                        onChange={() => setConflictAction('overwrite')}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span>Overwrite (email, first/last name, student ID)</span>
                    </label>
                  </div>
                </fieldset>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200 mb-5">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        #
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        First Name
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Name
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student ID
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.map((row) => {
                      const status = row._missing.length > 0 ? 'invalid' : getConflictStatus(row);
                      const rowCls =
                        status === 'invalid'
                          ? 'bg-red-50'
                          : status === 'skip'
                            ? 'bg-yellow-50'
                            : status === 'overwrite'
                              ? 'bg-blue-50'
                              : status === 'protected'
                                ? 'bg-orange-50'
                                : status === 'duplicate'
                                  ? 'bg-purple-50'
                                  : status === 'conflict'
                                    ? 'bg-orange-50'
                                    : '';
                      return (
                        <tr key={row._rowIndex} className={rowCls}>
                          <td className="px-3 py-2 text-gray-400 text-xs">{row._rowIndex}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.username || <span className="text-red-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.email || <span className="text-red-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.firstName || <span className="text-red-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.lastName || <span className="text-red-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{row.studentId || '—'}</td>
                          <td className="px-3 py-2">
                            {status === 'new' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                <Check className="w-3 h-3" /> New
                              </span>
                            )}
                            {status === 'skip' && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                Existing – skip
                              </span>
                            )}
                            {status === 'overwrite' && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                Existing – overwrite
                              </span>
                            )}
                            {status === 'protected' && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                Protected – cannot overwrite
                              </span>
                            )}
                            {status === 'invalid' && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium"
                                title={`Missing: ${row._missing.join(', ')}`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Missing: {row._missing.join(', ')}
                              </span>
                            )}
                            {status === 'duplicate' && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                Duplicate in file
                              </span>
                            )}
                            {status === 'conflict' && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                Conflict (email/ID taken)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {submitError && (
                <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {submitError}
                </div>
              )}

              <div className="flex justify-between items-center">
                <button
                  onClick={() => {
                    setStep(2);
                    setSubmitError('');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => navigate('/users')}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={submitting || newCount + (conflictAction === 'overwrite' ? conflictCount : 0) === 0}
                    className="flex items-center gap-1.5 px-5 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        Importing…
                      </>
                    ) : (
                      'Import'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Result ────────────────────────────────────────────── */}
          {step === 4 && result && (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Import Complete</h3>
                  <p className="text-sm text-gray-500">
                    {result.imported} imported · {result.skipped} skipped · {result.skippedInvalid ?? 0} invalid
                  </p>
                </div>
              </div>

              {result.errors?.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Errors ({result.errors.length})</h4>
                  <div className="rounded-lg border border-red-200 overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-red-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-red-700">Row</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-red-700">Identifier</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-red-700">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {result.errors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-500">{e.row}</td>
                            <td className="px-3 py-2 text-gray-700">{e.identifier}</td>
                            <td className="px-3 py-2 text-red-600">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={resetAll}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Import Another File
                </button>
                <button
                  onClick={() => navigate('/users')}
                  className="px-5 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                >
                  Back to Users
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
