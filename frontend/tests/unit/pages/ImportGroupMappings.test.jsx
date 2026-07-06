/* global File */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import ImportGroupMappings from '../../../src/pages/ImportGroupMappings.jsx';
import { downloadCsv } from '../../../src/utils/csv.js';

jest.mock('@/utils/api');
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

// ── API route mocks ──────────────────────────────────────────────────────────

const SUBJECTS = [
  { id: 'sub-1', name: 'Subject One' },
  { id: 'sub-2', name: 'Subject Two' },
];

const ASSIGNMENTS = [
  { id: 'asg-1', name: 'Assignment One' },
  { id: 'asg-2', name: 'Assignment Two' },
];

/**
 * Install a url-router implementation on api.get. Groups are served per
 * assignment id via `groupsByAssignment`; the plain `groups` option applies
 * to every assignment.
 */
function mockApiRoutes({
  users = [],
  groups = [],
  groupsByAssignment = null,
  subjects = SUBJECTS,
  assignments = ASSIGNMENTS,
} = {}) {
  api.get.mockImplementation((url) => {
    if (url.endsWith('/subjects')) {
      return Promise.resolve({ data: { subjects } });
    }
    if (url.includes('/subjects/')) {
      return Promise.resolve({ data: { subject: subjects[0], assignments } });
    }
    const groupsMatch = url.match(/\/assignments\/([^/]+)\/groups$/);
    if (groupsMatch) {
      const list = groupsByAssignment ? groupsByAssignment[groupsMatch[1]] || [] : groups;
      return Promise.resolve({ data: { groups: list } });
    }
    if (url.endsWith('/users')) {
      return Promise.resolve({ data: { users } });
    }
    return Promise.reject(new Error(`Unexpected url: ${url}`));
  });
}

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

