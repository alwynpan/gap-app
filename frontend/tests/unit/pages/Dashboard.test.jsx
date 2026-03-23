import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Dashboard from '../../../src/pages/Dashboard.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Dashboard page', () => {
  const mockLogout = jest.fn();
  const mockRefreshUser = jest.fn();

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { username: 'testuser', email: 'test@example.com', role: 'normal_user' },
      logout: mockLogout,
      refreshUser: mockRefreshUser,
      isAdmin: false,
      isAssignmentManager: false,
    });
  });

  it('renders user profile data', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/welcome back, testuser!/i)).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Normal User')).toBeInTheDocument();
  });

  it('calls logout handler', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows admin links for admin users', () => {
    useAuth.mockReturnValue({
      user: { username: 'admin', email: 'admin@example.com', role: 'admin' },
      logout: mockLogout,
      refreshUser: mockRefreshUser,
      isAdmin: true,
      isAssignmentManager: true,
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /manage users/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage groups/i })).toBeInTheDocument();
  });

  it('hides administration block for normal users', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  it('does not show My Group section for admin users', () => {
    useAuth.mockReturnValue({
      user: { username: 'admin', email: 'admin@example.com', role: 'admin' },
      logout: mockLogout,
      refreshUser: mockRefreshUser,
      isAdmin: true,
      isAssignmentManager: true,
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.queryByText('My Group')).not.toBeInTheDocument();
  });

  describe('Change Password', () => {
    it('opens and closes password modal', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      expect(screen.getByText('Change Password', { selector: 'h3' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText('Change Password', { selector: 'h3' })).not.toBeInTheDocument();
    });

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'different');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });

    it('shows error when new password is too short', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), '12345');
      await user.type(screen.getByPlaceholderText('Confirm new password'), '12345');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      expect(screen.getByText('New password must be at least 6 characters')).toBeInTheDocument();
    });

    it('successfully changes password', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000001',
          username: 'testuser',
          email: 'test@example.com',
          role: 'normal_user',
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.put.mockResolvedValue({});

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/password$/),
          {
            currentPassword: 'oldpass',
            newPassword: 'newpass123',
          }
        );
        expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
      });

      // Modal should close
      expect(screen.queryByPlaceholderText('Enter current password')).not.toBeInTheDocument();

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Password changed successfully')).not.toBeInTheDocument();
      });
    });

    it('shows API error when password change fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000001',
          username: 'testuser',
          email: 'test@example.com',
          role: 'normal_user',
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.put.mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'wrong');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });
    });
  });

  describe('My Group (normal user)', () => {
    it('shows current group with leave button when user is in a group', () => {
      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: 'g0000000-0000-0000-0000-000000000001',
          groupName: 'Team Alpha',
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      expect(screen.getByText('My Group')).toBeInTheDocument();
      expect(screen.getAllByText('Team Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
    });

    it('fetches and shows available groups when user has no group', async () => {
      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: null,
          groupName: null,
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.get.mockResolvedValue({
        data: {
          groups: [
            { id: 'g0000000-0000-0000-0000-000000000001', name: 'Team A', max_members: 5, member_count: 2 },
            { id: 'g0000000-0000-0000-0000-000000000002', name: 'Team B', max_members: null, member_count: 10 },
            { id: 'g0000000-0000-0000-0000-000000000003', name: 'Full Team', max_members: 3, member_count: 3 },
          ],
        },
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Team A')).toBeInTheDocument();
        expect(screen.getByText('Team B')).toBeInTheDocument();
      });

      // Full team should be filtered out
      expect(screen.queryByText('Full Team')).not.toBeInTheDocument();
    });

    it('shows member count with max members', async () => {
      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: null,
          groupName: null,
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.get.mockResolvedValue({
        data: {
          groups: [{ id: 'g0000000-0000-0000-0000-000000000001', name: 'Team A', max_members: 5, member_count: 2 }],
        },
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/2/)).toBeInTheDocument();
        expect(screen.getByText(/\/ 5/)).toBeInTheDocument();
      });
    });

    it('joins a group successfully', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: null,
          groupName: null,
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.get.mockResolvedValue({
        data: {
          groups: [{ id: 'g0000000-0000-0000-0000-000000000001', name: 'Team A', max_members: 5, member_count: 2 }],
        },
      });
      axios.post.mockResolvedValue({});

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Team A')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /join/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001\/join$/)
        );
        expect(screen.getByText('Successfully joined group')).toBeInTheDocument();
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Successfully joined group')).not.toBeInTheDocument();
      });
    });

    it('shows error when joining group fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: null,
          groupName: null,
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.get.mockResolvedValue({
        data: {
          groups: [{ id: 'g0000000-0000-0000-0000-000000000001', name: 'Team A', max_members: 5, member_count: 2 }],
        },
      });
      axios.post.mockRejectedValue({ response: { data: { error: 'Group is full' } } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Team A')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /join/i }));

      await waitFor(() => {
        expect(screen.getByText('Group is full')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Group is full')).not.toBeInTheDocument();
      });
    });

    it('leaves a group successfully', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: 'g0000000-0000-0000-0000-000000000001',
          groupName: 'Team Alpha',
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.post.mockResolvedValue({});

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /leave group/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001\/leave$/)
        );
        expect(screen.getByText('Successfully left group')).toBeInTheDocument();
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Successfully left group')).not.toBeInTheDocument();
      });
    });

    it('shows error when leaving group fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: 'g0000000-0000-0000-0000-000000000001',
          groupName: 'Team Alpha',
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.post.mockRejectedValue({ response: { data: { error: 'Not a member' } } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /leave group/i }));

      await waitFor(() => {
        expect(screen.getByText('Not a member')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Not a member')).not.toBeInTheDocument();
      });
    });

    it('shows no available groups message when none exist', async () => {
      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: null,
          groupName: null,
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.get.mockResolvedValue({ data: { groups: [] } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('No available groups to join')).toBeInTheDocument();
      });
    });

    it('shows error when fetching available groups fails', async () => {
      jest.useFakeTimers();

      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: null,
          groupName: null,
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.get.mockRejectedValue(new Error('network'));

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to load available groups')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Failed to load available groups')).not.toBeInTheDocument();
      });
    });

    it('does not call leave when user has no groupId', async () => {
      useAuth.mockReturnValue({
        user: {
          id: 'u0000000-0000-0000-0000-000000000010',
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          groupId: null,
          groupName: null,
        },
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.get.mockResolvedValue({ data: { groups: [] } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      // The leave button shouldn't even show, but the handleLeaveGroup has a guard
      expect(screen.queryByRole('button', { name: /leave group/i })).not.toBeInTheDocument();
    });
  });
});
