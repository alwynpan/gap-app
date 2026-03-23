import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Groups from '../../../src/pages/Groups.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Groups page', () => {
  const groupsData = [
    {
      id: 'g0000000-0000-0000-0000-000000000001',
      name: 'Group A',
      enabled: true,
      member_count: 3,
      max_members: 5,
      created_at: '2025-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { username: 'admin', role: 'admin' }, isAdmin: true, isAssignmentManager: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading spinner before data resolves', () => {
    axios.get.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText(/manage groups/i)).not.toBeInTheDocument();
  });

  it('renders groups after successful fetch', async () => {
    axios.get.mockResolvedValue({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/manage groups/i)).toBeInTheDocument();
      expect(screen.getByText('Group A')).toBeInTheDocument();
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });
  });

  it('shows fetch error state', async () => {
    axios.get.mockRejectedValue(new Error('boom'));

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load groups')).toBeInTheDocument();
    });
  });

  it('shows empty-state text when there are no groups', async () => {
    axios.get.mockResolvedValue({ data: { groups: [] } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No groups created yet')).toBeInTheDocument();
    });
  });

  it('opens create-group modal', async () => {
    axios.get.mockResolvedValue({ data: { groups: [] } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /create group/i }));

    expect(screen.getByText('Create New Group')).toBeInTheDocument();
  });

  it('creates a group and shows success feedback', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValueOnce({ data: { groups: [] } }).mockResolvedValueOnce({
      data: {
        groups: [...groupsData, { ...groupsData[0], id: 'g0000000-0000-0000-0000-000000000002', name: 'New Team' }],
      },
    });
    axios.post.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), ' New Team ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), { name: 'New Team' });
      expect(screen.getByText('Group created successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('Group created successfully')).not.toBeInTheDocument();
    });
  });

  it('does not create a group when name is blank', async () => {
    const user = userEvent.setup();
    axios.get.mockResolvedValue({ data: { groups: [] } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), '   ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('shows fallback error when create group fails without API message', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValue({ data: { groups: [] } });
    axios.post.mockRejectedValue(new Error('network'));

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Team X');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to create group')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('Failed to create group')).not.toBeInTheDocument();
    });
  });

  it('toggles group enabled state', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get
      .mockResolvedValueOnce({ data: { groups: groupsData } })
      .mockResolvedValueOnce({ data: { groups: [{ ...groupsData[0], enabled: false }] } });
    axios.put.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001$/), {
        enabled: false,
      });
      expect(screen.getByText('Group updated successfully')).toBeInTheDocument();
    });
  });

  it('deletes group after confirmation', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValueOnce({ data: { groups: groupsData } }).mockResolvedValueOnce({ data: { groups: [] } });
    axios.delete.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this group?');
      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001$/)
      );
      expect(screen.getByText('Group deleted successfully')).toBeInTheDocument();
    });
  });

  it('does not delete when confirmation is canceled', async () => {
    const user = userEvent.setup();
    window.confirm.mockReturnValue(false);
    axios.get.mockResolvedValue({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('displays member count with max members', async () => {
    axios.get.mockResolvedValue({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Members: 3 \/ 5/)).toBeInTheDocument();
    });
  });

  it('displays unlimited when max_members is null', async () => {
    axios.get.mockResolvedValue({
      data: {
        groups: [{ ...groupsData[0], max_members: null }],
      },
    });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Members: 3 \/ Unlimited/)).toBeInTheDocument();
    });
  });

  it('creates a group with maxMembers', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValueOnce({ data: { groups: [] } }).mockResolvedValueOnce({ data: { groups: groupsData } });
    axios.post.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Limited Team');
    await user.type(screen.getByPlaceholderText(/leave blank for unlimited/i), '10');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), {
        name: 'Limited Team',
        maxMembers: 10,
      });
    });
  });

  it('creates a group without maxMembers', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValueOnce({ data: { groups: [] } }).mockResolvedValueOnce({ data: { groups: groupsData } });
    axios.post.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Unlimited Team');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), {
        name: 'Unlimited Team',
      });
    });
  });

  describe('Group Members', () => {
    const groupsData = [
      {
        id: 'g0000000-0000-0000-0000-000000000001',
        name: 'Group A',
        enabled: true,
        member_count: 2,
        max_members: null,
        created_at: '2025-01-01T00:00:00.000Z',
      },
    ];
    const membersData = [
      {
        id: 'u0000000-0000-0000-0000-000000000010',
        username: 'alice',
        email: 'alice@test.com',
        role_name: 'user',
        student_id: 's1',
        enabled: true,
      },
      {
        id: 'u0000000-0000-0000-0000-000000000011',
        username: 'bob',
        email: 'bob@test.com',
        role_name: 'assignment_manager',
        student_id: null,
        enabled: true,
      },
    ];
    const allUsersData = [
      { id: 'u0000000-0000-0000-0000-000000000010', username: 'alice', email: 'alice@test.com', role_name: 'user' },
      {
        id: 'u0000000-0000-0000-0000-000000000011',
        username: 'bob',
        email: 'bob@test.com',
        role_name: 'assignment_manager',
      },
      { id: 'u0000000-0000-0000-0000-000000000012', username: 'charlie', email: 'charlie@test.com', role_name: 'user' },
    ];

    const setupWithGroups = async () => {
      axios.get.mockResolvedValueOnce({ data: { groups: groupsData } });

      render(
        <MemoryRouter>
          <Groups />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Group A')).toBeInTheDocument();
      });
    };

    it('expands group card to show members', async () => {
      const user = userEvent.setup();
      await setupWithGroups();

      // Mock the expand fetch
      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: membersData },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
        expect(screen.getByText('bob')).toBeInTheDocument();
        expect(screen.getByText('alice@test.com')).toBeInTheDocument();
      });
    });

    it('shows empty members message when group has no members', async () => {
      const user = userEvent.setup();
      await setupWithGroups();

      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: [] },
        })
        .mockResolvedValueOnce({ data: { users: [] } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('No members in this group')).toBeInTheDocument();
      });
    });

    it('removes a member from the group', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupWithGroups();

      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: membersData },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      axios.put.mockResolvedValue({});
      // Mock refetch after remove
      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: [membersData[1]] },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      const removeButtons = screen.getAllByRole('button', { name: /remove/i });
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000010\/group$/),
          { groupId: null }
        );
        expect(screen.getByText('Member removed successfully')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Member removed successfully')).not.toBeInTheDocument();
      });
    });

    it('adds a member to the group', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupWithGroups();

      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: membersData },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      // charlie is the only user not in the group
      const addSelect = screen.getByRole('combobox');
      await user.selectOptions(addSelect, 'u0000000-0000-0000-0000-000000000012');

      axios.put.mockResolvedValue({});
      // Mock refetch after add
      axios.get
        .mockResolvedValueOnce({
          data: {
            group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' },
            members: [...membersData, allUsersData[2]],
          },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByRole('button', { name: /^add$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000012\/group$/),
          { groupId: 'g0000000-0000-0000-0000-000000000001' }
        );
        expect(screen.getByText('Member added successfully')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Member added successfully')).not.toBeInTheDocument();
      });
    });

    it('does not submit add when no user selected', async () => {
      const user = userEvent.setup();
      await setupWithGroups();

      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: membersData },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add$/i }));

      // Only the initial GET calls + expand calls, no PUT
      expect(axios.put).not.toHaveBeenCalled();
    });

    it('shows error when fetching members fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupWithGroups();

      axios.get.mockRejectedValueOnce(new Error('network'));

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('Failed to load group members')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Failed to load group members')).not.toBeInTheDocument();
      });
    });

    it('hides add/remove controls for regular users', async () => {
      useAuth.mockReturnValue({
        user: { username: 'regular', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      const user = userEvent.setup();
      await setupWithGroups();

      // Regular user doesn't fetch /users, only group members
      axios.get.mockResolvedValueOnce({
        data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: membersData },
      });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('hides add member dropdown when group is full', async () => {
      const user = userEvent.setup();
      // Override groupsData with a full group (max_members === member_count after fetch)
      const fullGroupsData = [{ ...groupsData[0], max_members: 2, member_count: 2 }];
      axios.get.mockResolvedValueOnce({ data: { groups: fullGroupsData } });

      render(
        <MemoryRouter>
          <Groups />
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByText('Group A')).toBeInTheDocument());

      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001' }, members: membersData },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      // groupMembers.length (2) === max_members (2), so dropdown must be hidden
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('collapses group on second click', async () => {
      const user = userEvent.setup();
      await setupWithGroups();

      axios.get
        .mockResolvedValueOnce({
          data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: membersData },
        })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.queryByText('alice')).not.toBeInTheDocument();
      });
    });
  });

  it('closes create modal with cancel button and resets fields', async () => {
    const user = userEvent.setup();

    axios.get.mockResolvedValue({ data: { groups: [] } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Test');
    await user.type(screen.getByPlaceholderText(/leave blank for unlimited/i), '5');

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('Create New Group')).not.toBeInTheDocument();
  });

  it('sets group limit via prompt', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    jest.spyOn(window, 'prompt').mockReturnValue('10');
    axios.get
      .mockResolvedValueOnce({ data: { groups: groupsData } })
      .mockResolvedValueOnce({ data: { groups: groupsData } });
    axios.put.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set limit/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /set limit/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001$/), {
        maxMembers: 10,
      });
      expect(screen.getByText('Group limit updated')).toBeInTheDocument();
    });

    window.prompt.mockRestore();
  });

  it('sets group limit to unlimited via empty prompt', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    jest.spyOn(window, 'prompt').mockReturnValue('');
    axios.get
      .mockResolvedValueOnce({ data: { groups: groupsData } })
      .mockResolvedValueOnce({ data: { groups: groupsData } });
    axios.put.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set limit/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /set limit/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001$/), {
        maxMembers: null,
      });
    });

    window.prompt.mockRestore();
  });

  it('cancels set limit when prompt returns null', async () => {
    const user = userEvent.setup();

    jest.spyOn(window, 'prompt').mockReturnValue(null);
    axios.get.mockResolvedValue({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set limit/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /set limit/i }));
    expect(axios.put).not.toHaveBeenCalled();

    window.prompt.mockRestore();
  });

  it('rejects invalid set limit input', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    jest.spyOn(window, 'prompt').mockReturnValue('abc');
    axios.get.mockResolvedValue({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set limit/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /set limit/i }));

    await waitFor(() => {
      expect(screen.getByText('Max members must be a positive number')).toBeInTheDocument();
    });
    expect(axios.put).not.toHaveBeenCalled();

    window.prompt.mockRestore();
  });

  it('shows error when set limit API fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    jest.spyOn(window, 'prompt').mockReturnValue('10');
    axios.get.mockResolvedValue({ data: { groups: groupsData } });
    axios.put.mockRejectedValue({ response: { data: { error: 'Limit too low' } } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /set limit/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /set limit/i }));

    await waitFor(() => {
      expect(screen.getByText('Limit too low')).toBeInTheDocument();
    });

    window.prompt.mockRestore();
  });

  it('shows error when delete fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValue({ data: { groups: groupsData } });
    axios.delete.mockRejectedValue({ response: { data: { error: 'Cannot delete' } } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(screen.getByText('Cannot delete')).toBeInTheDocument();
    });
  });

  it('shows error when remove member fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValueOnce({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Group A')).toBeInTheDocument();
    });

    axios.get
      .mockResolvedValueOnce({
        data: {
          group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' },
          members: [
            { id: 'u0000000-0000-0000-0000-000000000010', username: 'alice', email: 'a@t.com', role_name: 'user' },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { users: [] } });

    await user.click(screen.getByText('Group A'));

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    axios.put.mockRejectedValue({ response: { data: { error: 'Remove failed' } } });
    await user.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(screen.getByText('Remove failed')).toBeInTheDocument();
    });
  });

  it('shows error when add member fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValueOnce({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Group A')).toBeInTheDocument();
    });

    const membersData = [
      { id: 'u0000000-0000-0000-0000-000000000010', username: 'alice', email: 'a@t.com', role_name: 'user' },
    ];
    const allUsersData = [
      { id: 'u0000000-0000-0000-0000-000000000010', username: 'alice', email: 'a@t.com' },
      { id: 'u0000000-0000-0000-0000-000000000012', username: 'charlie', email: 'c@t.com' },
    ];

    axios.get
      .mockResolvedValueOnce({
        data: { group: { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group A' }, members: membersData },
      })
      .mockResolvedValueOnce({ data: { users: allUsersData } });

    await user.click(screen.getByText('Group A'));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), 'u0000000-0000-0000-0000-000000000012');
    axios.put.mockRejectedValue({ response: { data: { error: 'Add failed' } } });
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText('Add failed')).toBeInTheDocument();
    });
  });

  it('shows API error when toggle fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    axios.get.mockResolvedValue({ data: { groups: groupsData } });
    axios.put.mockRejectedValue({ response: { data: { error: 'Cannot update group' } } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => {
      expect(screen.getByText('Cannot update group')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('Cannot update group')).not.toBeInTheDocument();
    });
  });
});
