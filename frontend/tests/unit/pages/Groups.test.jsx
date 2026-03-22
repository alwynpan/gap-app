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
  const groupsData = [{ id: 1, name: 'Group A', enabled: true, created_at: '2025-01-01T00:00:00.000Z' }];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { username: 'admin', role: 'admin' }, isAdmin: true, isTeamManager: true });
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

    axios.get
      .mockResolvedValueOnce({ data: { groups: [] } })
      .mockResolvedValueOnce({ data: { groups: [...groupsData, { ...groupsData[0], id: 2, name: 'New Team' }] } });
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
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/1$/), { enabled: false });
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
      expect(axios.delete).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/1$/));
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

  describe('Group Members', () => {
    const groupsData = [{ id: 1, name: 'Group A', enabled: true, created_at: '2025-01-01T00:00:00.000Z' }];
    const membersData = [
      { id: 10, username: 'alice', email: 'alice@test.com', role_name: 'user', student_id: 's1', enabled: true },
      { id: 11, username: 'bob', email: 'bob@test.com', role_name: 'team_manager', student_id: null, enabled: true },
    ];
    const allUsersData = [
      { id: 10, username: 'alice', email: 'alice@test.com', role_name: 'user' },
      { id: 11, username: 'bob', email: 'bob@test.com', role_name: 'team_manager' },
      { id: 12, username: 'charlie', email: 'charlie@test.com', role_name: 'user' },
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
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: membersData } })
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
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: [] } })
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
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      axios.put.mockResolvedValue({});
      // Mock refetch after remove
      axios.get
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: [membersData[1]] } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      const removeButtons = screen.getAllByRole('button', { name: /remove/i });
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/10\/group$/),
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
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      // charlie is the only user not in the group
      const addSelect = screen.getByRole('combobox');
      await user.selectOptions(addSelect, '12');

      axios.put.mockResolvedValue({});
      // Mock refetch after add
      axios.get
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: [...membersData, allUsersData[2]] } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByRole('button', { name: /^add$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/12\/group$/),
          { groupId: 1 }
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
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: membersData } })
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
        isTeamManager: false,
      });
      const user = userEvent.setup();
      await setupWithGroups();

      // Regular user doesn't fetch /users, only group members
      axios.get
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: membersData } });

      await user.click(screen.getByText('Group A'));

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('collapses group on second click', async () => {
      const user = userEvent.setup();
      await setupWithGroups();

      axios.get
        .mockResolvedValueOnce({ data: { group: { id: 1, name: 'Group A' }, members: membersData } })
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
