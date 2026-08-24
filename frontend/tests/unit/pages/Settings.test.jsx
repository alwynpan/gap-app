import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import Settings from '../../../src/pages/Settings.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('@/utils/api');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

const ASSIGNMENT_A = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Assignment 1',
  subject_name: 'Subject A',
  join_locked: false,
};
const ASSIGNMENT_B = {
  id: 'a0000000-0000-4000-8000-000000000002',
  name: 'Assignment 2',
  subject_name: 'Subject B',
  join_locked: true,
};

describe('Settings page', () => {
  const mockLogout = jest.fn();

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { username: 'admin', email: 'admin@example.com', role: 'admin' },
      logout: mockLogout,
      isAdmin: true,
      isAssignmentManager: true,
      managedAssignmentIds: [],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderPage = (assignments = [ASSIGNMENT_A, ASSIGNMENT_B]) => {
    api.get.mockResolvedValue({ data: { assignments } });
    return render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
  };

  it('renders the Settings heading', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /^settings$/i })).toBeInTheDocument();
  });

  it('lists each assignment with its subject and lock state', async () => {
    renderPage();

    expect(await screen.findByText('Assignment 1')).toBeInTheDocument();
    expect(screen.getByText('Subject A')).toBeInTheDocument();
    expect(screen.getByText('Assignment 2')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('loads assignments from the scoped assignments endpoint', async () => {
    renderPage();

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/assignments')));
  });

  it('locks joining for one assignment without touching the others', async () => {
    const user = userEvent.setup();
    renderPage();
    api.put.mockResolvedValue({ data: {} });

    await user.click(await screen.findByRole('button', { name: /lock group joining for Assignment 1/i }));

    expect(api.put).toHaveBeenCalledWith(expect.stringContaining(`/assignments/${ASSIGNMENT_A.id}/join-lock`), {
      joinLocked: true,
    });
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('unlocks an already locked assignment', async () => {
    const user = userEvent.setup();
    renderPage();
    api.put.mockResolvedValue({ data: {} });

    await user.click(await screen.findByRole('button', { name: /unlock group joining for Assignment 2/i }));

    expect(api.put).toHaveBeenCalledWith(expect.stringContaining(`/assignments/${ASSIGNMENT_B.id}/join-lock`), {
      joinLocked: false,
    });
  });

  it('reflects the new state in the row after a successful toggle', async () => {
    const user = userEvent.setup();
    renderPage([ASSIGNMENT_A]);
    api.put.mockResolvedValue({ data: {} });

    await user.click(await screen.findByRole('button', { name: /lock group joining for Assignment 1/i }));

    expect(await screen.findByText('Locked')).toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
  });

  it('shows a success message after updating', async () => {
    const user = userEvent.setup();
    renderPage([ASSIGNMENT_A]);
    api.put.mockResolvedValue({ data: {} });

    await user.click(await screen.findByRole('button', { name: /lock group joining/i }));

    expect(await screen.findByText(/group joining locked/i)).toBeInTheDocument();
  });

  it('surfaces the server error and leaves the row unchanged when the update fails', async () => {
    const user = userEvent.setup();
    renderPage([ASSIGNMENT_A]);
    api.put.mockRejectedValue({ response: { data: { error: 'Forbidden: You do not manage this assignment' } } });

    await user.click(await screen.findByRole('button', { name: /lock group joining/i }));

    expect(await screen.findByText(/you do not manage this assignment/i)).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows an error when the assignment list cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('boom'));

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByText(/failed to load settings/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no assignments in scope', async () => {
    renderPage([]);

    expect(await screen.findByText(/no assignments available/i)).toBeInTheDocument();
  });

  // /assignments also returns assignments from subjects a manager merely belongs
  // to, but the lock endpoint requires exact management, so those rows would be
  // guaranteed-403 toggles.
  it('hides assignments a manager does not actually manage', async () => {
    useAuth.mockReturnValue({
      user: { username: 'am1', role: 'assignment_manager' },
      logout: mockLogout,
      isAdmin: false,
      isAssignmentManager: true,
      managedAssignmentIds: [ASSIGNMENT_A.id],
    });
    renderPage([ASSIGNMENT_A, ASSIGNMENT_B]);

    expect(await screen.findByText('Assignment 1')).toBeInTheDocument();
    expect(screen.queryByText('Assignment 2')).not.toBeInTheDocument();
  });

  it('still shows every assignment to an admin', async () => {
    renderPage([ASSIGNMENT_A, ASSIGNMENT_B]);

    expect(await screen.findByText('Assignment 1')).toBeInTheDocument();
    expect(screen.getByText('Assignment 2')).toBeInTheDocument();
  });
});
