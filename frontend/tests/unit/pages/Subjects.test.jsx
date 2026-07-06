import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import Subjects from '../../../src/pages/Subjects.jsx';
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

const makeSubject = (overrides = {}) => ({
  id: 's0000000-0000-0000-0000-000000000001',
  name: 'Mathematics',
  assignment_count: 2,
  member_count: 10,
  created_at: '2025-01-15T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z',
  ...overrides,
});

describe('Subjects page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ isAdmin: true, isAssignmentManager: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const setupPage = async (subjects = [makeSubject()]) => {
    api.get.mockResolvedValueOnce({ data: { subjects } });
    render(
      <MemoryRouter>
        <Subjects />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/manage subjects/i)).toBeInTheDocument());
  };

  // ── Loading / fetch ────────────────────────────────────────────────────
  it('shows loading spinner before data resolves', () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    const { container } = render(
      <MemoryRouter>
        <Subjects />
      </MemoryRouter>
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText(/manage subjects/i)).not.toBeInTheDocument();
  });

  it('renders subject rows with counts and created date', async () => {
    const subject = makeSubject();
    await setupPage([subject]);
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(new Date(subject.created_at).toLocaleDateString())).toBeInTheDocument();
  });

  it('shows empty state when there are no subjects', async () => {
    await setupPage([]);
    expect(screen.getByText('No subjects found')).toBeInTheDocument();
  });

  it('shows fetch error banner when loading fails', async () => {
    api.get.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <Subjects />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Failed to load subjects')).toBeInTheDocument());
  });

  it('re-fetches when the browser tab becomes visible', async () => {
    await setupPage([makeSubject()]);
    api.get.mockResolvedValueOnce({ data: { subjects: [makeSubject({ id: 's2', name: 'Physics' })] } });

    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(screen.getByText('Physics')).toBeInTheDocument());
  });

  it('does not re-fetch when the tab becomes hidden', async () => {
    await setupPage();
    const callsBefore = api.get.mock.calls.length;

    Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(api.get.mock.calls.length).toBe(callsBefore);
  });

  // ── Search ─────────────────────────────────────────────────────────────
  describe('Search', () => {
    it('filters subjects by name (case-insensitive)', async () => {
      const user = userEvent.setup();
      await setupPage([makeSubject(), makeSubject({ id: 's2', name: 'Physics' })]);

      await user.type(screen.getByPlaceholderText('Search subjects...'), 'MATH');

      await waitFor(() => {
        expect(screen.getByText('Mathematics')).toBeInTheDocument();
        expect(screen.queryByText('Physics')).not.toBeInTheDocument();
      });
    });

    it('shows empty state when search matches nothing', async () => {
      const user = userEvent.setup();
      await setupPage([makeSubject()]);

      await user.type(screen.getByPlaceholderText('Search subjects...'), 'zzz');

      await waitFor(() => {
        expect(screen.getByText('No subjects found')).toBeInTheDocument();
        expect(screen.queryByText('Mathematics')).not.toBeInTheDocument();
      });
    });
  });

  // ── Role gating ────────────────────────────────────────────────────────
  describe('Role gating', () => {
    it('shows create and delete controls for admins', async () => {
      await setupPage();
      expect(screen.getByRole('button', { name: /\+ create subject/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete Subject' })).toBeInTheDocument();
    });

    it('hides create and delete controls for non-admin assignment managers', async () => {
      useAuth.mockReturnValue({ isAdmin: false, isAssignmentManager: true });
      await setupPage();
      expect(screen.getByText('Mathematics')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /\+ create subject/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete Subject' })).not.toBeInTheDocument();
    });
  });

  // ── Create subject ─────────────────────────────────────────────────────
  describe('Create subject', () => {
    it('creates a subject, refetches, and shows auto-dismissing success feedback', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage([]);
      api.post.mockResolvedValueOnce({ data: { message: 'ok', subject: makeSubject() } });
      api.get.mockResolvedValueOnce({ data: { subjects: [makeSubject()] } });

      await user.click(screen.getByRole('button', { name: /\+ create subject/i }));
      await user.type(screen.getByPlaceholderText(/enter subject name/i), ' Mathematics ');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/subjects$/), { name: 'Mathematics' });
        expect(screen.getByText('Subject created successfully')).toBeInTheDocument();
      });
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Create New Subject')).not.toBeInTheDocument();

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Subject created successfully')).not.toBeInTheDocument());
    });

    it('shows validation error and does not POST when name is empty', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /\+ create subject/i }));
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(await screen.findByText('Subject name is required')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows server error inside modal on duplicate subject (409)', async () => {
      const user = userEvent.setup();
      await setupPage([]);
      api.post.mockRejectedValue({ response: { data: { error: 'Subject already exists' } } });

      await user.click(screen.getByRole('button', { name: /\+ create subject/i }));
      await user.type(screen.getByPlaceholderText(/enter subject name/i), 'Mathematics');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(await screen.findByText('Subject already exists')).toBeInTheDocument();
      // Modal stays open so the user can fix the name
      expect(screen.getByText('Create New Subject')).toBeInTheDocument();
    });

    it('shows generic error when create fails without a server message', async () => {
      const user = userEvent.setup();
      await setupPage([]);
      api.post.mockRejectedValue(new Error('network'));

      await user.click(screen.getByRole('button', { name: /\+ create subject/i }));
      await user.type(screen.getByPlaceholderText(/enter subject name/i), 'Mathematics');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(await screen.findByText('Failed to create subject')).toBeInTheDocument();
    });

    it('cancels the create modal and clears its state', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /\+ create subject/i }));
      await user.type(screen.getByPlaceholderText(/enter subject name/i), 'Mathematics');
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText('Create New Subject')).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // ── Delete subject ─────────────────────────────────────────────────────
  describe('Delete subject', () => {
    it('deletes a subject via the two-step typed confirmation and refetches', async () => {
      const user = userEvent.setup();
      await setupPage([makeSubject({ assignment_count: 2, member_count: 10 })]);
      api.delete.mockResolvedValueOnce({ data: { message: 'ok' } });
      api.get.mockResolvedValueOnce({ data: { subjects: [] } });

      await user.click(screen.getByRole('button', { name: 'Delete Subject' }));

      expect(screen.getByText('Delete subject')).toBeInTheDocument();
      expect(screen.getByText(/2 assignments and 10 members will be permanently deleted/i)).toBeInTheDocument();

      await user.type(screen.getByLabelText('Confirmation name'), 'Mathematics');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(
          expect.stringMatching(/\/subjects\/s0000000-0000-0000-0000-000000000001$/)
        );
        expect(screen.getByText('Subject deleted successfully')).toBeInTheDocument();
      });
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('keeps Continue disabled until the typed name matches exactly', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('button', { name: 'Delete Subject' }));

      const input = screen.getByLabelText('Confirmation name');
      await user.type(input, 'Wrong');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

      await user.clear(input);
      await user.type(input, 'Mathematics');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    it('cancels the delete modal without calling the API', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('button', { name: 'Delete Subject' }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(api.delete).not.toHaveBeenCalled();
      expect(screen.queryByText('Delete subject')).not.toBeInTheDocument();
    });

    it('shows server error when delete fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      api.delete.mockRejectedValue({ response: { status: 403, data: { error: 'Forbidden' } } });

      await user.click(screen.getByRole('button', { name: 'Delete Subject' }));
      await user.type(screen.getByLabelText('Confirmation name'), 'Mathematics');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Forbidden')).not.toBeInTheDocument());
    });

    it('shows generic error when delete fails without a server message', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      api.delete.mockRejectedValue(new Error('network'));

      await user.click(screen.getByRole('button', { name: 'Delete Subject' }));
      await user.type(screen.getByLabelText('Confirmation name'), 'Mathematics');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(screen.getByText('Failed to delete subject')).toBeInTheDocument());
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────
  describe('Row navigation', () => {
    it('navigates to the subject detail page when a row is clicked', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByText('Mathematics'));

      expect(mockNavigate).toHaveBeenCalledWith('/subjects/s0000000-0000-0000-0000-000000000001');
    });

    it('does not navigate when the delete button is clicked', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('button', { name: 'Delete Subject' }));

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
