import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Check, AlertTriangle } from 'lucide-react';
import Header from '../components/Header.jsx';
import CsvDropzone from '../components/CsvDropzone.jsx';
import { parseCsv, downloadCsv } from '../utils/csv.js';
import { API_BASE } from '../config.js';

const GROUP_NAME_SYNONYMS = ['group name', 'group', 'group_name', 'team name', 'team'];
const EMAIL_SYNONYMS = ['email', 'e-mail', 'user email', 'user_email', 'mail', 'email address'];

function autoDetectColumns(headers) {
  let emailCol = -1;
  let groupCol = -1;
  headers.forEach((h, i) => {
    const norm = h.toLowerCase().trim();
    if (emailCol === -1 && EMAIL_SYNONYMS.includes(norm)) {
      emailCol = i;
    }
    if (groupCol === -1 && GROUP_NAME_SYNONYMS.includes(norm)) {
      groupCol = i;
    }
  });
  return { emailCol, groupCol };
}

function ImportGroupMappings() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1 state
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [emailCol, setEmailCol] = useState(-1);
  const [groupCol, setGroupCol] = useState(-1);
  const [showMapping, setShowMapping] = useState(false);

  // Step 2 state
  const [previewRows, setPreviewRows] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Step 3 state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef(null);

  useEffect(() => {
    if (step === 2 && csvRows.length > 0) {
      buildPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const processFile = (file) => {
    setFileError('');
    setCsvHeaders([]);
    setCsvRows([]);
    setShowMapping(false);
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Please upload a CSV file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setFileError('CSV must have a header row and at least one data row');
        return;
      }
      const headers = parsed[0];
      const rows = parsed.slice(1);
      setCsvHeaders(headers);
      setCsvRows(rows);
      const { emailCol: eCol, groupCol: gCol } = autoDetectColumns(headers);
      setEmailCol(eCol);
      setGroupCol(gCol);
      if (eCol === -1 || gCol === -1) {
        setShowMapping(true);
      } else {
        setStep(2);
      }
    };
    reader.readAsText(file);
  };

  const canProceedStep1 = csvRows.length > 0 && emailCol !== -1 && groupCol !== -1;

  const buildPreview = async () => {
    setLoadingPreview(true);
    try {
      const [usersRes, groupsRes] = await Promise.all([
        axios.get(`${API_BASE}/users`),
        axios.get(`${API_BASE}/groups`),
      ]);
      const userEmailSet = new Map((usersRes.data.users || []).map((u) => [u.email.toLowerCase(), u]));
      const groupNameSet = new Map((groupsRes.data.groups || []).map((g) => [g.name.toLowerCase(), g]));

      const rows = csvRows.map((row) => {
        const email = (row[emailCol] || '').trim(); // eslint-disable-line security/detect-object-injection
        const groupName = (row[groupCol] || '').trim(); // eslint-disable-line security/detect-object-injection
        const user = userEmailSet.get(email.toLowerCase());
        const userExists = user !== undefined;
        const groupExists = groupNameSet.has(groupName.toLowerCase());
        const isPrivilegedUser = user && (user.role_name === 'admin' || user.role_name === 'assignment_manager');
        const alreadyInGroup = user && user.group_id !== null && user.group_id !== undefined;

        let status = 'import';
        let statusLabel = 'Import';
        let skipReason = '';
        if (!userExists) {
          status = 'skip';
          statusLabel = 'Skip';
          skipReason = 'User not found';
        } else if (isPrivilegedUser) {
          status = 'skip';
          statusLabel = 'Skip';
          skipReason = 'Admins and Assignment Managers cannot be assigned to a group';
        } else if (!groupExists) {
          status = 'skip';
          statusLabel = 'Skip';
          skipReason = 'Group not found';
        } else if (alreadyInGroup) {
          status = 'conflict';
          statusLabel = 'Conflict';
          skipReason = 'User already in a group';
        }
        return { email, groupName, status, statusLabel, skipReason, action: status === 'conflict' ? 'skip' : status };
      });
      setPreviewRows(rows);
    } catch (_err) {
      setFileError('Failed to load user/group data for preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConflictAction = (index, action) => {
    setPreviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, action } : r)));
  };

  const handleSetAllConflicts = (action) => {
    setPreviewRows((prev) => prev.map((r) => (r.status === 'conflict' ? { ...r, action } : r)));
  };

  useEffect(() => {
    if (showConfirmModal) {
      setCountdown(5);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(countdownRef.current);
  }, [showConfirmModal]);

  const openConfirmModal = () => setShowConfirmModal(true);

  const closeConfirmModal = () => {
    clearInterval(countdownRef.current);
    setShowConfirmModal(false);
    setCountdown(5);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const rows = previewRows.map((r) => ({
        email: r.email,
        groupName: r.groupName,
        action: r.action,
        skipReason: r.skipReason,
      }));
      const res = await axios.post(`${API_BASE}/groups/import-mappings`, { rows });
      setImportResult(res.data);

      // Auto-download skipped rows CSV
      const allSkipped = [
        ...(res.data.skipped || []).map((s) => ({ email: s.email, groupName: s.groupName, reason: s.reason })),
        ...(res.data.errors || []).map((s) => ({ email: s.email, groupName: s.groupName, reason: s.error })),
      ];
      if (allSkipped.length > 0) {
        downloadCsv(allSkipped, ['email', 'groupName', 'reason'], 'skipped-mappings.csv');
      }

      setStep(3);
    } catch (_err) {
      setFileError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const importCount = previewRows.filter((r) => r.action === 'import').length;
  const skipCount = previewRows.filter((r) => r.action === 'skip').length;
  const conflictCount = previewRows.filter((r) => r.status === 'conflict').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header pageName="Group Management" />

      <main className="w-[85%] mx-auto py-6">
        <div className="px-4 py-6 sm:px-0">
          {/* Breadcrumb / title */}
          <div className="mb-6">
            <button
              onClick={() => navigate('/groups')}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Groups
            </button>
            <h2 className="text-2xl font-bold text-gray-900">Import Group Mappings</h2>
            <p className="text-gray-600 mt-1">Assign users to groups from a CSV file</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-4 mb-8">
            {[
              { n: 1, label: 'Upload' },
              { n: 2, label: 'Preview' },
              { n: 3, label: 'Result' },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step > n
                      ? 'bg-green-600 text-white'
                      : step === n
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step > n ? <Check className="h-4 w-4" /> : n}
                </div>
                <span className={`text-sm ${step === n ? 'font-medium text-gray-900' : 'text-gray-500'}`}>{label}</span>
                {n < 3 && <ArrowRight className="h-4 w-4 text-gray-300" />}
              </div>
            ))}
          </div>

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Upload CSV File</h3>
              <p className="text-gray-600 text-sm mb-4">
                The CSV must have columns for <strong>group name</strong> and <strong>email</strong>. Column headers are
                auto-detected.
              </p>

              <CsvDropzone onFile={processFile} className="mb-4" />

              {fileError && (
                <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {fileError}
                </div>
              )}

              {csvRows.length > 0 && (
                <p className="text-sm text-green-600 mb-4">
                  Loaded {csvRows.length} row{csvRows.length !== 1 ? 's' : ''} from CSV
                </p>
              )}

              {showMapping && csvHeaders.length > 0 && (
                <div className="mb-4 border border-amber-200 bg-amber-50 rounded-md p-4">
                  <p className="text-sm text-amber-800 font-medium mb-3">
                    Columns could not be auto-detected. Please select them manually:
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email column</label>
                      <select
                        value={emailCol}
                        onChange={(e) => setEmailCol(Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                        aria-label="Email column"
                      >
                        <option value={-1}>— Select —</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Group name column</label>
                      <select
                        value={groupCol}
                        onChange={(e) => setGroupCol(Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                        aria-label="Group name column"
                      >
                        <option value={-1}>— Select —</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceedStep1}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next: Preview
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Preview</h3>

              {loadingPreview ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-6 mb-4">
                    <div className="flex gap-6 text-sm">
                      <span className="text-green-700">
                        <strong>{importCount}</strong> to import
                      </span>
                      <span className="text-red-600">
                        <strong>{skipCount}</strong> to skip
                      </span>
                      {conflictCount > 0 && (
                        <span className="text-amber-700">
                          <strong>{conflictCount}</strong> conflict{conflictCount !== 1 ? 's' : ''} (user already in a
                          group)
                        </span>
                      )}
                    </div>
                    {conflictCount > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Set all conflicts:</span>
                        <button
                          onClick={() => handleSetAllConflicts('skip')}
                          className="px-2.5 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 text-xs"
                        >
                          Skip all
                        </button>
                        <button
                          onClick={() => handleSetAllConflicts('import')}
                          className="px-2.5 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 text-xs"
                        >
                          Overwrite all
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-gray-600 font-medium">Email</th>
                          <th className="text-left py-2 px-3 text-gray-600 font-medium">Group Name</th>
                          <th className="text-left py-2 px-3 text-gray-600 font-medium">Status</th>
                          <th className="text-left py-2 px-3 text-gray-600 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2 px-3">{row.email}</td>
                            <td className="py-2 px-3">{row.groupName}</td>
                            <td className="py-2 px-3">
                              {row.status === 'import' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  Ready
                                </span>
                              )}
                              {row.status === 'skip' && (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700"
                                  title={row.skipReason}
                                >
                                  Skip — {row.skipReason}
                                </span>
                              )}
                              {row.status === 'conflict' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                  Conflict — {row.skipReason}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {row.status === 'conflict' ? (
                                <select
                                  value={row.action}
                                  onChange={(e) => handleConflictAction(i, e.target.value)}
                                  className="border border-gray-300 rounded px-2 py-0.5 text-sm"
                                  aria-label={`Action for ${row.email}`}
                                >
                                  <option value="skip">Skip</option>
                                  <option value="import">Overwrite</option>
                                </select>
                              ) : (
                                <span className="text-gray-500 text-xs capitalize">{row.action}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {fileError && (
                    <div className="mb-4 flex items-center gap-2 text-red-600 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      {fileError}
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button
                      onClick={() => setStep(1)}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                    <button
                      onClick={openConfirmModal}
                      disabled={importing || importCount === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importing ? 'Importing...' : `Import ${importCount} row${importCount !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Result */}
          {step === 3 && importResult && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Import Complete</h3>

              <div className="flex gap-8 mb-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{importResult.imported}</p>
                  <p className="text-sm text-gray-500">Imported</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-500">{importResult.skipped?.length ?? 0}</p>
                  <p className="text-sm text-gray-500">Skipped</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-600">{importResult.errors?.length ?? 0}</p>
                  <p className="text-sm text-gray-500">Errors</p>
                </div>
              </div>

              {(importResult.skipped?.length > 0 || importResult.errors?.length > 0) && (
                <p className="text-sm text-gray-600 mb-4">
                  A CSV of skipped and errored rows has been downloaded automatically.
                </p>
              )}

              <button
                onClick={() => navigate('/groups')}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                Back to Groups
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Import confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Before You Continue</h3>

            <div className="mb-5 space-y-3 text-sm text-gray-700">
              <p>
                This tool is designed for <strong>migrating user–group assignments from another system</strong> onto a
                fresh instance where no group memberships exist yet.
              </p>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-amber-800">
                  <strong>Existing group memberships will not be cleared before importing.</strong> Any users who are
                  already in a group and are not explicitly marked as &ldquo;Overwrite&rdquo; in the preview will be
                  skipped. If your instance already has group assignments, this import may produce unexpected membership
                  outcomes. Please review the preview table carefully before proceeding.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeConfirmModal}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  closeConfirmModal();
                  handleImport();
                }}
                disabled={countdown > 0}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {countdown > 0 ? `Confirm (${countdown})` : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportGroupMappings;
