import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Users from '../../../src/pages/Users.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Users page', () => {
  const initialUsers = [
    { id: 1, username: 'u1', email: 'u1@test.com', role_name: 'normal_user', group_name: null, student_id: 's1' },
  ];
  const initialGroups = [{ id: 2, name: 'Group A' }];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      user: { username: 'admin', role: 'admin' },
      isAdmin: true,
      isTeamManager: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading spinner before data resolves', () => {
    axios.get.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText(/manage users/i)).not.toBeInTheDocument();
  });

  it('renders users after successful fetch', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { users: initialUsers } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/manage users/i)).toBeInTheDocument();
      expect(screen.getByText('u1')).toBeInTheDocument();
      expect(screen.getByText('u1@test.com')).toBeInTheDocument();
      expect(screen.getByText('Not assigned')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    axios.get.mockRejectedValue(new Error('nope'));

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    });
  });

  it('shows empty state when no users are returned', async () => {
    axios.get.mockResolvedValue({ data: { users: [], groups: [] } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No users found')).toBeInTheDocument();
    });
  });

  it('assigns a group and shows success feedback', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get
      .mockResolvedValueOnce({ data: { users: initialUsers } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } })
      .mockResolvedValueOnce({
        data: { users: [{ ...initialUsers[0], group_name: 'Group A' }] },
      })
      .mockResolvedValueOnce({ data: { groups: initialGroups } });
    axios.put.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /assign group/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /assign group/i }));
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/users\/1\/group$/), { groupId: 2 });
      expect(screen.getByText('User group updated successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('User group updated successfully')).not.toBeInTheDocument();
    });
  });

  it('does not submit assignment when group is not selected', async () => {
    const user = userEvent.setup();

    axios.get
      .mockResolvedValueOnce({ data: { users: initialUsers } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /assign group/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /assign group/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(axios.put).not.toHaveBeenCalled();
  });

  it('shows API error when group update fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get
      .mockResolvedValueOnce({ data: { users: initialUsers } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } });
    axios.put.mockRejectedValue({ response: { data: { error: 'Update denied' } } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /assign group/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /assign group/i }));
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText('Update denied')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('Update denied')).not.toBeInTheDocument();
    });
  });

  describe('Create User', () => {
    const setupRenderedPage = async () => {
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      render(
        <MemoryRouter>
          <Users />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/manage users/i)).toBeInTheDocument();
      });
    };

    it('shows Create User button for admin', async () => {
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
    });

    it('shows Create User button for team_manager', async () => {
      useAuth.mockReturnValue({
        user: { username: 'manager', role: 'team_manager' },
        isAdmin: false,
        isTeamManager: true,
      });
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
    });

    it('hides Create User button for regular user', async () => {
      useAuth.mockReturnValue({
        user: { username: 'regularuser', role: 'user' },
        isAdmin: false,
        isTeamManager: false,
      });
      await setupRenderedPage();
      expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
    });

    it('opens and closes create user modal', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));
      expect(screen.getByText('Create New User')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText('Create New User')).not.toBeInTheDocument();
    });

    it('creates a user and shows success feedback', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      axios.post.mockResolvedValue({ data: { message: 'User created successfully' } });
      // Mock refetch after create
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'newuser');
      await user.type(screen.getByPlaceholderText('Enter email'), 'new@test.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'password123');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({
            username: 'newuser',
            email: 'new@test.com',
            password: 'password123',
            role: 'user',
          })
        );
        expect(screen.getByText('User created successfully')).toBeInTheDocument();
      });

      // Modal should be closed
      expect(screen.queryByText('Create New User')).not.toBeInTheDocument();

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('User created successfully')).not.toBeInTheDocument();
      });
    });

    it('shows error when user creation fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      axios.post.mockRejectedValue({ response: { data: { error: 'Username already exists' } } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'existing');
      await user.type(screen.getByPlaceholderText('Enter email'), 'e@test.com');
      await user.type(screen.getByPlaceholderText('Enter password'), 'password123');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText('Username already exists')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Username already exists')).not.toBeInTheDocument();
      });
    });

    it('admin sees all role options including admin', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));

      const roleSelect = screen.getAllByRole('combobox').find((el) => el.querySelector('option[value="user"]'));
      const options = Array.from(roleSelect.querySelectorAll('option')).map((o) => o.value);
      expect(options).toEqual(['user', 'team_manager', 'admin']);
    });

    it('team_manager does not see admin role option', async () => {
      useAuth.mockReturnValue({
        user: { username: 'manager', role: 'team_manager' },
        isAdmin: false,
        isTeamManager: true,
      });
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));

      const roleSelect = screen.getAllByRole('combobox').find((el) => el.querySelector('option[value="user"]'));
      const options = Array.from(roleSelect.querySelectorAll('option')).map((o) => o.value);
      expect(options).toEqual(['user', 'team_manager']);
      expect(options).not.toContain('admin');
    });
  });
});
