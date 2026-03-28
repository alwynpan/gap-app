import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Settings from '../../../src/pages/Settings.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Settings page', () => {
  const mockLogout = jest.fn();

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { username: 'admin', email: 'admin@example.com', role: 'admin' },
      logout: mockLogout,
      isAdmin: true,
      isAssignmentManager: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the Settings heading', async () => {
    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'false' }] },
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /^settings$/i })).toBeInTheDocument();
  });

  it('shows the group join lock toggle', async () => {
    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'false' }] },
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/lock group joining/i)).toBeInTheDocument();
    });
  });

  it('loads and reflects current locked=false state', async () => {
    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'false' }] },
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => {
      const toggle = screen.getByRole('button', { name: /enable group join lock/i });
      expect(toggle).toBeInTheDocument();
    });
  });

  it('loads and reflects current locked=true state', async () => {
    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'true' }] },
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => {
      const toggle = screen.getByRole('button', { name: /disable group join lock/i });
      expect(toggle).toBeInTheDocument();
    });
  });

  it('enables the lock when toggle is clicked', async () => {
    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'false' }] },
    });
    axios.put.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByRole('button', { name: /enable group join lock/i }));

    await userEvent.click(screen.getByRole('button', { name: /enable group join lock/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/config\/group_join_locked$/), { value: 'true' });
    });
  });

  it('disables the lock when toggle is clicked while enabled', async () => {
    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'true' }] },
    });
    axios.put.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByRole('button', { name: /disable group join lock/i }));

    await userEvent.click(screen.getByRole('button', { name: /disable group join lock/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/config\/group_join_locked$/), { value: 'false' });
    });
  });

  it('shows success message after updating', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'false' }] },
    });
    axios.put.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByRole('button', { name: /enable group join lock/i }));

    await user.click(screen.getByRole('button', { name: /enable group join lock/i }));

    await waitFor(() => {
      expect(screen.getByText('Settings updated successfully')).toBeInTheDocument();
    });
  });

  it('shows error message when update fails', async () => {
    axios.get.mockResolvedValue({
      data: { config: [{ key: 'group_join_locked', value: 'false' }] },
    });
    axios.put.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByRole('button', { name: /enable group join lock/i }));

    await userEvent.click(screen.getByRole('button', { name: /enable group join lock/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to update settings')).toBeInTheDocument();
    });
  });

  it('shows error message when initial load fails', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load settings')).toBeInTheDocument();
    });
  });
});
