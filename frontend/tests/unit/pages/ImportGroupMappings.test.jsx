/* global File */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import ImportGroupMappings from '../../../src/pages/ImportGroupMappings.jsx';
import { downloadCsv } from '../../../src/utils/csv.js';

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

// Mock downloadCsv to avoid Blob/URL issues in tests
jest.mock('../../../src/utils/csv.js', () => ({
  parseCsv: jest.requireActual('../../../src/utils/csv.js').parseCsv,
  csvEscape: jest.requireActual('../../../src/utils/csv.js').csvEscape,
  downloadCsv: jest.fn(),
}));

// ── FileReader mock ──────────────────────────────────────────────────────────
function setupFileReaderMock() {
  const OriginalFileReader = global.FileReader;

  class MockFileReader {
    constructor() {
      this.onload = null;
    }

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

function makeCsvFile(content, name = 'mappings.csv') {
  const file = new File([content], name, { type: 'text/csv' });
  file.__testContent = content;
  return file;
}

function uploadCsv(content, name = 'mappings.csv') {
  const file = makeCsvFile(content, name);
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  act(() => {
    fireEvent.change(input);
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/groups/import']}>
      <ImportGroupMappings />
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ImportGroupMappings page', () => {
  let restoreFileReader;

  beforeEach(() => {
    jest.clearAllMocks();
    restoreFileReader = setupFileReaderMock();
  });

  afterEach(() => {
    restoreFileReader();
  });

  // ── Step 1: Upload ─────────────────────────────────────────────────────────

  describe('Step 1: Upload', () => {
    it('renders the upload heading', () => {
      renderPage();
      expect(screen.getByText('Import Group Mappings')).toBeInTheDocument();
      expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    });

    it('shows the file input', () => {
      renderPage();
      expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    });

    it('shows error for non-CSV files', () => {
      renderPage();
      const input = document.querySelector('input[type="file"]');
      const txtFile = new File(['data'], 'data.txt', { type: 'text/plain' });
      Object.defineProperty(input, 'files', { configurable: true, value: [txtFile] });
      act(() => {
        fireEvent.change(input);
      });
      expect(screen.getByText('Please upload a CSV file')).toBeInTheDocument();
    });

    it('shows error when CSV has fewer than 2 rows', () => {
      renderPage();
      uploadCsv('group name,email');
      expect(screen.getByText(/CSV must have a header row/i)).toBeInTheDocument();
    });

    it('auto-detects columns and shows row count when columns cannot be detected', () => {
      renderPage();
      uploadCsv('col1,col2\nval1@test.com,Group A\nval2@test.com,Group B');
      expect(screen.getByText(/Loaded 2 rows/i)).toBeInTheDocument();
    });

    it('shows column mapping UI when columns cannot be auto-detected', () => {
      renderPage();
      uploadCsv('col1,col2\nval1,val2');
      expect(screen.getByText(/could not be auto-detected/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Email column')).toBeInTheDocument();
      expect(screen.getByLabelText('Group name column')).toBeInTheDocument();
    });

    it('Next button is disabled without a valid file', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /next: preview/i })).toBeDisabled();
    });

    it('accepts a valid CSV via drag and drop and auto-advances to preview', async () => {
      axios.get.mockResolvedValue({
        data: {
          users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
          groups: [{ id: 'g1', name: 'Team A' }],
        },
      });
      renderPage();
      const file = makeCsvFile('group name,email\nTeam A,alice@test.com');
      const dropzone = screen.getByRole('button', { name: /click to browse/i });
      act(() => {
        fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
      });
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument());
    });

    it('shows error when a non-CSV file is dropped', () => {
      renderPage();
      const file = new File(['data'], 'data.txt', { type: 'text/plain' });
      const dropzone = screen.getByRole('button', { name: /click to browse/i });
      act(() => {
        fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
      });
      expect(screen.getByText('Please upload a CSV file')).toBeInTheDocument();
    });

    it('auto-advances to step 2 when a valid CSV with detectable columns is uploaded', async () => {
      axios.get.mockResolvedValue({
        data: {
          users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
          groups: [{ id: 'g1', name: 'Team Alpha' }],
        },
      });
      renderPage();
      uploadCsv('group name,email\nTeam Alpha,alice@test.com');
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument());
    });
  });

  // ── Step 2: Preview ────────────────────────────────────────────────────────

  describe('Step 2: Preview', () => {
    const validCsv = 'group name,email\nTeam Alpha,alice@test.com\nTeam Beta,bob@test.com';

    const mockUsers = [
      { id: 'u1', email: 'alice@test.com', group_id: null },
      { id: 'u2', email: 'bob@test.com', group_id: null },
    ];

    const mockGroups = [
      { id: 'g1', name: 'Team Alpha' },
      { id: 'g2', name: 'Team Beta' },
    ];

    async function goToPreview(csv = validCsv) {
      axios.get.mockResolvedValue({ data: { users: mockUsers, groups: mockGroups } });
      renderPage();
      uploadCsv(csv);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument());
    }

    it('shows preview table with email and group columns', async () => {
      await goToPreview();
      await waitFor(() => expect(screen.getByText('alice@test.com')).toBeInTheDocument());
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    it('shows "Ready" status for valid rows', async () => {
      await goToPreview();
      await waitFor(() => expect(screen.getAllByText('Ready').length).toBeGreaterThan(0));
    });

    it('highlights rows with unknown user as Skip', async () => {
      const csvWithUnknown = 'group name,email\nTeam Alpha,alice@test.com\nTeam Alpha,nobody@ghost.com';
      axios.get.mockResolvedValue({ data: { users: mockUsers, groups: mockGroups } });
      renderPage();
      uploadCsv(csvWithUnknown);
      await waitFor(() => expect(screen.getByText(/User not found/i)).toBeInTheDocument());
    });

    it('highlights rows with unknown group as Skip', async () => {
      const csvWithBadGroup = 'group name,email\nGhost Group,alice@test.com';
      axios.get.mockResolvedValue({ data: { users: mockUsers, groups: mockGroups } });
      renderPage();
      uploadCsv(csvWithBadGroup);
      await waitFor(() => expect(screen.getByText(/Group not found/i)).toBeInTheDocument());
    });

    it('shows Conflict status for users already in a group', async () => {
      const conflictCsv = 'group name,email\nTeam Alpha,assigned@test.com';
      axios.get.mockResolvedValue({
        data: {
          users: [{ id: 'u3', email: 'assigned@test.com', group_id: 'g1' }],
          groups: mockGroups,
        },
      });
      renderPage();
      uploadCsv(conflictCsv);
      await waitFor(() => expect(screen.getAllByText(/Conflict/i).length).toBeGreaterThan(0));
    });

    it('marks admin users as Skip with appropriate reason', async () => {
      const csvWithAdmin = 'group name,email\nTeam Alpha,admin@test.com';
      axios.get.mockResolvedValue({
        data: {
          users: [{ id: 'a1', email: 'admin@test.com', role_name: 'admin', group_id: null }],
          groups: mockGroups,
        },
      });
      renderPage();
      uploadCsv(csvWithAdmin);
      await waitFor(() =>
        expect(screen.getByText(/Admins and Assignment Managers cannot be assigned/i)).toBeInTheDocument()
      );
    });

    it('marks assignment_manager users as Skip with appropriate reason', async () => {
      const csvWithAM = 'group name,email\nTeam Alpha,am@test.com';
      axios.get.mockResolvedValue({
        data: {
          users: [{ id: 'am1', email: 'am@test.com', role_name: 'assignment_manager', group_id: null }],
          groups: mockGroups,
        },
      });
      renderPage();
      uploadCsv(csvWithAM);
      await waitFor(() =>
        expect(screen.getByText(/Admins and Assignment Managers cannot be assigned/i)).toBeInTheDocument()
      );
    });

    it('does not count privileged-user rows as importable', async () => {
      const csvMixed = 'group name,email\nTeam Alpha,admin@test.com\nTeam Alpha,alice@test.com';
      axios.get.mockResolvedValue({
        data: {
          users: [
            { id: 'a1', email: 'admin@test.com', role_name: 'admin', group_id: null },
            { id: 'u1', email: 'alice@test.com', role_name: 'user', group_id: null },
          ],
          groups: mockGroups,
        },
      });
      renderPage();
      uploadCsv(csvMixed);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument());
      // Import button should reflect only 1 importable row
      await waitFor(() => expect(screen.getByRole('button', { name: /import 1 row/i })).toBeInTheDocument());
    });

    it('shows a skip/overwrite dropdown for conflict rows', async () => {
      const conflictCsv = 'group name,email\nTeam Alpha,assigned@test.com';
      axios.get.mockResolvedValue({
        data: {
          users: [{ id: 'u3', email: 'assigned@test.com', group_id: 'g1' }],
          groups: mockGroups,
        },
      });
      renderPage();
      uploadCsv(conflictCsv);
      await waitFor(() => expect(screen.getByLabelText(/Action for assigned@test.com/i)).toBeInTheDocument());
    });

    describe('Bulk conflict actions', () => {
      const conflictCsv = 'group name,email\nTeam Alpha,alice@test.com\nTeam Beta,bob@test.com';
      const conflictUsers = [
        { id: 'u1', email: 'alice@test.com', role_name: 'user', group_id: 'g0' },
        { id: 'u2', email: 'bob@test.com', role_name: 'user', group_id: 'g0' },
      ];

      async function goToConflictPreview() {
        axios.get.mockResolvedValue({
          data: { users: conflictUsers, groups: mockGroups },
        });
        renderPage();
        uploadCsv(conflictCsv);
        await waitFor(() => expect(screen.getAllByText(/Conflict/i).length).toBeGreaterThan(0));
      }

      it('shows "Skip all" and "Overwrite all" buttons when there are conflicts', async () => {
        await goToConflictPreview();
        expect(screen.getByRole('button', { name: /skip all/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /overwrite all/i })).toBeInTheDocument();
      });

      it('"Skip all" sets all conflict rows to skip and removes them from import count', async () => {
        await goToConflictPreview();
        await userEvent.click(screen.getByRole('button', { name: /skip all/i }));
        // Import button should be disabled (0 rows to import)
        await waitFor(() => expect(screen.getByRole('button', { name: /import/i })).toBeDisabled());
      });

      it('"Overwrite all" sets all conflict rows to import and adds them to import count', async () => {
        await goToConflictPreview();
        await userEvent.click(screen.getByRole('button', { name: /overwrite all/i }));
        await waitFor(() => expect(screen.getByRole('button', { name: /import 2 rows/i })).toBeInTheDocument());
      });

      it('individual row dropdown still works after using bulk action', async () => {
        await goToConflictPreview();
        // Set all to overwrite
        await userEvent.click(screen.getByRole('button', { name: /overwrite all/i }));
        await waitFor(() => expect(screen.getByRole('button', { name: /import 2 rows/i })).toBeInTheDocument());
        // Then revert first row back to skip individually
        const selects = screen.getAllByRole('combobox');
        await userEvent.selectOptions(selects[0], 'skip');
        await waitFor(() => expect(screen.getByRole('button', { name: /import 1 row/i })).toBeInTheDocument());
      });

      it('does not show bulk buttons when there are no conflicts', async () => {
        await goToPreview();
        expect(screen.queryByRole('button', { name: /skip all/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /overwrite all/i })).not.toBeInTheDocument();
      });
    });

    it('Back button returns to Step 1', async () => {
      await goToPreview();
      // Use exact "Back" text to avoid matching "Back to Groups" breadcrumb
      await waitFor(() => expect(screen.getByRole('button', { name: /^back$/i })).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
      expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    });
  });

  // ── Step 3: Result ─────────────────────────────────────────────────────────

  describe('Step 3: Result', () => {
    async function runImport(importResponse = { imported: 2, skipped: [], errors: [] }) {
      axios.get.mockResolvedValue({
        data: {
          users: [
            { id: 'u1', email: 'alice@test.com', group_id: null },
            { id: 'u2', email: 'bob@test.com', group_id: null },
          ],
          groups: [
            { id: 'g1', name: 'Team Alpha' },
            { id: 'g2', name: 'Team Beta' },
          ],
        },
      });
      axios.post.mockResolvedValue({ data: importResponse });

      renderPage();
      uploadCsv('group name,email\nTeam Alpha,alice@test.com\nTeam Beta,bob@test.com');
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument());
      await waitFor(() => expect(screen.getAllByText('Ready').length).toBeGreaterThan(0));

      // Switch to fake timers before opening modal so setInterval uses fake clock
      jest.useFakeTimers();
      try {
        act(() => {
          fireEvent.click(screen.getByRole('button', { name: /import/i }));
        });
        act(() => {
          jest.advanceTimersByTime(5000);
        });
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
        });
      } finally {
        jest.useRealTimers();
      }

      await waitFor(() => expect(screen.getByText('Import Complete')).toBeInTheDocument());
    }

    it('shows import result counts', async () => {
      await runImport({ imported: 2, skipped: [], errors: [] });
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows "Back to Groups" button', async () => {
      await runImport();
      const btns = screen.getAllByRole('button', { name: /back to groups/i });
      expect(btns.length).toBeGreaterThan(0);
    });

    it('navigates to /groups when "Back to Groups" is clicked', async () => {
      await runImport();
      // Click the step-3 "Back to Groups" button (last of the two matching buttons)
      const btns = screen.getAllByRole('button', { name: /back to groups/i });
      await userEvent.click(btns[btns.length - 1]);
      expect(mockNavigate).toHaveBeenCalledWith('/groups');
    });
  });

  // ── Import confirmation modal ─────────────────────────────────────────────

  describe('Import confirmation modal', () => {
    const confirmCsv = 'group name,email\nTeam Alpha,alice@test.com\nTeam Beta,bob@test.com';
    const confirmUsers = [
      { id: 'u1', email: 'alice@test.com', group_id: null },
      { id: 'u2', email: 'bob@test.com', group_id: null },
    ];
    const confirmGroups = [
      { id: 'g1', name: 'Team Alpha' },
      { id: 'g2', name: 'Team Beta' },
    ];

    async function goToImportReady() {
      axios.get.mockResolvedValue({ data: { users: confirmUsers, groups: confirmGroups } });
      renderPage();
      uploadCsv(confirmCsv);
      await waitFor(() => expect(screen.getAllByText('Ready').length).toBeGreaterThan(0));
    }

    it('shows a confirmation modal heading when Import button is clicked', async () => {
      await goToImportReady();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
      });
      expect(screen.getByRole('heading', { name: /before you continue/i })).toBeInTheDocument();
    });

    it('modal warns that the tool is intended for fresh instances', async () => {
      await goToImportReady();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
      });
      expect(screen.getByText(/fresh instance/i)).toBeInTheDocument();
    });

    it('modal warns that existing group memberships will not be cleared', async () => {
      await goToImportReady();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
      });
      expect(screen.getByText(/existing group membership/i)).toBeInTheDocument();
    });

    it('confirm button is initially disabled showing countdown from 5', async () => {
      await goToImportReady();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
      });
      expect(screen.getByRole('button', { name: /confirm \(5\)/i })).toBeDisabled();
    });

    it('confirm button becomes enabled after 5 seconds countdown', async () => {
      await goToImportReady();
      jest.useFakeTimers();
      try {
        act(() => {
          fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
        });
        act(() => {
          jest.advanceTimersByTime(5000);
        });
        expect(screen.getByRole('button', { name: /^confirm$/i })).not.toBeDisabled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('Cancel button dismisses modal without importing', async () => {
      await goToImportReady();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      });
      expect(screen.queryByRole('heading', { name: /before you continue/i })).not.toBeInTheDocument();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('confirming after countdown proceeds with import', async () => {
      axios.post.mockResolvedValue({ data: { imported: 2, skipped: [], errors: [] } });
      await goToImportReady();
      jest.useFakeTimers();
      try {
        act(() => {
          fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
        });
        act(() => {
          jest.advanceTimersByTime(5000);
        });
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
        });
      } finally {
        jest.useRealTimers();
      }
      await waitFor(() => expect(screen.getByText('Import Complete')).toBeInTheDocument());
    });
  });

  // ── Skipped CSV download ───────────────────────────────────────────────────

  describe('Skipped CSV download', () => {
    it('does not include duplicate rows when a skipped row appears in both preview and API response', async () => {
      axios.get.mockResolvedValue({
        data: {
          users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
          groups: [{ id: 'g1', name: 'Team Alpha' }],
        },
      });
      axios.post.mockResolvedValue({
        data: {
          imported: 1,
          skipped: [{ email: 'nobody@test.com', groupName: 'Team Alpha', reason: 'User not found' }],
          errors: [],
        },
      });

      renderPage();
      uploadCsv('group name,email\nTeam Alpha,alice@test.com\nTeam Alpha,nobody@test.com');
      await waitFor(() => expect(screen.getByRole('button', { name: /import 1 row/i })).toBeInTheDocument());

      // Switch to fake timers before opening modal so setInterval uses fake clock
      jest.useFakeTimers();
      try {
        act(() => {
          fireEvent.click(screen.getByRole('button', { name: /import 1 row/i }));
        });
        act(() => {
          jest.advanceTimersByTime(5000);
        });
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
        });
      } finally {
        jest.useRealTimers();
      }

      await waitFor(() => expect(screen.getByText('Import Complete')).toBeInTheDocument());

      expect(downloadCsv).toHaveBeenCalledTimes(1);
      const [rows] = downloadCsv.mock.calls[0];
      expect(rows).toHaveLength(1);
    });
  });
});
