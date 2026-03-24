import { render, screen, waitFor, within } from '@testing-library/react';
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
      role_name: 'user',
      group_name: null,
      student_id: 's1',
      role_id: 3,
      enabled: true,
    },
  ];
  const initialGroups = [
    { id: 'g0000000-0000-0000-0000-000000000002', name: 'Group A', max_members: null, member_count: 3 },
  ];

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
      expect(screen.getByText('No admin or manager accounts')).toBeInTheDocument();
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
    await user.selectOptions(
      screen.getByRole('combobox', { name: /assign to group/i }),
      'g0000000-0000-0000-0000-000000000002'
    );
    await user.click(screen.getByRole('button', { name: /save/i }));

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

  it('hides full groups from the assign group dropdown', async () => {
    const user = userEvent.setup();
    const fullGroup = {
      id: 'g0000000-0000-0000-0000-000000000003',
      name: 'Full Group',
      max_members: 2,
      member_count: 2,
    };
    const openGroup = {
      id: 'g0000000-0000-0000-0000-000000000004',
      name: 'Open Group',
      max_members: 5,
      member_count: 2,
    };

    axios.get
      .mockResolvedValueOnce({ data: { users: initialUsers } })
      .mockResolvedValueOnce({ data: { groups: [fullGroup, openGroup] } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /assign group/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /assign group/i }));

    const select = screen.getByRole('combobox', { name: /assign to group/i });
    expect(select).toBeInTheDocument();
    expect(select).not.toHaveDisplayValue('Full Group');
    expect(within(select).queryByRole('option', { name: /full group/i })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: /open group/i })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /save/i }));

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
    await user.selectOptions(
      screen.getByRole('combobox', { name: /assign to group/i }),
      'g0000000-0000-0000-0000-000000000002'
    );
    await user.click(screen.getByRole('button', { name: /save/i }));

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
      await user.type(screen.getByPlaceholderText('Enter first name'), 'Test');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'User');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({
            username: 'newuser',
            email: 'new@test.com',
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

    it('shows generic error when user creation fails with 409', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      axios.post.mockRejectedValue({ response: { data: { error: 'Username already exists' }, status: 409 } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'existing');
      await user.type(screen.getByPlaceholderText('Enter email'), 'e@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'Test');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'User');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText('Username or email already in use. Please use a different one.')).toBeInTheDocument();
      });
    });

    it('shows generic error when user creation fails with 400', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      axios.post.mockRejectedValue({ response: { data: { error: 'Invalid input' }, status: 400 } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'baduser');
      await user.type(screen.getByPlaceholderText('Enter email'), 'bad@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'Bad');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'User');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid input. Please check all required fields.')).toBeInTheDocument();
      });
    });

    it('shows generic error when user creation fails with 500', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      axios.post.mockRejectedValue({ response: { data: { error: 'Server error' }, status: 500 } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'baduser');
      await user.type(screen.getByPlaceholderText('Enter email'), 'bad@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'Bad');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'User');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed to create user. Please try again.')).toBeInTheDocument();
      });
    });

    it('admin sees all role options including admin', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));

      const roleSelect = screen
        .getAllByRole('combobox')
        .find((el) => el.querySelector('option[value="user"]') && !el.querySelector('option[value=""]'));
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

      const roleSelect = screen
        .getAllByRole('combobox')
        .find((el) => el.querySelector('option[value="user"]') && !el.querySelector('option[value=""]'));
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
      expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Assignment Manager').length).toBeGreaterThan(0);
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

  it('hides Assign Group button for admin-role users', async () => {
    const adminUser = {
      ...initialUsers[0],
      role_name: 'admin',
    };
    axios.get
      .mockResolvedValueOnce({ data: { users: [adminUser] } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/manage users/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /assign group/i })).not.toBeInTheDocument();
  });

  it('hides Assign Group button for assignment_manager-role users', async () => {
    const managerUser = {
      ...initialUsers[0],
      role_name: 'assignment_manager',
    };
    axios.get
      .mockResolvedValueOnce({ data: { users: [managerUser] } })
      .mockResolvedValueOnce({ data: { groups: initialGroups } });

    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/manage users/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /assign group/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole('combobox', { name: /assign to group/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('combobox', { name: /assign to group/i })).not.toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /edit user profile/i })).toBeInTheDocument();
    });

    it('hides Edit button for regular users (even on their own row)', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.queryByRole('button', { name: /edit user profile/i })).not.toBeInTheDocument();
    });

    it('hides Edit button for user on other users rows', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000099', username: 'other', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.queryByRole('button', { name: /edit user profile/i })).not.toBeInTheDocument();
    });

    it('opens and closes edit modal', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));
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

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      // Username field is disabled and cannot be changed
      const usernameInput = screen.getByDisplayValue('u1');
      expect(usernameInput.disabled).toBe(true);

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

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/),
          expect.objectContaining({ email: 'u1@test.com', firstName: 'NewFirst', lastName: 'NewLast' })
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

    it('admin can edit email, studentId, and enabled fields', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      // Edit email
      const emailInput = screen.getByDisplayValue('u1@test.com');
      await user.clear(emailInput);
      await user.type(emailInput, 'new@test.com');

      // Edit studentId
      const studentInput = screen.getByDisplayValue('s1');
      await user.clear(studentInput);
      await user.type(studentInput, 's999');

      // Toggle enabled
      const enabledCheckbox = screen.getByRole('checkbox', { name: /enabled/i });
      await user.click(enabledCheckbox);

      axios.put.mockResolvedValue({});
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/),
          expect.objectContaining({
            email: 'new@test.com',
            firstName: 'First',
            lastName: 'Last',
            studentId: 's999',
            enabled: false,
          })
        );
      });
    });

    it('admin sees role and enabled fields in edit modal', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      // Admin should see role dropdown and enabled checkbox
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      const roleSelects = screen.getAllByRole('combobox');
      const roleSelect = roleSelects.find((el) => el.querySelector('option[value="admin"]'));
      expect(roleSelect).toBeTruthy();
    });

    it('assignment manager does not see role field but sees enabled field in edit modal', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'am1', role: 'assignment_manager' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      // Assignment managers cannot change role but can toggle enabled
      const modal = screen.getByText('Edit User').closest('div');
      expect(within(modal).queryByLabelText(/role/i)).not.toBeInTheDocument();
      expect(within(modal).getByText('Enabled')).toBeInTheDocument();
    });

    it('shows error when edit fails', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      axios.put.mockRejectedValue({ response: { data: { error: 'Username taken' } } });

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.getByText('Username taken')).toBeInTheDocument();
      });
    });

    it('admin includes role in payload when role is changed', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      const modal = screen.getByText('Edit User').closest('div');
      const roleSelect = within(modal).getByRole('combobox');
      await user.selectOptions(roleSelect, 'assignment_manager');

      axios.put.mockResolvedValue({});
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\//),
          expect.objectContaining({ role: 'assignment_manager' })
        );
      });
    });

    it('assignment manager can toggle enabled and it is included in payload', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000099', username: 'am1', role: 'assignment_manager' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      const enabledCheckbox = screen.getByRole('checkbox', { name: /enabled/i });
      await user.click(enabledCheckbox);

      axios.put.mockResolvedValue({});
      axios.get
        .mockResolvedValueOnce({ data: { users: initialUsers } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\//),
          expect.objectContaining({ enabled: false })
        );
      });
    });
  });

  describe('CSV Export', () => {
    const multiUsers = [
      {
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'admin1',
        first_name: 'Ad',
        last_name: 'Min',
        email: 'admin@test.com',
        role_name: 'admin',
        group_name: null,
        student_id: null,
        role_id: 1,
        enabled: true,
      },
      {
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'nogroup',
        first_name: 'No',
        last_name: 'Group',
        email: 'nogroup@test.com',
        role_name: 'user',
        group_name: null,
        student_id: 's2',
        group_id: null,
        role_id: 3,
        enabled: true,
      },
      {
        id: 'u0000000-0000-0000-0000-000000000003',
        username: 'grouped',
        first_name: 'In',
        last_name: 'Group',
        email: 'grouped@test.com',
        role_name: 'user',
        group_name: 'Team A',
        student_id: 's3',
        group_id: 'g0000000-0000-0000-0000-000000000001',
        role_id: 3,
        enabled: true,
      },
    ];

    let createObjectURL;
    let revokeObjectURL;
    let anchorClick;

    const setupRenderedPage = async () => {
      axios.get
        .mockResolvedValueOnce({ data: { users: multiUsers } })
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

    beforeEach(() => {
      createObjectURL = jest.fn(() => 'blob:mock');
      revokeObjectURL = jest.fn();
      anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      global.URL.createObjectURL = createObjectURL;
      global.URL.revokeObjectURL = revokeObjectURL;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('shows Export All button', async () => {
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /export all/i })).toBeInTheDocument();
    });

    it('shows per-section export buttons', async () => {
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /export administrators/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export users without a group/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export users in a group/i })).toBeInTheDocument();
    });

    it('triggers download when Export All is clicked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export all/i }));

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(anchorClick).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    const readBlob = (blob) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(blob);
      });

    it('exports only administrators when section export is clicked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export administrators/i }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const text = await readBlob(createObjectURL.mock.calls[0][0]);
      expect(text).toContain('admin1');
      expect(text).not.toContain('nogroup');
      expect(text).not.toContain('grouped');
    });

    it('exports only ungrouped users when section export is clicked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export users without a group/i }));

      const text = await readBlob(createObjectURL.mock.calls[0][0]);
      expect(text).toContain('nogroup');
      expect(text).not.toContain('admin1');
      expect(text).not.toContain('grouped');
    });

    it('exports only grouped users when section export is clicked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export users in a group/i }));

      const text = await readBlob(createObjectURL.mock.calls[0][0]);
      expect(text).toContain('grouped');
      expect(text).not.toContain('admin1');
      expect(text).not.toContain('nogroup');
    });

    it('CSV includes correct headers and data', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export all/i }));

      const text = await readBlob(createObjectURL.mock.calls[0][0]);
      const lines = text.split('\n');
      expect(lines[0]).toBe('Username,First Name,Last Name,Email,Role,Group,Student ID');
      expect(text).toContain('admin@test.com');
      expect(text).toContain('Team A');
    });
  });

  // ── Delete user ────────────────────────────────────────────────────────
  describe('Delete user', () => {
    const setupDeletePage = async (users = initialUsers) => {
      axios.get.mockResolvedValueOnce({ data: { users } }).mockResolvedValueOnce({ data: { groups: initialGroups } });
      render(
        <MemoryRouter>
          <Users />
        </MemoryRouter>
      );
      await waitFor(() => expect(screen.getByText(/manage users/i)).toBeInTheDocument());
    };

    it('shows Delete User button for other users when admin', async () => {
      await setupDeletePage();
      expect(screen.getByRole('button', { name: /delete user/i })).toBeInTheDocument();
    });

    it('does not show Delete User button for the current logged-in user', async () => {
      const usersWithSelf = [
        ...initialUsers,
        { ...initialUsers[0], id: 'u0000000-0000-0000-0000-000000000099', username: 'myself', email: 'm@t.com' },
      ];
      await setupDeletePage(usersWithSelf);
      // only u1 (not myself) should have the button
      expect(screen.getAllByRole('button', { name: /delete user/i })).toHaveLength(1);
    });

    it('does not show Delete User button when not admin', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000099' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      await setupDeletePage();
      expect(screen.queryByRole('button', { name: /delete user/i })).not.toBeInTheDocument();
    });

    it('opens delete confirmation modal when delete icon is clicked', async () => {
      const user = userEvent.setup();
      await setupDeletePage();

      await user.click(screen.getByRole('button', { name: /delete user/i }));

      expect(screen.getByText(/delete 1 user\?/i)).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });

    it('shows group warning when user being deleted is in a group', async () => {
      const userInGroup = {
        ...initialUsers[0],
        group_id: 'g0000000-0000-0000-0000-000000000002',
        group_name: 'Group A',
      };
      const user = userEvent.setup();
      await setupDeletePage([userInGroup]);

      await user.click(screen.getByRole('button', { name: /delete user/i }));

      const modal = screen.getByText(/will be unassigned/i).closest('.bg-white');
      expect(modal).toHaveTextContent(/group a/i);
    });

    it('does not show warning when user is not in a group', async () => {
      const user = userEvent.setup();
      await setupDeletePage([{ ...initialUsers[0], group_id: null, group_name: null }]);

      await user.click(screen.getByRole('button', { name: /delete user/i }));

      expect(screen.queryByText(/will be unassigned/i)).not.toBeInTheDocument();
    });

    it('deletes user after confirmation and shows success', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupDeletePage();
      axios.delete.mockResolvedValueOnce({});
      axios.get
        .mockResolvedValueOnce({ data: { users: [] } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /delete user/i }));
      await user.click(screen.getByRole('button', { name: /delete 1 user$/i }));

      await waitFor(() => {
        expect(axios.delete).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/)
        );
        expect(screen.getByText('User deleted successfully')).toBeInTheDocument();
      });
    });

    it('cancels delete modal without deleting', async () => {
      const user = userEvent.setup();
      await setupDeletePage();

      await user.click(screen.getByRole('button', { name: /delete user/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(axios.delete).not.toHaveBeenCalled();
      expect(screen.queryByText(/delete 1 user\?/i)).not.toBeInTheDocument();
    });

    it('shows error when delete fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupDeletePage();
      axios.delete.mockRejectedValue({ response: { data: { error: 'Cannot delete user' } } });

      await user.click(screen.getByRole('button', { name: /delete user/i }));
      await user.click(screen.getByRole('button', { name: /delete 1 user$/i }));

      await waitFor(() => expect(screen.getByText('Cannot delete user')).toBeInTheDocument());
    });

    it('shows toolbar Delete (N) button when rows are selected', async () => {
      const user = userEvent.setup();
      await setupDeletePage();

      await user.click(screen.getByRole('checkbox', { name: /select u1/i }));

      expect(screen.getByRole('button', { name: /delete \(1\)/i })).toBeInTheDocument();
    });

    it('hides toolbar Delete button when selection is cleared', async () => {
      const user = userEvent.setup();
      await setupDeletePage();

      const cb = screen.getByRole('checkbox', { name: /select u1/i });
      await user.click(cb);
      expect(screen.getByRole('button', { name: /delete \(1\)/i })).toBeInTheDocument();

      await user.click(cb);
      expect(screen.queryByRole('button', { name: /delete \(1\)/i })).not.toBeInTheDocument();
    });

    it('section select-all selects all selectable users in that section', async () => {
      const user = userEvent.setup();
      const twoUsers = [
        { ...initialUsers[0], id: 'u1', username: 'user1', email: 'u1@t.com' },
        { ...initialUsers[0], id: 'u2', username: 'user2', email: 'u2@t.com' },
      ];
      await setupDeletePage(twoUsers);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a group/i }));

      expect(screen.getByRole('button', { name: /delete \(2\)/i })).toBeInTheDocument();
    });

    it('section select-all does not select the current logged-in user', async () => {
      const user = userEvent.setup();
      const usersWithSelf = [
        { ...initialUsers[0], id: 'u1', username: 'other', email: 'o@t.com' },
        { ...initialUsers[0], id: 'u0000000-0000-0000-0000-000000000099', username: 'me', email: 'm@t.com' },
      ];
      await setupDeletePage(usersWithSelf);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a group/i }));

      // 'me' is the current user and must be excluded — only 1 user selected
      expect(screen.getByRole('button', { name: /delete \(1\)/i })).toBeInTheDocument();
    });

    it('bulk deletes all selected users and shows success', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const twoUsers = [
        { ...initialUsers[0], id: 'u1', username: 'user1', email: 'u1@t.com' },
        { ...initialUsers[0], id: 'u2', username: 'user2', email: 'u2@t.com' },
      ];
      await setupDeletePage(twoUsers);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a group/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      axios.delete.mockResolvedValue({});
      axios.get
        .mockResolvedValueOnce({ data: { users: [] } })
        .mockResolvedValueOnce({ data: { groups: initialGroups } });

      await user.click(screen.getByRole('button', { name: /delete 2 users/i }));

      await waitFor(() => {
        expect(axios.delete).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Deleted 2 users')).toBeInTheDocument();
      });
    });
  });
});
