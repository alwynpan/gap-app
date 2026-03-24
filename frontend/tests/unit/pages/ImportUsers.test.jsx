/* global File */
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import ImportUsers from '../../../src/pages/ImportUsers.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'u1', username: 'admin', role: 'admin' },
    isAdmin: true,
    isAssignmentManager: true,
  })),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// ── FileReader mock ──────────────────────────────────────────────────────────
// JSDOM's FileReader is asynchronous and can be unreliable in tests. We mock
// it so readAsText fires onload via a resolved microtask, using content stored
// on the File object.
function setupFileReaderMock() {
  const OriginalFileReader = global.FileReader;

  class MockFileReader {
    constructor() {
      this.onload = null;
    }

    // Synchronous readAsText: fires onload immediately so state updates
    // happen inside React's act() boundary (triggered by fireEvent.change).
    readAsText(file) {
      const text = file.__testContent !== undefined ? file.__testContent : '';
      this.result = text;
      if (this.onload) {
        this.onload({ target: { result: text } });
      }
    }
  }

  global.FileReader = MockFileReader;
  return () => {
    global.FileReader = OriginalFileReader;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCsvFile(content, name = 'users.csv') {
  const file = new File([content], name, { type: 'text/csv' });
  // Store content for the MockFileReader
  file.__testContent = content;
  return file;
}

/**
 * Simulate a CSV file selection via the hidden file input.
 * We set `files` via defineProperty (read-only in JSDOM) and fire a change
 * event so the component's onChange handler runs.
 */
function uploadCsv(content, name = 'users.csv') {
  const file = makeCsvFile(content, name);
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  // Wrap in act() so React flushes state updates from the synchronous
  // MockFileReader.onload callback before continuing.
  act(() => {
    fireEvent.change(input);
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ImportUsers />
    </MemoryRouter>
  );
}

/**
 * Assert that step 2 (Map Columns) is visible.
 * The column-mapping <select> elements only exist in step 2's mapping table.
 * Since uploadCsv() uses act(), step 2 is already rendered before this runs.
 */
function waitForStep2() {
  // synchronous — act() in uploadCsv already flushed React state updates
  expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
}

/**
 * Wait for step 3 (Preview) to be visible.
 * We wait for the "Import" button, which only appears in step 3.
 */
async function waitForStep3() {
  await screen.findByRole('button', { name: 'Import' });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ImportUsers page', () => {
  let restoreFileReader;

  beforeEach(() => {
    jest.clearAllMocks();
    restoreFileReader = setupFileReaderMock();
  });

  afterEach(() => {
    restoreFileReader();
  });

  // ── Step 1: Upload ─────────────────────────────────────────────────────────

  describe('Step 1 — Upload', () => {
    it('renders upload area on initial render', () => {
      renderPage();
      expect(screen.getByText(/upload csv file/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('Cancel button navigates to /users', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/users');
    });

    it('"Back to Users" button navigates to /users', async () => {
      renderPage();
      await userEvent.click(screen.getAllByRole('button', { name: /back to users/i })[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/users');
    });

    it('shows error when a non-CSV file is uploaded', async () => {
      renderPage();
      const file = new File(['hello'], 'data.txt', { type: 'text/plain' });
      file.__testContent = 'hello';
      const input = document.querySelector('input[type="file"]');
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      act(() => {
        fireEvent.change(input);
      });
      expect(await screen.findByText(/please upload a csv/i)).toBeInTheDocument();
    });

    it('shows error when CSV has no data rows', async () => {
      renderPage();
      // Header row + blank data row → parser filters blank rows → 0 data rows
      uploadCsv('username,email,firstName,lastName\n,,,,');
      expect(await screen.findByText(/no data rows found/i)).toBeInTheDocument();
    });

    it('advances to step 2 after a valid CSV upload', async () => {
      renderPage();
      uploadCsv('username,email,firstName,lastName\njdoe,jdoe@test.com,John,Doe');
      // Wait for a combobox to appear — they only exist in step 2
      await waitForStep2();
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });
  });

  // ── Step 2: Map Columns ────────────────────────────────────────────────────

  describe('Step 2 — Map Columns', () => {
    const validCsv = 'username,email,firstName,lastName\njdoe,jdoe@test.com,John,Doe';

    it('auto-detects column mappings from header names', async () => {
      renderPage();
      uploadCsv(validCsv);
      await waitForStep2();
      const values = screen.getAllByRole('combobox').map((s) => s.value);
      expect(values).toContain('username');
      expect(values).toContain('email');
      expect(values).toContain('firstName');
      expect(values).toContain('lastName');
    });

    it('shows validation error when required fields are not mapped', async () => {
      renderPage();
      uploadCsv('col1,col2\nval1,val2');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      expect(await screen.findByText(/required fields not mapped/i)).toBeInTheDocument();
    });

    it('"Send setup email" checkbox defaults to unchecked', async () => {
      renderPage();
      uploadCsv(validCsv);
      await waitForStep2();
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('Back button returns to step 1', async () => {
      renderPage();
      uploadCsv(validCsv);
      await waitForStep2();
      // "Back" exact name to avoid matching "Back to Users" breadcrumb
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByText(/upload csv file/i)).toBeInTheDocument();
    });

    it('loads preview and advances to step 3 on success', async () => {
      axios.get.mockResolvedValue({ data: { users: [] } });
      renderPage();
      uploadCsv(validCsv);
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText(/import preview/i)).toBeInTheDocument();
    });

    it('shows error when fetching existing users fails', async () => {
      axios.get.mockRejectedValue({ response: { data: { error: 'Server error' } } });
      renderPage();
      uploadCsv(validCsv);
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      expect(await screen.findByText('Server error')).toBeInTheDocument();
    });
  });

  // ── Step 3: Preview ────────────────────────────────────────────────────────

  describe('Step 3 — Preview', () => {
    const twoCsv = 'username,email,firstName,lastName\njdoe,jdoe@test.com,John,Doe\njane,jane@test.com,Jane,Smith';

    async function goToPreview({ existingUsers = [], csv = twoCsv } = {}) {
      axios.get.mockResolvedValue({ data: { users: existingUsers } });
      renderPage();
      uploadCsv(csv);
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
    }

    it('shows "New" status badge for non-conflicting rows', async () => {
      await goToPreview();
      const badges = screen.getAllByText('New');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('highlights existing users with "Existing – skip" badge by default', async () => {
      await goToPreview({
        existingUsers: [{ username: 'jdoe', email: 'jdoe@test.com', role_name: 'user' }],
      });
      expect(screen.getByText('Existing – skip')).toBeInTheDocument();
    });

    it('shows "Existing – overwrite" badge when conflictAction is overwrite', async () => {
      await goToPreview({
        existingUsers: [{ username: 'jdoe', email: 'jdoe@test.com', role_name: 'user' }],
      });
      await userEvent.click(screen.getByRole('radio', { name: /overwrite/i }));
      expect(screen.getByText('Existing – overwrite')).toBeInTheDocument();
    });

    it('shows "Protected – skip" badge for admin/assignment_manager accounts', async () => {
      await goToPreview({
        existingUsers: [{ username: 'jdoe', email: 'jdoe@test.com', role_name: 'admin' }],
      });
      await userEvent.click(screen.getByRole('radio', { name: /overwrite/i }));
      expect(screen.getByText('Protected – skip')).toBeInTheDocument();
    });

    it('shows "Missing" badge when required field data is empty', async () => {
      // All 4 columns mapped, but firstName and lastName cells are empty
      await goToPreview({ csv: 'username,email,firstName,lastName\njdoe,jdoe@test.com,,' });
      expect(screen.getByText(/missing:/i)).toBeInTheDocument();
    });

    it('submits import and shows result step', async () => {
      axios.post.mockResolvedValue({ data: { imported: 2, skipped: 0, errors: [] } });
      await goToPreview();
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(await screen.findByText('Import Complete')).toBeInTheDocument();
    });

    it('calls POST /users/import with correct payload', async () => {
      axios.post.mockResolvedValue({ data: { imported: 2, skipped: 0, errors: [] } });
      await goToPreview();
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      await screen.findByText('Import Complete');
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/users/import'),
        expect.objectContaining({
          conflictAction: 'skip',
          sendSetupEmail: false,
          users: expect.any(Array),
        })
      );
    });

    it('shows submit error when import API fails', async () => {
      axios.post.mockRejectedValue({ response: { data: { error: 'Import failed' } } });
      await goToPreview();
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(await screen.findByText('Import failed')).toBeInTheDocument();
    });

    it('Cancel button navigates to /users', async () => {
      await goToPreview();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockNavigate).toHaveBeenCalledWith('/users');
    });

    it('Back button returns to step 2', async () => {
      await goToPreview();
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      // Step 2 comboboxes reappear
      await waitForStep2();
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });
  });

  // ── Step 4: Result ─────────────────────────────────────────────────────────

  describe('Step 4 — Result', () => {
    async function goToResult({ imported = 2, skipped = 0, errors = [] } = {}) {
      axios.get.mockResolvedValue({ data: { users: [] } });
      axios.post.mockResolvedValue({ data: { imported, skipped, errors } });
      renderPage();
      uploadCsv('username,email,firstName,lastName\njdoe,jdoe@test.com,John,Doe\njane,jane@test.com,Jane,Smith');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      await userEvent.click(screen.getByRole('button', { name: 'Import' }));
      await screen.findByText('Import Complete');
    }

    it('shows "Import Complete" heading', async () => {
      await goToResult();
      expect(screen.getByText('Import Complete')).toBeInTheDocument();
    });

    it('shows row-level errors when present', async () => {
      await goToResult({
        imported: 1,
        skipped: 0,
        errors: [{ row: 2, identifier: 'jdoe', reason: 'Email already exists' }],
      });
      expect(screen.getByText('Email already exists')).toBeInTheDocument();
    });

    it('"Import Another File" resets to step 1', async () => {
      await goToResult();
      await userEvent.click(screen.getByRole('button', { name: /import another file/i }));
      expect(screen.getByText(/upload csv file/i)).toBeInTheDocument();
    });

    it('"Back to Users" navigates to /users', async () => {
      await goToResult();
      // Two "Back to Users" buttons exist (breadcrumb + step-4 footer); either works
      const btns = screen.getAllByRole('button', { name: /back to users/i });
      await userEvent.click(btns[btns.length - 1]);
      expect(mockNavigate).toHaveBeenCalledWith('/users');
    });
  });

  // ── Full Name column mapping ───────────────────────────────────────────────

  describe('Full Name column mapping', () => {
    it('splits "First Last" format correctly in preview', async () => {
      axios.get.mockResolvedValue({ data: { users: [] } });
      renderPage();
      // "name" header auto-detects to fullNameFL
      uploadCsv('username,email,name\njdoe,jdoe@test.com,John Doe');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Doe')).toBeInTheDocument();
    });

    it('splits "First, Last" comma format correctly for fullNameFL', async () => {
      axios.get.mockResolvedValue({ data: { users: [] } });
      renderPage();
      uploadCsv('username,email,name\njdoe,jdoe@test.com,"John, Doe"');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Doe')).toBeInTheDocument();
    });

    it('splits "Last, First" format correctly when mapped to fullNameLF', async () => {
      axios.get.mockResolvedValue({ data: { users: [] } });
      renderPage();
      // "fullname" auto-detects to fullNameFL; we'll change it to fullNameLF
      uploadCsv('username,email,fullname\njdoe,jdoe@test.com,"Doe, John"');
      await waitForStep2();

      // Third column (index 2) — change mapping to fullNameLF
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[2], { target: { value: 'fullNameLF' } });

      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText('John')).toBeInTheDocument();
      expect(screen.getByText('Doe')).toBeInTheDocument();
    });
  });

  // ── Dynamic dropdown exclusion ─────────────────────────────────────────────

  describe('Dynamic dropdown exclusion', () => {
    const fiveColCsv = 'colA,colB,colC,colD,colE\n1,2,3,4,5';

    function getOptionsForColumn(colIndex) {
      const selects = screen.getAllByRole('combobox');
      return Array.from(selects[colIndex].options).map((o) => o.value);
    }

    it('hides a selected field from other column dropdowns', async () => {
      renderPage();
      uploadCsv(fiveColCsv);
      await waitForStep2();

      // Map column 0 to "username"
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'username' } });

      // Column 1 should not offer "username"
      expect(getOptionsForColumn(1)).not.toContain('username');
      // But column 0 should still show it (it's the current value)
      expect(getOptionsForColumn(0)).toContain('username');
    });

    it('hides fullName options when firstName is selected', async () => {
      renderPage();
      uploadCsv(fiveColCsv);
      await waitForStep2();

      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'firstName' } });

      const otherOpts = getOptionsForColumn(1);
      expect(otherOpts).not.toContain('firstName');
      expect(otherOpts).not.toContain('fullNameFL');
      expect(otherOpts).not.toContain('fullNameLF');
      // lastName should still be available
      expect(otherOpts).toContain('lastName');
    });

    it('hides firstName, lastName, and both fullName options when fullNameFL is selected', async () => {
      renderPage();
      uploadCsv(fiveColCsv);
      await waitForStep2();

      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'fullNameFL' } });

      const otherOpts = getOptionsForColumn(1);
      expect(otherOpts).not.toContain('firstName');
      expect(otherOpts).not.toContain('lastName');
      expect(otherOpts).not.toContain('fullNameFL');
      expect(otherOpts).not.toContain('fullNameLF');
    });

    it('clears conflicting selections when a new value creates a conflict', async () => {
      renderPage();
      uploadCsv(fiveColCsv);
      await waitForStep2();

      // Re-query combobox references after each change (React re-renders replace DOM nodes)
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'firstName' } });
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'lastName' } });

      // Verify both are set before the conflicting change
      expect(screen.getAllByRole('combobox')[0].value).toBe('firstName');
      expect(screen.getAllByRole('combobox')[1].value).toBe('lastName');

      // Now change column 0 to fullNameFL — this should clear column 1 (lastName conflicts)
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'fullNameFL' } });

      expect(screen.getAllByRole('combobox')[0].value).toBe('fullNameFL');
      expect(screen.getAllByRole('combobox')[1].value).toBe('');
    });

    it('autoDetect does not assign duplicate fields to multiple columns', async () => {
      renderPage();
      // Two columns named "email" — only the first should get the mapping
      uploadCsv('email,email,firstName,lastName\na@t.com,b@t.com,John,Doe');
      await waitForStep2();

      const selects = screen.getAllByRole('combobox');
      expect(selects[0].value).toBe('email');
      expect(selects[1].value).toBe('');
    });

    it('autoDetect blocks fullName when firstName/lastName are already assigned', async () => {
      renderPage();
      uploadCsv('firstName,lastName,name\nJohn,Doe,John Doe');
      await waitForStep2();

      const selects = screen.getAllByRole('combobox');
      expect(selects[0].value).toBe('firstName');
      expect(selects[1].value).toBe('lastName');
      // "name" would auto-detect to fullNameFL, but it conflicts
      expect(selects[2].value).toBe('');
    });
  });

  // ── Duplicate and conflict detection ──────────────────────────────────────

  describe('Duplicate and conflict detection', () => {
    it('shows "Duplicate in file" badge for intra-CSV duplicate usernames', async () => {
      axios.get.mockResolvedValue({ data: { users: [] } });
      renderPage();
      uploadCsv('username,email,firstName,lastName\njdoe,jdoe@a.com,John,Doe\njdoe,jdoe@b.com,Jane,Doe');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText('Duplicate in file')).toBeInTheDocument();
    });

    it('shows "Duplicate in file" badge for intra-CSV duplicate emails', async () => {
      axios.get.mockResolvedValue({ data: { users: [] } });
      renderPage();
      uploadCsv('username,email,firstName,lastName\njdoe,same@test.com,John,Doe\njane,same@test.com,Jane,Smith');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText('Duplicate in file')).toBeInTheDocument();
    });

    it('shows "Conflict (email/ID taken)" for email conflict with existing user', async () => {
      axios.get.mockResolvedValue({
        data: {
          users: [{ username: 'other', email: 'taken@test.com', role_name: 'user' }],
        },
      });
      renderPage();
      uploadCsv('username,email,firstName,lastName\nnewuser,taken@test.com,New,User');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText('Conflict (email/ID taken)')).toBeInTheDocument();
    });

    it('shows "Conflict (email/ID taken)" for student ID conflict with existing user', async () => {
      axios.get.mockResolvedValue({
        data: {
          users: [{ username: 'other', email: 'other@test.com', role_name: 'user', student_id: 'S123' }],
        },
      });
      renderPage();
      uploadCsv('username,email,firstName,lastName,student id\nnewuser,new@test.com,New,User,S123');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      expect(screen.getByText('Conflict (email/ID taken)')).toBeInTheDocument();
    });

    it('does not send conflict rows to the import API', async () => {
      axios.get.mockResolvedValue({
        data: {
          users: [{ username: 'other', email: 'taken@test.com', role_name: 'user' }],
        },
      });
      axios.post.mockResolvedValue({ data: { imported: 0, skipped: 0, errors: [] } });
      renderPage();
      uploadCsv('username,email,firstName,lastName\nnewuser,taken@test.com,New,User');
      await waitForStep2();
      await userEvent.click(screen.getByRole('button', { name: /preview import/i }));
      await waitForStep3();
      // Import button should be disabled since the only row is a conflict
      expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    });
  });
});