async function renderPage(query = '?subjectId=sub-1&assignmentId=asg-1') {
  const utils = render(
    <MemoryRouter initialEntries={[`/groups/import${query}`]}>
      <ImportGroupMappings />
    </MemoryRouter>
  );
  // Flush the GET /subjects (and cascade) fetches fired on mount
  await act(async () => {});
  return utils;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ImportGroupMappings page', () => {
  let restoreFileReader;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiRoutes();
    restoreFileReader = setupFileReaderMock();
  });

  afterEach(() => {
    restoreFileReader();
  });

  // ── Target assignment cascade ──────────────────────────────────────────────

  describe('Target assignment cascade', () => {
    it('preselects the subject and assignment from query params', async () => {
      await renderPage('?subjectId=sub-1&assignmentId=asg-1');
      expect(screen.getByLabelText('Subject')).toHaveValue('sub-1');
      await waitFor(() => expect(screen.getByLabelText('Assignment')).toHaveValue('asg-1'));
    });

    it('gates the wizard until an assignment is chosen', async () => {
      await renderPage('');
      expect(screen.queryByText('Upload CSV File')).not.toBeInTheDocument();
      expect(screen.getByText(/select a subject and assignment to continue/i)).toBeInTheDocument();

      await userEvent.selectOptions(screen.getByLabelText('Subject'), 'sub-1');
      await screen.findByRole('option', { name: 'Assignment One' });
      // Still gated with only a subject selected
      expect(screen.queryByText('Upload CSV File')).not.toBeInTheDocument();

      await userEvent.selectOptions(screen.getByLabelText('Assignment'), 'asg-1');
      expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
      expect(screen.queryByText(/select a subject and assignment to continue/i)).not.toBeInTheDocument();
    });

    it('does not render a group select (showGroup is false)', async () => {
      await renderPage('');
      expect(screen.queryByLabelText('Group')).not.toBeInTheDocument();
    });

    it('re-gates the wizard when the subject changes and clears the assignment', async () => {
      await renderPage('?subjectId=sub-1&assignmentId=asg-1');
      expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText('Subject'), 'sub-2');
      expect(screen.queryByText('Upload CSV File')).not.toBeInTheDocument();
      expect(screen.getByText(/select a subject and assignment to continue/i)).toBeInTheDocument();
    });
  });

  // ── Step 1: Upload ─────────────────────────────────────────────────────────

  describe('Step 1: Upload', () => {
    it('renders the upload heading', async () => {
      await renderPage();
      expect(screen.getByText('Import Group Mappings')).toBeInTheDocument();
      expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    });

    it('shows the file input', async () => {
      await renderPage();
      expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    });

    it('shows error for non-CSV files', async () => {
      await renderPage();
      const input = document.querySelector('input[type="file"]');
      const txtFile = new File(['data'], 'data.txt', { type: 'text/plain' });
      Object.defineProperty(input, 'files', { configurable: true, value: [txtFile] });
      act(() => {
        fireEvent.change(input);
      });
      expect(screen.getByText('Please upload a CSV file')).toBeInTheDocument();
    });

    it('shows error when CSV has fewer than 2 rows', async () => {
      await renderPage();
      uploadCsv('group name,email');
      expect(screen.getByText(/CSV must have a header row/i)).toBeInTheDocument();
    });

    it('auto-detects columns and shows row count when columns cannot be detected', async () => {
      await renderPage();
      uploadCsv('col1,col2\nval1@test.com,Group A\nval2@test.com,Group B');
      expect(screen.getByText(/Loaded 2 rows/i)).toBeInTheDocument();
    });

    it('shows column mapping UI when columns cannot be auto-detected', async () => {
      await renderPage();
      uploadCsv('col1,col2\nval1,val2');
      expect(screen.getByText(/could not be auto-detected/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Email column')).toBeInTheDocument();
      expect(screen.getByLabelText('Group name column')).toBeInTheDocument();
    });

    it('Next button is disabled without a valid file', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /next: preview/i })).toBeDisabled();
    });

    it('accepts a valid CSV via drag and drop and auto-advances to preview', async () => {
      mockApiRoutes({
        users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
        groups: [{ id: 'g1', name: 'Team A' }],
      });
      await renderPage();
      const file = makeCsvFile('group name,email\nTeam A,alice@test.com');
      const dropzone = screen.getByRole('button', { name: /click to browse/i });
      act(() => {
        fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
      });
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument());
    });

    it('shows error when a non-CSV file is dropped', async () => {
      await renderPage();
      const file = new File(['data'], 'data.txt', { type: 'text/plain' });
      const dropzone = screen.getByRole('button', { name: /click to browse/i });
      act(() => {
        fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
      });
      expect(screen.getByText('Please upload a CSV file')).toBeInTheDocument();
    });

    it('auto-advances to step 2 when a valid CSV with detectable columns is uploaded', async () => {
      mockApiRoutes({
        users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
        groups: [{ id: 'g1', name: 'Team Alpha' }],
      });
      await renderPage();
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
      mockApiRoutes({ users: mockUsers, groups: mockGroups });
      await renderPage();
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

    it('validates group names against the selected assignment groups', async () => {
      mockApiRoutes({
        users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
        groupsByAssignment: { 'asg-1': [{ id: 'g1', name: 'Team Alpha' }] },
      });
      await renderPage();
      uploadCsv('group name,email\nTeam Beta,alice@test.com');
      await waitFor(() => expect(screen.getByText(/Group not found/i)).toBeInTheDocument());
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/assignments\/asg-1\/groups$/));
      // Group lists are never fetched from the old global /groups endpoint
      const groupCalls = api.get.mock.calls.filter(([url]) => /\/groups$/.test(url));
      expect(groupCalls.length).toBeGreaterThan(0);
      expect(groupCalls.every(([url]) => /\/assignments\/[^/]+\/groups$/.test(url))).toBe(true);
    });

    it('refetches groups and rebuilds the preview when the assignment changes', async () => {
      mockApiRoutes({
        users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
        groupsByAssignment: {
          'asg-1': [{ id: 'g1', name: 'Team Alpha' }],
          'asg-2': [],
        },
      });
      await renderPage();
      uploadCsv('group name,email\nTeam Alpha,alice@test.com');
      await waitFor(() => expect(screen.getAllByText('Ready').length).toBeGreaterThan(0));

      await userEvent.selectOptions(screen.getByLabelText('Assignment'), 'asg-2');

      await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/assignments\/asg-2\/groups$/)));
      // "Team Alpha" does not exist in asg-2 → row becomes a skip
      await waitFor(() => expect(screen.getByText(/Group not found/i)).toBeInTheDocument());
    });

    it('highlights rows with unknown user as Skip', async () => {
      const csvWithUnknown = 'group name,email\nTeam Alpha,alice@test.com\nTeam Alpha,nobody@ghost.com';
      mockApiRoutes({ users: mockUsers, groups: mockGroups });
      await renderPage();
      uploadCsv(csvWithUnknown);
      await waitFor(() => expect(screen.getByText(/User not found/i)).toBeInTheDocument());
    });

    it('highlights rows with unknown group as Skip', async () => {
      const csvWithBadGroup = 'group name,email\nGhost Group,alice@test.com';
      mockApiRoutes({ users: mockUsers, groups: mockGroups });
      await renderPage();
      uploadCsv(csvWithBadGroup);
      await waitFor(() => expect(screen.getByText(/Group not found/i)).toBeInTheDocument());
    });

    it('shows Conflict status for users already in a group of the selected assignment', async () => {
      const conflictCsv = 'group name,email\nTeam Alpha,assigned@test.com';
      mockApiRoutes({
        users: [
          {
            id: 'u3',
            email: 'assigned@test.com',
            memberships: [{ assignment_id: 'asg-1', group_id: 'g1', group_name: 'Team Beta' }],
          },
        ],
        groups: mockGroups,
      });
      await renderPage();
      uploadCsv(conflictCsv);
      await waitFor(() => expect(screen.getAllByText(/Conflict/i).length).toBeGreaterThan(0));
      expect(screen.getAllByText(/User already in a group/i).length).toBeGreaterThan(0);
    });

    it('does NOT flag a conflict when the membership is in a different assignment', async () => {
      const csv = 'group name,email\nTeam Alpha,other@test.com';
      mockApiRoutes({
        users: [
          {
            id: 'u4',
            email: 'other@test.com',
            memberships: [{ assignment_id: 'asg-2', group_id: 'g9', group_name: 'Elsewhere' }],
          },
        ],
        groups: mockGroups,
      });
      await renderPage();
      uploadCsv(csv);
      await waitFor(() => expect(screen.getAllByText(/Import/).length).toBeGreaterThan(0));
      expect(screen.queryByText(/User already in a group/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Conflict/i)).not.toBeInTheDocument();
    });

    it('marks admin users as Skip with appropriate reason', async () => {
      const csvWithAdmin = 'group name,email\nTeam Alpha,admin@test.com';
      mockApiRoutes({
        users: [{ id: 'a1', email: 'admin@test.com', role_name: 'admin', group_id: null }],
        groups: mockGroups,
      });
      await renderPage();
      uploadCsv(csvWithAdmin);
      await waitFor(() =>
        expect(screen.getByText(/Admins and Assignment Managers cannot be assigned/i)).toBeInTheDocument()
      );
    });

    it('marks assignment_manager users as Skip with appropriate reason', async () => {
      const csvWithAM = 'group name,email\nTeam Alpha,am@test.com';
      mockApiRoutes({
        users: [{ id: 'am1', email: 'am@test.com', role_name: 'assignment_manager', group_id: null }],
        groups: mockGroups,
      });
      await renderPage();
      uploadCsv(csvWithAM);
      await waitFor(() =>
        expect(screen.getByText(/Admins and Assignment Managers cannot be assigned/i)).toBeInTheDocument()
      );
    });

    it('does not count privileged-user rows as importable', async () => {
      const csvMixed = 'group name,email\nTeam Alpha,admin@test.com\nTeam Alpha,alice@test.com';
      mockApiRoutes({
        users: [
          { id: 'a1', email: 'admin@test.com', role_name: 'admin', group_id: null },
          { id: 'u1', email: 'alice@test.com', role_name: 'user', group_id: null },
        ],
        groups: mockGroups,
      });
      await renderPage();
      uploadCsv(csvMixed);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument());
      // Import button should reflect only 1 importable row
      await waitFor(() => expect(screen.getByRole('button', { name: /import 1 row/i })).toBeInTheDocument());
    });

    it('shows a skip/overwrite dropdown for conflict rows', async () => {
      const conflictCsv = 'group name,email\nTeam Alpha,assigned@test.com';
      mockApiRoutes({
        users: [
          {
            id: 'u3',
            email: 'assigned@test.com',
            memberships: [{ assignment_id: 'asg-1', group_id: 'g1', group_name: 'Team Beta' }],
          },
        ],
        groups: mockGroups,
      });
      await renderPage();
      uploadCsv(conflictCsv);
      await waitFor(() => expect(screen.getByLabelText(/Action for assigned@test.com/i)).toBeInTheDocument());
    });

    describe('Bulk conflict actions', () => {
      const conflictCsv = 'group name,email\nTeam Alpha,alice@test.com\nTeam Beta,bob@test.com';
      const conflictUsers = [
        {
          id: 'u1',
          email: 'alice@test.com',
          role_name: 'user',
          memberships: [{ assignment_id: 'asg-1', group_id: 'g0', group_name: 'Old Team' }],
        },
        {
          id: 'u2',
          email: 'bob@test.com',
          role_name: 'user',
          memberships: [{ assignment_id: 'asg-1', group_id: 'g0', group_name: 'Old Team' }],
        },
      ];

      async function goToConflictPreview() {
        mockApiRoutes({ users: conflictUsers, groups: mockGroups });
        await renderPage();
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
        const actionSelect = screen.getByLabelText(/Action for alice@test.com/i);
        await userEvent.selectOptions(actionSelect, 'skip');
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
      mockApiRoutes({
        users: [
          { id: 'u1', email: 'alice@test.com', group_id: null },
          { id: 'u2', email: 'bob@test.com', group_id: null },
        ],
        groups: [
          { id: 'g1', name: 'Team Alpha' },
          { id: 'g2', name: 'Team Beta' },
        ],
      });
      api.post.mockResolvedValue({ data: importResponse });

      await renderPage();
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

    it('submits to POST /assignments/:assignmentId/import-mappings', async () => {
      await runImport();
      expect(api.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/assignments\/asg-1\/import-mappings$/),
        expect.objectContaining({ rows: expect.any(Array) })
      );
    });

    it('sends only email, groupName and action for each row', async () => {
      await runImport();
      const [, body] = api.post.mock.calls[0];
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: 'alice@test.com', groupName: 'Team Alpha', action: 'import' }),
        ])
      );
      for (const row of body.rows) {
        expect(Object.keys(row).sort()).toEqual(['action', 'email', 'groupName']);
      }
    });

    it('surfaces the "User is not a member of this subject" skip reason in the skipped CSV', async () => {
      await runImport({
        imported: 1,
        skipped: [{ email: 'bob@test.com', groupName: 'Team Beta', reason: 'User is not a member of this subject' }],
        errors: [],
      });
      expect(screen.getByText(/skipped and errored rows has been downloaded/i)).toBeInTheDocument();
      expect(downloadCsv).toHaveBeenCalledTimes(1);
      const [rows] = downloadCsv.mock.calls[0];
      expect(rows).toEqual(
        expect.arrayContaining([expect.objectContaining({ reason: 'User is not a member of this subject' })])
      );
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
      mockApiRoutes({ users: confirmUsers, groups: confirmGroups });
      await renderPage();
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

    it('Escape key dismisses the modal', async () => {
      await goToImportReady();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /import 2 rows/i }));
      });
      expect(screen.getByRole('heading', { name: /before you continue/i })).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(screen.queryByRole('heading', { name: /before you continue/i })).not.toBeInTheDocument();
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
      expect(api.post).not.toHaveBeenCalled();
    });

    it('confirming after countdown proceeds with import', async () => {
      api.post.mockResolvedValue({ data: { imported: 2, skipped: [], errors: [] } });
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
      mockApiRoutes({
        users: [{ id: 'u1', email: 'alice@test.com', group_id: null }],
        groups: [{ id: 'g1', name: 'Team Alpha' }],
      });
      api.post.mockResolvedValue({
        data: {
          imported: 1,
          skipped: [{ email: 'nobody@test.com', groupName: 'Team Alpha', reason: 'User not found' }],
          errors: [],
        },
      });

      await renderPage();
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
