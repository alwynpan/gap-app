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
    { id: 1, username: 'u1', email: 'u1@test.com', role_name: 'normal_user', group_name: null, student_id: 's1', role_id: 3, enabled: true },
  ];
  const initialGroups = [{ id: 2, name: 'Group A' }];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: 99, username: 'admin', role: 'admin' },
      isAdmin: true,
      isAssignmentManager: true,
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

    it('shows Create User button for assignment_manager', async () => {
      useAuth.mockReturnValue({
        user: { username: 'manager', role: 'assignment_manager' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
    });

    it('hides Create User button for regular user', async () => {
      useAuth.mockReturnValue({
        user: { username: 'regularuser', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
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
      expect(options).toEqual(['user', 'assignment_manager', 'admin']);
    });

    it('allows selecting a group in create form', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));

      const groupSelect = screen.getAllByRole('combobox').find((el) => el.querySelector('option[value="2"]'));
      expect(groupSelect).toBeTruthy();
      await user.selectOptions(groupSelect, '2');
      expect(groupSelect.value).toBe('2');
    });

    it('assignment_manager does not see admin role option', async () => {
      useAuth.mockReturnValue({
        user: { username: 'manager', role: 'assignment_manager' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));

      const roleSelect = screen.getAllByRole('combobox').find((el) => el.querySelector('option[value="user"]'));
      const options = Array.from(roleSelect.querySelectorAll('option')).map((o) => o.value);
      expect(options).toEqual(['user', 'assignment_manager']);
      expect(options).not.toContain('admin');
    });
  });

  it('displays formatted role names instead of raw values', async () => {
    const usersWithRoles = [
      { id: 1, username: 'u1', email: 'u1@test.com', role_name: 'admin', group_name: null, student_id: null, role_id: 1, enabled: true },
      { id: 2, username: 'u2', email: 'u2@test.com', role_name: 'assignment_manager', group_name: null, student_id: null, role_id: 2, enabled: true },
      { id: 3, username: 'u3', email: 'u3@test.com', role_name: 'user', group_name: null, student_id: null, role_id: 3, enabled: true },
    ];

    axios.get
      .mockResolvedValueOnce({ data: { users: usersWithRoles } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Assignment Manager')).toBeInTheDocument();
    });

    // Verify raw role values don't appear in role badge spans
    const roleBadges = document.querySelectorAll('span.rounded-full');
    const badgeTexts = Array.from(roleBadges).map((el) => el.textContent);
    expect(badgeTexts).not.toContain('admin');
    expect(badgeTexts).not.toContain('assignment_manager');
    expect(badgeTexts).toContain('Admin');
    expect(badgeTexts).toContain('Assignment Manager');
    expect(badgeTexts).toContain('User');
  });

  it('cancels group assignment inline', async () => {
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
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  describe('Edit User', () => {
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

    it('shows Edit button for admin on all users', async () => {
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });

    it('shows Edit button for user on their own row only', async () => {
      useAuth.mockReturnValue({
        user: { id: 1, username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });

    it('hides Edit button for user on other users rows', async () => {
      useAuth.mockReturnValue({
        user: { id: 999, username: 'other', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    });

    it('opens and closes edit modal', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^edit$/i }));
      expect(screen.getByText('Edit User')).toBeInTheDocument();
      expect(screen.getByDisplayValue('u1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('u1@test.com')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
    });

    it('admin can edit user and save successfully', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      const usernameInput = screen.getByDisplayValue('u1');
      await user.clear(usernameInput);
      await user.type(usernameInput, 'updated_u1');

      axios.put.mockResolvedValue({});
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/1$/),
          expect.objectContaining({ username: 'updated_u1' })
        );
        expect(screen.getByText('User updated successfully')).toBeInTheDocument();
      });

      // Modal should be closed
      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('User updated successfully')).not.toBeInTheDocument();
      });
    });

    it('admin sees role and enabled fields in edit modal', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      // Admin should see role dropdown and enabled checkbox
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      const roleSelects = screen.getAllByRole('combobox');
      const roleSelect = roleSelects.find((el) => el.querySelector('option[value="1"]'));
      expect(roleSelect).toBeTruthy();
    });

    it('non-admin does not see role and enabled fields in edit modal', async () => {
      useAuth.mockReturnValue({
        user: { id: 1, username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
    });

    it('shows error when edit fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      axios.put.mockRejectedValue({ response: { data: { error: 'Username taken' } } });

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(screen.getByText('Username taken')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Username taken')).not.toBeInTheDocument();
      });
    });
  });
});
