import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import Dashboard from '../../../src/pages/Dashboard.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('@/utils/api');
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

  afterEach(() => {
    jest.useRealTimers();
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

  describe('My Group (normal user)', () => {
    it('shows current group with leave button when user is in a group', async () => {
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

      api.get.mockResolvedValue({ data: { members: [] } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      expect(screen.getByText('My Group')).toBeInTheDocument();
      expect(screen.getAllByText('Team Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
    });

    it('fetches and shows group members when user is in a group', async () => {
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

      api.get.mockResolvedValue({
        data: {
          members: [
            {
              id: 'u0000000-0000-0000-0000-000000000010',
              username: 'testuser',
              email: 'test@example.com',
              first_name: 'Test',
              last_name: 'User',
            },
            {
              id: 'u0000000-0000-0000-0000-000000000020',
              username: 'alice',
              email: 'alice@example.com',
              first_name: 'Alice',
              last_name: 'Smith',
            },
          ],
        },
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Group Members')).toBeInTheDocument();
        // shows formatted name "A. Smith" not username "alice"
        expect(screen.getByText('A. Smith')).toBeInTheDocument();
        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
        // current user is marked with (you)
        expect(screen.getByText('(you)')).toBeInTheDocument();
      });
    });

    it('displays member name as "Initial. LastName" format', async () => {
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

      api.get.mockResolvedValue({
        data: {
          members: [
            { id: 'u1', username: 'jdoe', email: 'jdoe@example.com', first_name: 'John', last_name: 'Doe' },
            { id: 'u2', username: 'msmith', email: 'm@example.com', first_name: 'Mary', last_name: 'Smith' },
          ],
        },
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('J. Doe')).toBeInTheDocument();
        expect(screen.getByText('M. Smith')).toBeInTheDocument();
        // usernames should NOT be shown
        expect(screen.queryByText('jdoe')).not.toBeInTheDocument();
        expect(screen.queryByText('msmith')).not.toBeInTheDocument();
      });
    });

    it('falls back to username when first_name is missing', async () => {
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

      api.get.mockResolvedValue({
        data: {
          members: [
            { id: 'u1', username: 'legacyuser', email: 'legacy@example.com', first_name: null, last_name: null },
          ],
        },
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('legacyuser')).toBeInTheDocument();
      });
    });

    it('shows no members message when group has no members', async () => {
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

      api.get.mockResolvedValue({ data: { members: [] } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('No members yet')).toBeInTheDocument();
      });
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

      api.get.mockResolvedValue({
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

      api.get.mockResolvedValue({
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

      api.get.mockResolvedValue({
        data: {
          groups: [{ id: 'g0000000-0000-0000-0000-000000000001', name: 'Team A', max_members: 5, member_count: 2 }],
        },
      });
      api.post.mockResolvedValue({});

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
        expect(api.post).toHaveBeenCalledWith(
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

      api.get.mockResolvedValue({
        data: {
          groups: [{ id: 'g0000000-0000-0000-0000-000000000001', name: 'Team A', max_members: 5, member_count: 2 }],
        },
      });
      api.post.mockRejectedValue({ response: { data: { error: 'Group is full' } } });

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

      api.get.mockResolvedValue({ data: { members: [] } });
      api.post.mockResolvedValue({});

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /leave group/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
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

      api.get.mockResolvedValue({ data: { members: [] } });
      api.post.mockRejectedValue({ response: { data: { error: 'Not a member' } } });

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

      api.get.mockResolvedValue({ data: { groups: [] } });

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

      api.get.mockRejectedValue(new Error('network'));

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

      api.get.mockResolvedValue({ data: { groups: [] } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      // The leave button shouldn't even show, but the handleLeaveGroup has a guard
      expect(screen.queryByRole('button', { name: /leave group/i })).not.toBeInTheDocument();
    });
  });

  describe('Settings link (admin/AM)', () => {
    it('shows settings link for admin users', () => {
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

      expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    });

    it('does not show settings link for normal users', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    });
  });

  describe("I'm Feeling Lucky", () => {
    const normalUserNoGroup = {
      id: 'u0000000-0000-0000-0000-000000000010',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      groupId: null,
      groupName: null,
    };

    beforeEach(() => {
      useAuth.mockReturnValue({
        user: normalUserNoGroup,
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });
    });

    it('shows "I\'m Feeling Lucky" button when user has no group and lock is off', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('group-join-locked')) {
          return Promise.resolve({ data: { locked: false } });
        }
        return Promise.resolve({
          data: {
            groups: [{ id: 'g1', name: 'Team A', max_members: 5, member_count: 2 }],
          },
        });
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /feeling lucky/i })).toBeInTheDocument();
      });
    });

    it('assigns to a non-empty group when one exists', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('group-join-locked')) {
          return Promise.resolve({ data: { locked: false } });
        }
        return Promise.resolve({
          data: {
            groups: [
              { id: 'g1', name: 'Empty Group', max_members: 5, member_count: 0 },
              { id: 'g2', name: 'Active Group', max_members: 5, member_count: 3 },
            ],
          },
        });
      });
      api.post.mockResolvedValue({});

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => screen.getByRole('button', { name: /feeling lucky/i }));

      await userEvent.click(screen.getByRole('button', { name: /feeling lucky/i }));

      await waitFor(() => {
        // Should join g2 (non-empty), not g1 (empty)
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g2\/join$/));
      });
    });

    it('falls back to any group when no non-empty groups exist', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('group-join-locked')) {
          return Promise.resolve({ data: { locked: false } });
        }
        return Promise.resolve({
          data: {
            groups: [{ id: 'g1', name: 'Empty Group', max_members: 5, member_count: 0 }],
          },
        });
      });
      api.post.mockResolvedValue({});

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => screen.getByRole('button', { name: /feeling lucky/i }));

      await userEvent.click(screen.getByRole('button', { name: /feeling lucky/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g1\/join$/));
      });
    });

    it('shows error when no groups are available', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('group-join-locked')) {
          return Promise.resolve({ data: { locked: false } });
        }
        return Promise.resolve({ data: { groups: [] } });
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => screen.getByRole('button', { name: /feeling lucky/i }));

      await userEvent.click(screen.getByRole('button', { name: /feeling lucky/i }));

      await waitFor(() => {
        expect(screen.getByText('No available group to join')).toBeInTheDocument();
      });
    });
  });

  describe('Group join lock', () => {
    const normalUserNoGroup = {
      id: 'u0000000-0000-0000-0000-000000000010',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      groupId: null,
      groupName: null,
    };

    const normalUserInGroup = {
      id: 'u0000000-0000-0000-0000-000000000010',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      groupId: 'g0000000-0000-0000-0000-000000000001',
      groupName: 'Team Alpha',
    };

    it('shows lock message instead of join UI when lock is enabled and user has no group', async () => {
      useAuth.mockReturnValue({
        user: normalUserNoGroup,
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      api.get.mockImplementation((url) => {
        if (url.includes('group-join-locked')) {
          return Promise.resolve({ data: { locked: true } });
        }
        return Promise.resolve({ data: { groups: [] } });
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/group joining is locked/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /feeling lucky/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^join$/i })).not.toBeInTheDocument();
    });

    it('hides leave button and shows lock message when user is in a group and lock is enabled', async () => {
      useAuth.mockReturnValue({
        user: normalUserInGroup,
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      api.get.mockImplementation((url) => {
        if (url.includes('group-join-locked')) {
          return Promise.resolve({ data: { locked: true } });
        }
        return Promise.resolve({ data: { members: [] } });
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/group joining is locked/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /leave group/i })).not.toBeInTheDocument();
    });

    it('shows leave button and join UI when lock is disabled', async () => {
      useAuth.mockReturnValue({
        user: normalUserInGroup,
        logout: mockLogout,
        refreshUser: mockRefreshUser,
        isAdmin: false,
        isAssignmentManager: false,
      });

      api.get.mockImplementation((url) => {
        if (url.includes('group-join-locked')) {
          return Promise.resolve({ data: { locked: false } });
        }
        return Promise.resolve({ data: { members: [] } });
      });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
      });

      expect(screen.queryByText(/group joining is locked/i)).not.toBeInTheDocument();
    });
  });
});
