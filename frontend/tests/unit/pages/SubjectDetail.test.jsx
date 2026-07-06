import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '@/utils/api';
import SubjectDetail from '../../../src/pages/SubjectDetail.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/utils/api');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const ASSIGNMENT_ID = 'a0000000-0000-0000-0000-000000000001';

const makeSubject = (overrides = {}) => ({
  id: SUBJECT_ID,
  name: 'Mathematics',
  created_at: '2025-01-15T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z',
  ...overrides,
});

const makeAssignment = (overrides = {}) => ({
  id: ASSIGNMENT_ID,
  name: 'Assignment 1',
  subject_id: SUBJECT_ID,
  subject_name: 'Mathematics',
  group_count: 4,
  created_at: '2025-02-01T00:00:00.000Z',
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/subjects/${SUBJECT_ID}`]}>
      <Routes>
        <Route path="/subjects/:subjectId" element={<SubjectDetail />} />
      </Routes>
    </MemoryRouter>
  );

describe('SubjectDetail page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ isAdmin: true, isAssignmentManager: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const setupPage = async (assignments = [makeAssignment()], subject = makeSubject()) => {
    api.get.mockResolvedValueOnce({ data: { subject, assignments } });
    renderPage();
    // Subject name appears in both the breadcrumb and the page heading.
    await waitFor(() => expect(screen.getAllByText('Mathematics').length).toBeGreaterThan(0));
  };

  // ── Loading / fetch ────────────────────────────────────────────────────
  it('shows loading spinner before data resolves', () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Mathematics')).not.toBeInTheDocument();
  });

  it('fetches the subject by route param', async () => {
    await setupPage();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/subjects/${SUBJECT_ID}$`)));
  });

  it('shows error banner with a link back to subjects when fetch fails', async () => {
    api.get.mockRejectedValue(new Error('boom'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Failed to load subject')).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /back to subjects/i });
    expect(link).toHaveAttribute('href', '/subjects');
  });

  // ── Breadcrumb ─────────────────────────────────────────────────────────
  it('renders breadcrumb with a Subjects link and the subject name', async () => {
    await setupPage();
    const link = screen.getByRole('link', { name: 'Subjects' });
    expect(link).toHaveAttribute('href', '/subjects');
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumb).toHaveTextContent('Subjects');
    expect(breadcrumb).toHaveTextContent('Mathematics');
  });

  // ── Assignments table ──────────────────────────────────────────────────
  it('renders assignment rows with group count and created date', async () => {
    const assignment = makeAssignment();
    await setupPage([assignment]);
    expect(screen.getByText('Assignment 1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(new Date(assignment.created_at).toLocaleDateString())).toBeInTheDocument();
  });

  it('shows empty state when the subject has no assignments', async () => {
    await setupPage([]);
    expect(screen.getByText('No assignments yet')).toBeInTheDocument();
  });

  // ── Role gating ────────────────────────────────────────────────────────
  describe('Role gating', () => {
    it('shows create and delete controls for admins', async () => {
      await setupPage();
      expect(screen.getByRole('button', { name: /\+ create assignment/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete Assignment' })).toBeInTheDocument();
    });

    it('hides create and delete controls for non-admin assignment managers', async () => {
      useAuth.mockReturnValue({ isAdmin: false, isAssignmentManager: true });
      await setupPage();
      expect(screen.getByText('Assignment 1')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /\+ create assignment/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete Assignment' })).not.toBeInTheDocument();
    });
  });

  // ── Create assignment ──────────────────────────────────────────────────
  describe('Create assignment', () => {
    it('creates an assignment, refetches, and shows success feedback', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage([]);
      api.post.mockResolvedValueOnce({ data: { message: 'ok', assignment: makeAssignment() } });
      api.get.mockResolvedValueOnce({ data: { subject: makeSubject(), assignments: [makeAssignment()] } });

      await user.click(screen.getByRole('button', { name: /\+ create assignment/i }));
      await user.type(screen.getByPlaceholderText(/enter assignment name/i), ' Assignment 2 ');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/assignments$/), {
          subjectId: SUBJECT_ID,
          name: 'Assignment 2',
        });
        expect(screen.getByText('Assignment created successfully')).toBeInTheDocument();
      });
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Create New Assignment')).not.toBeInTheDocument();

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Assignment created successfully')).not.toBeInTheDocument());
    });

    it('shows validation error and does not POST when name is empty', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /\+ create assignment/i }));
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(await screen.findByText('Assignment name is required')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows server error inside modal on duplicate assignment (409)', async () => {
      const user = userEvent.setup();
      await setupPage([]);
      api.post.mockRejectedValue({
        response: { status: 409, data: { error: 'Assignment already exists in this subject' } },
      });

      await user.click(screen.getByRole('button', { name: /\+ create assignment/i }));
      await user.type(screen.getByPlaceholderText(/enter assignment name/i), 'Assignment 1');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(await screen.findByText('Assignment already exists in this subject')).toBeInTheDocument();
      // Modal stays open so the user can fix the name
      expect(screen.getByText('Create New Assignment')).toBeInTheDocument();
    });

    it('shows generic error when create fails without a server message', async () => {
      const user = userEvent.setup();
      await setupPage([]);
      api.post.mockRejectedValue(new Error('network'));

      await user.click(screen.getByRole('button', { name: /\+ create assignment/i }));
      await user.type(screen.getByPlaceholderText(/enter assignment name/i), 'Assignment 2');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(await screen.findByText('Failed to create assignment')).toBeInTheDocument();
    });

    it('cancels the create modal without calling the API', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /\+ create assignment/i }));
      await user.type(screen.getByPlaceholderText(/enter assignment name/i), 'Assignment 2');
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText('Create New Assignment')).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // ── Delete assignment ──────────────────────────────────────────────────
  describe('Delete assignment', () => {
    it('deletes an assignment via the two-step typed confirmation and refetches', async () => {
      const user = userEvent.setup();
      await setupPage([makeAssignment({ group_count: 4 })]);
      api.delete.mockResolvedValueOnce({ data: { message: 'ok' } });
      api.get.mockResolvedValueOnce({ data: { subject: makeSubject(), assignments: [] } });

      await user.click(screen.getByRole('button', { name: 'Delete Assignment' }));

      expect(screen.getByText('Delete assignment')).toBeInTheDocument();
      expect(screen.getByText(/4 groups and their memberships will be permanently deleted/i)).toBeInTheDocument();

      await user.type(screen.getByLabelText('Confirmation name'), 'Assignment 1');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/assignments/${ASSIGNMENT_ID}$`)));
        expect(screen.getByText('Assignment deleted successfully')).toBeInTheDocument();
      });
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('keeps Continue disabled until the typed name matches exactly', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('button', { name: 'Delete Assignment' }));

      await user.type(screen.getByLabelText('Confirmation name'), 'Wrong');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('cancels the delete modal without calling the API', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('button', { name: 'Delete Assignment' }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(api.delete).not.toHaveBeenCalled();
      expect(screen.queryByText('Delete assignment')).not.toBeInTheDocument();
    });

    it('shows server error when delete fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      api.delete.mockRejectedValue({ response: { status: 500, data: { error: 'Cannot delete assignment' } } });

      await user.click(screen.getByRole('button', { name: 'Delete Assignment' }));
      await user.type(screen.getByLabelText('Confirmation name'), 'Assignment 1');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(screen.getByText('Cannot delete assignment')).toBeInTheDocument());

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Cannot delete assignment')).not.toBeInTheDocument());
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────
  describe('Row navigation', () => {
    it('navigates to the assignment groups page when a row is clicked', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByText('Assignment 1'));

      expect(mockNavigate).toHaveBeenCalledWith(`/subjects/${SUBJECT_ID}/assignments/${ASSIGNMENT_ID}`);
    });

    it('does not navigate when the delete button is clicked', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('button', { name: 'Delete Assignment' }));

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
