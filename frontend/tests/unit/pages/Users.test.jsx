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
    {
      id: 'u0000000-0000-0000-0000-000000000001',
      username: 'u1',
      email: 'u1@test.com',
      first_name: 'First',
      last_name: 'Last',
      role_name: 'normal_user',
      group_name: null,
      student_id: 's1',
      role_id: 3,
      enabled: true,
    },
  ];
  const initialGroups = [{ id: 'g0000000-0000-0000-0000-000000000002', name: 'Group A' }];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: 'u0000000-0000-0000-0000-000000000099', username: 'admin', role: 'admin' },
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
    await user.selectOptions(screen.getByRole('combobox'), 'g0000000-0000-0000-0000-000000000002');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/group$/),
        { groupId: 'g0000000-0000-0000-0000-000000000002' }
      );
      expect(screen.getByText('User group updated successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('User group updated successfully')).not.toBeInTheDocument();
    });
  });

  it('removes user from group when "No Group" is selected', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const usersInGroup = [
      { ...initialUsers[0], group_name: 'Group A', group_id: 'g0000000-0000-0000-0000-000000000002' },
    ];

    axios.get
      .mockResolvedValueOnce({ data: { users: usersInGroup } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } })
      .mockResolvedValueOnce({ data: { users: initialUsers } })
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
    // "No Group" (value="") is already the default selection
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/group$/),
        {
          groupId: null,
        }
      );
      expect(screen.getByText('User group updated successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('User group updated successfully')).not.toBeInTheDocument();
    });
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
    await user.selectOptions(screen.getByRole('combobox'), 'g0000000-0000-0000-0000-000000000002');
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

      const groupSelect = screen
        .getAllByRole('combobox')
        .find((el) => el.querySelector('option[value="g0000000-0000-0000-0000-000000000002"]'));
      expect(groupSelect).toBeTruthy();
      await user.selectOptions(groupSelect, 'g0000000-0000-0000-0000-000000000002');
      expect(groupSelect.value).toBe('g0000000-0000-0000-0000-000000000002');
    });

    it('sends firstName and lastName when creating a user', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      axios.post.mockResolvedValue({ data: { message: 'User created' } });
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'jdoe');
      await user.type(screen.getByPlaceholderText('Enter email'), 'j@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'John');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'Doe');
      await user.type(screen.getByPlaceholderText('Enter password'), 'pass123');
      await user.type(screen.getByPlaceholderText('Enter student ID'), 'ST99');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({
            username: 'jdoe',
            email: 'j@test.com',
            firstName: 'John',
            lastName: 'Doe',
            password: 'pass123',
            studentId: 'ST99',
          })
        );
      });
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
      {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'u1',
        email: 'u1@test.com',
        role_name: 'admin',
        group_name: null,
        student_id: null,
        role_id: 1,
        enabled: true,
      },
      {
        id: 'u0000000-0000-0000-0000-000000000010',
        username: 'u2',
        email: 'u2@test.com',
        role_name: 'assignment_manager',
        group_name: null,
        student_id: null,
        role_id: 2,
        enabled: true,
      },
      {
        id: 'u0000000-0000-0000-0000-000000000011',
        username: 'u3',
        email: 'u3@test.com',
        role_name: 'user',
        group_name: null,
        student_id: null,
        role_id: 3,
        enabled: true,
      },
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
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });

    it('hides Edit button for user on other users rows', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000099', username: 'other', role: 'user' },
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

      const firstNameInput = screen.getByDisplayValue('First');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'NewFirst');

      const lastNameInput = screen.getByDisplayValue('Last');
      await user.clear(lastNameInput);
      await user.type(lastNameInput, 'NewLast');

      axios.put.mockResolvedValue({});
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/),
          expect.objectContaining({ username: 'updated_u1', firstName: 'NewFirst', lastName: 'NewLast' })
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

    it('admin can edit email, studentId, role and enabled fields', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      // Edit email
      const emailInput = screen.getByDisplayValue('u1@test.com');
      await user.clear(emailInput);
      await user.type(emailInput, 'new@test.com');

      // Edit studentId
      const studentInput = screen.getByDisplayValue('s1');
      await user.clear(studentInput);
      await user.type(studentInput, 's999');

      // Change role
      const roleSelect = screen.getAllByRole('combobox').find((el) => el.querySelector('option[value="1"]'));
      await user.selectOptions(roleSelect, '2');

      // Toggle enabled
      const enabledCheckbox = screen.getByRole('checkbox');
      await user.click(enabledCheckbox);

      axios.put.mockResolvedValue({});
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/),
          expect.objectContaining({
            email: 'new@test.com',
            studentId: 's999',
            roleId: '2',
            enabled: false,
          })
        );
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
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'u1', role: 'user' },
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

  describe('Change Password', () => {
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

    it('shows Password button for admin on all users', async () => {
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /^password$/i })).toBeInTheDocument();
    });

    it('shows Password button for user on their own row', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /^password$/i })).toBeInTheDocument();
    });

    it('hides Password button for user on other users rows', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000099', username: 'other', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.queryByRole('button', { name: /^password$/i })).not.toBeInTheDocument();
    });

    it('opens and closes password change modal', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^password$/i }));
      expect(screen.getByText(/change password for/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText(/change password for/i)).not.toBeInTheDocument();
    });

    it('admin does not see current password field', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^password$/i }));
      expect(screen.queryByPlaceholderText('Enter current password')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter new password')).toBeInTheDocument();
    });

    it('non-admin sees and can type into current password field', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^password$/i }));
      const currentPwInput = screen.getByPlaceholderText('Enter current password');
      expect(currentPwInput).toBeInTheDocument();
      await user.type(currentPwInput, 'myoldpass');
      expect(currentPwInput.value).toBe('myoldpass');
    });

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^password$/i }));
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass1');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass2');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
      });
    });

    it('shows error when password is too short', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /^password$/i }));
      await user.type(screen.getByPlaceholderText('Enter new password'), '12345');
      await user.type(screen.getByPlaceholderText('Confirm new password'), '12345');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(screen.getByText('New password must be at least 6 characters')).toBeInTheDocument();
      });
    });

    it('successfully changes password', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      axios.put.mockResolvedValue({});

      await user.click(screen.getByRole('button', { name: /^password$/i }));
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/password$/),
          {
            newPassword: 'newpass123',
          }
        );
        expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Password changed successfully')).not.toBeInTheDocument();
      });
    });

    it('shows API error when password change fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      axios.put.mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } });

      await user.click(screen.getByRole('button', { name: /^password$/i }));
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });
    });
  });
});
