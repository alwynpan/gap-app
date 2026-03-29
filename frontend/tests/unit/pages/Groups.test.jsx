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

jest.mock('../../../src/utils/csv.js', () => ({
  downloadCsv: jest.fn(),
}));

const makeGroup = (overrides = {}) => ({
  id: 'g0000000-0000-0000-0000-000000000001',
  name: 'Group A',
  enabled: true,
  member_count: 3,
  max_members: 5,
  created_at: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

describe('Groups page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ isAssignmentManager: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const setupPage = async (groups = [makeGroup()]) => {
    axios.get.mockResolvedValueOnce({ data: { groups } });
    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/manage groups/i)).toBeInTheDocument());
  };

  // ── Loading / fetch ────────────────────────────────────────────────────
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

  it('shows empty-state text when there are no groups', async () => {
    await setupPage([]);
    expect(screen.getByText('No groups created yet')).toBeInTheDocument();
  });

  it('shows fetch error state', async () => {
    axios.get.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Failed to load groups')).toBeInTheDocument());
  });

  it('renders group name and member count after successful fetch', async () => {
    await setupPage();
    expect(screen.getByText('Group A')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('shows ∞ when max_members is null', async () => {
    await setupPage([makeGroup({ max_members: null })]);
    expect(screen.getByText('3 / ∞')).toBeInTheDocument();
  });

  // ── Three sections ─────────────────────────────────────────────────────
  it('places open group in "Groups with space" section', async () => {
    await setupPage([makeGroup({ member_count: 2, max_members: 5 })]);
    expect(screen.getByText(/groups with space/i)).toBeInTheDocument();
  });

  it('places unlimited group in "Groups with space" section', async () => {
    await setupPage([makeGroup({ member_count: 10, max_members: null })]);
    expect(screen.getByText(/groups with space/i)).toBeInTheDocument();
  });

  it('places full group in "Groups full" section', async () => {
    await setupPage([makeGroup({ member_count: 5, max_members: 5 })]);
    expect(screen.getByText(/groups full/i)).toBeInTheDocument();
  });

  it('places disabled group in "Disabled groups" section', async () => {
    await setupPage([makeGroup({ enabled: false })]);
    expect(screen.getByText(/disabled groups/i)).toBeInTheDocument();
  });

  it('shows correct counts in section headings', async () => {
    await setupPage([
      makeGroup({ id: 'g1', name: 'Open', member_count: 1, max_members: 5 }),
      makeGroup({ id: 'g2', name: 'Full', member_count: 3, max_members: 3 }),
      makeGroup({ id: 'g3', name: 'Disabled', enabled: false }),
    ]);
    expect(screen.getByText(/groups with space/i).closest('h3')).toHaveTextContent('(1)');
    expect(screen.getByText(/groups full/i).closest('h3')).toHaveTextContent('(1)');
    expect(screen.getByText(/disabled groups/i).closest('h3')).toHaveTextContent('(1)');
  });

  // ── Action icon buttons ────────────────────────────────────────────────
  it('shows disable, set-limit, and delete icon buttons', async () => {
    await setupPage();
    expect(screen.getByRole('button', { name: 'Disable Group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Member Limit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Group' })).toBeInTheDocument();
  });

  it('shows enable button for a disabled group', async () => {
    await setupPage([makeGroup({ enabled: false })]);
    expect(screen.getByRole('button', { name: 'Enable Group' })).toBeInTheDocument();
  });

  it('disables a group and shows success feedback', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    axios.put.mockResolvedValueOnce({});
    axios.get.mockResolvedValueOnce({ data: { groups: [makeGroup({ enabled: false })] } });

    await user.click(screen.getByRole('button', { name: 'Disable Group' }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001$/), {
        enabled: false,
      });
      expect(screen.getByText('Group disabled successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Group disabled successfully')).not.toBeInTheDocument());
  });

  it('enables a disabled group', async () => {
    const user = userEvent.setup();
    await setupPage([makeGroup({ enabled: false })]);
    axios.put.mockResolvedValueOnce({});
    axios.get.mockResolvedValueOnce({ data: { groups: [makeGroup()] } });

    await user.click(screen.getByRole('button', { name: 'Enable Group' }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\//), { enabled: true });
    });
  });

  it('shows API error when toggle fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    axios.put.mockRejectedValue({ response: { data: { error: 'Cannot update group' } } });

    await user.click(screen.getByRole('button', { name: 'Disable Group' }));

    await waitFor(() => expect(screen.getByText('Cannot update group')).toBeInTheDocument());

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Cannot update group')).not.toBeInTheDocument());
  });

  // ── Delete ─────────────────────────────────────────────────────────────
  it('opens delete confirmation modal when delete icon is clicked', async () => {
    const user = userEvent.setup();
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));

    expect(screen.getByText(/delete 1 group\?/i)).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('shows member warning in single-group delete modal when group has members', async () => {
    const user = userEvent.setup();
    await setupPage([makeGroup({ member_count: 3 })]);

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));

    expect(screen.getByText(/will be unassigned/i)).toBeInTheDocument();
    expect(screen.getByText(/3 members/i)).toBeInTheDocument();
  });

  it('does not show warning in single-group delete modal when group has no members', async () => {
    const user = userEvent.setup();
    await setupPage([makeGroup({ member_count: 0 })]);

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));

    expect(screen.queryByText(/will be unassigned/i)).not.toBeInTheDocument();
  });

  it('deletes group after modal confirmation and shows success', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    axios.delete.mockResolvedValueOnce({});
    axios.get.mockResolvedValueOnce({ data: { groups: [] } });

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    await user.click(screen.getByRole('button', { name: /delete 1 group$/i }));

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001$/)
      );
      expect(screen.getByText('Group deleted successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Group deleted successfully')).not.toBeInTheDocument());
  });

  it('cancels single-group delete modal without deleting', async () => {
    const user = userEvent.setup();
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(axios.delete).not.toHaveBeenCalled();
    expect(screen.queryByText(/delete 1 group\?/i)).not.toBeInTheDocument();
  });

  it('shows error when delete fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    axios.delete.mockRejectedValue({ response: { data: { error: 'Cannot delete' } } });

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    await user.click(screen.getByRole('button', { name: /delete 1 group$/i }));

    await waitFor(() => expect(screen.getByText('Cannot delete')).toBeInTheDocument());
  });

  // ── Set Limit modal ────────────────────────────────────────────────────
  it('opens set limit modal with current value pre-filled', async () => {
    const user = userEvent.setup();
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));

    expect(screen.getByRole('heading', { name: 'Set Member Limit' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Unlimited')).toHaveValue(5);
  });

  it('saves a numeric limit via modal', async () => {
    const user = userEvent.setup();
    await setupPage();
    axios.put.mockResolvedValueOnce({});
    axios.get.mockResolvedValueOnce({ data: { groups: [makeGroup({ max_members: 10 })] } });

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    const input = screen.getByPlaceholderText('Unlimited');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g0000000-0000-0000-0000-000000000001$/), {
        maxMembers: 10,
      });
      expect(screen.getByText('Group limit updated')).toBeInTheDocument();
    });
  });

  it('saves unlimited (blank) limit via modal', async () => {
    const user = userEvent.setup();
    await setupPage();
    axios.put.mockResolvedValueOnce({});
    axios.get.mockResolvedValueOnce({ data: { groups: [makeGroup({ max_members: null })] } });

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    await user.clear(screen.getByPlaceholderText('Unlimited'));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\//), { maxMembers: null });
    });
  });

  it('rejects invalid limit input', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    const input = screen.getByPlaceholderText('Unlimited');
    await user.clear(input);
    await user.type(input, '0'); // 0 is rejected since min is 1
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText('Max members must be a positive number')).toBeInTheDocument());
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('cancels the set limit modal', async () => {
    const user = userEvent.setup();
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    expect(screen.getByRole('heading', { name: 'Set Member Limit' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('heading', { name: 'Set Member Limit' })).not.toBeInTheDocument();
  });

  it('shows error when set limit API fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    axios.put.mockRejectedValue({ response: { data: { error: 'Limit too low' } } });

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText('Limit too low')).toBeInTheDocument());
  });

  // ── Create group modal ─────────────────────────────────────────────────
  it('opens create-group modal', async () => {
    await setupPage([]);
    await userEvent.click(screen.getByRole('button', { name: /create group/i }));
    expect(screen.getByText('Create New Group')).toBeInTheDocument();
  });

  it('creates a group and shows success feedback', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage([]);
    axios.post.mockResolvedValueOnce({});
    axios.get.mockResolvedValueOnce({ data: { groups: [makeGroup()] } });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), ' New Team ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), { name: 'New Team' });
      expect(screen.getByText('Group created successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Group created successfully')).not.toBeInTheDocument());
  });

  it('creates a group with maxMembers', async () => {
    const user = userEvent.setup();
    await setupPage([]);
    axios.post.mockResolvedValueOnce({});
    axios.get.mockResolvedValueOnce({ data: { groups: [makeGroup()] } });

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

  it('does not create a group when name is blank', async () => {
    const user = userEvent.setup();
    await setupPage([]);

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), '   ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('shows error inside modal when create group fails', async () => {
    const user = userEvent.setup();
    await setupPage([]);
    axios.post.mockRejectedValue(new Error('network'));

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Team X');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText('Failed to create group')).toBeInTheDocument());

    // Error clears when the modal is cancelled
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('Failed to create group')).not.toBeInTheDocument();
  });

  it('cancels create modal and resets fields', async () => {
    const user = userEvent.setup();
    await setupPage([]);

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText('Create New Group')).not.toBeInTheDocument();
  });

  // ── Expand row / members ───────────────────────────────────────────────
  describe('Group Members', () => {
    const membersData = [
      {
        id: 'u0000000-0000-0000-0000-000000000010',
        username: 'alice',
        email: 'alice@test.com',
        first_name: 'Alice',
        last_name: 'Smith',
        student_id: 'S001',
        role_name: 'user',
      },
      {
        id: 'u0000000-0000-0000-0000-000000000011',
        username: 'bob',
        email: 'bob@test.com',
        first_name: 'Bob',
        last_name: 'Jones',
        student_id: null,
        role_name: 'assignment_manager',
      },
    ];
    const allUsersData = [
      ...membersData,
      {
        id: 'u0000000-0000-0000-0000-000000000012',
        username: 'charlie',
        email: 'charlie@test.com',
        first_name: 'Charlie',
        last_name: 'Brown',
        student_id: 'S003',
        role_name: 'user',
      },
    ];

    const expandGroup = async (user) => {
      await user.click(screen.getByText('Group A'));
    };

    it('expands group row to show members', async () => {
      const user = userEvent.setup();
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
        expect(screen.getByText('bob')).toBeInTheDocument();
        expect(screen.getByText('alice@test.com')).toBeInTheDocument();
      });
    });

    it('shows full name and student ID for each member', async () => {
      const user = userEvent.setup();
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);

      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
        expect(screen.getByText('ID: S001')).toBeInTheDocument();
        expect(screen.getByText('Bob Jones')).toBeInTheDocument();
        // bob has no student_id — should not render an "ID:" entry
        expect(screen.queryByText('ID: null')).not.toBeInTheDocument();
      });
    });

    it('shows "No members in this group" when group is empty', async () => {
      const user = userEvent.setup();
      await setupPage();
      axios.get.mockResolvedValueOnce({ data: { members: [] } }).mockResolvedValueOnce({ data: { users: [] } });

      await expandGroup(user);

      await waitFor(() => expect(screen.getByText('No members in this group')).toBeInTheDocument());
    });

    it('collapses row on second click', async () => {
      const user = userEvent.setup();
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      await expandGroup(user);
      await waitFor(() => expect(screen.queryByText('alice')).not.toBeInTheDocument());
    });

    it('removes a member from the group', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      axios.put.mockResolvedValueOnce({});
      axios.get
        .mockResolvedValueOnce({ data: { members: [membersData[1]] } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await user.click(screen.getByRole('button', { name: /remove alice/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000010\/group$/),
          { groupId: null }
        );
        expect(screen.getByText('Member removed successfully')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Member removed successfully')).not.toBeInTheDocument());
    });

    it('adds a member to the group', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      // charlie is the only user not in the group
      await user.selectOptions(screen.getByRole('combobox'), 'u0000000-0000-0000-0000-000000000012');

      axios.put.mockResolvedValueOnce({});
      axios.get
        .mockResolvedValueOnce({ data: { members: [...membersData, allUsersData[2]] } })
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
      await waitFor(() => expect(screen.queryByText('Member added successfully')).not.toBeInTheDocument());
    });

    it('does not submit add when no user selected', async () => {
      const user = userEvent.setup();
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /^add$/i }));
      expect(axios.put).not.toHaveBeenCalled();
    });

    it('hides add/remove controls for non-assignment-managers', async () => {
      useAuth.mockReturnValue({ isAssignmentManager: false });
      const user = userEvent.setup();
      await setupPage();
      axios.get.mockResolvedValueOnce({ data: { members: membersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: /remove alice/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('hides add member dropdown when group is full', async () => {
      const user = userEvent.setup();
      await setupPage([makeGroup({ member_count: 2, max_members: 2 })]);
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      // groupMembers.length (2) === max_members (2), so dropdown must be hidden
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('shows error when fetching members fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      axios.get.mockRejectedValueOnce(new Error('network'));

      await expandGroup(user);

      await waitFor(() => expect(screen.getByText('Failed to load group members')).toBeInTheDocument());

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Failed to load group members')).not.toBeInTheDocument());
    });

    it('shows error when remove member fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      axios.put.mockRejectedValue({ response: { data: { error: 'Remove failed' } } });
      await user.click(screen.getByRole('button', { name: /remove alice/i }));

      await waitFor(() => expect(screen.getByText('Remove failed')).toBeInTheDocument());
    });

    it('shows error when add member fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      axios.get
        .mockResolvedValueOnce({ data: { members: membersData } })
        .mockResolvedValueOnce({ data: { users: allUsersData } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

      await user.selectOptions(screen.getByRole('combobox'), 'u0000000-0000-0000-0000-000000000012');
      axios.put.mockRejectedValue({ response: { data: { error: 'Add failed' } } });
      await user.click(screen.getByRole('button', { name: /^add$/i }));

      await waitFor(() => expect(screen.getByText('Add failed')).toBeInTheDocument());
    });

    it('excludes admins and managers from the Add Member dropdown', async () => {
      const user = userEvent.setup();
      await setupPage();
      const adminUser = {
        id: 'u0000000-0000-0000-0000-000000000020',
        username: 'adminuser',
        email: 'admin@test.com',
        role_name: 'admin',
      };
      const managerUser = {
        id: 'u0000000-0000-0000-0000-000000000021',
        username: 'manageruser',
        email: 'mgr@test.com',
        role_name: 'assignment_manager',
      };
      const regularUser = {
        id: 'u0000000-0000-0000-0000-000000000022',
        username: 'regularuser',
        email: 'reg@test.com',
        role_name: 'user',
      };
      // Group has no current members; all three users are "available" by membership,
      // but only regularUser has role_name === 'user'
      axios.get
        .mockResolvedValueOnce({ data: { members: [] } })
        .mockResolvedValueOnce({ data: { users: [adminUser, managerUser, regularUser] } });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

      const options = screen.getAllByRole('option');
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts.some((t) => t.includes('regularuser'))).toBe(true);
      expect(optionTexts.every((t) => !t.includes('adminuser'))).toBe(true);
      expect(optionTexts.every((t) => !t.includes('manageruser'))).toBe(true);
    });
  });

  // ── Row selection ──────────────────────────────────────────────────────
  describe('Row selection', () => {
    it('shows bulk delete button when a row is selected', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));

      expect(screen.getByRole('button', { name: /delete \(1\)/i })).toBeInTheDocument();
    });

    it('hides bulk delete button when row is deselected', async () => {
      const user = userEvent.setup();
      await setupPage();

      const cb = screen.getByRole('checkbox', { name: /select group a/i });
      await user.click(cb);
      expect(screen.getByRole('button', { name: /delete \(1\)/i })).toBeInTheDocument();

      await user.click(cb);
      expect(screen.queryByRole('button', { name: /delete \(1\)/i })).not.toBeInTheDocument();
    });

    it('section select-all selects all groups in that section', async () => {
      const user = userEvent.setup();
      await setupPage([
        makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
        makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
      ]);

      await user.click(screen.getByRole('checkbox', { name: /select all groups with space/i }));

      expect(screen.getByRole('button', { name: /delete \(2\)/i })).toBeInTheDocument();
    });

    it('section select-all deselects all when all already selected', async () => {
      const user = userEvent.setup();
      await setupPage([
        makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
        makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
      ]);

      const sectionCb = screen.getByRole('checkbox', { name: /select all groups with space/i });
      await user.click(sectionCb);
      expect(screen.getByRole('button', { name: /delete \(2\)/i })).toBeInTheDocument();

      await user.click(sectionCb);
      expect(screen.queryByRole('button', { name: /delete \(\d+\)/i })).not.toBeInTheDocument();
    });

    it('shows bulk set limit button for section when rows are selected', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));

      expect(screen.getByRole('button', { name: /set limit \(1\)/i })).toBeInTheDocument();
    });
  });

  // ── Bulk delete ────────────────────────────────────────────────────────
  describe('Bulk delete', () => {
    it('opens bulk delete confirmation modal', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('button', { name: /delete \(1\)/i }));

      expect(screen.getByText(/delete 1 group\?/i)).toBeInTheDocument();
    });

    it('cancels bulk delete modal', async () => {
      const user = userEvent.setup();
      await setupPage();

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('button', { name: /delete \(1\)/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText(/delete 1 group\?/i)).not.toBeInTheDocument();
    });

    it('shows warning when selected groups have members', async () => {
      const user = userEvent.setup();
      await setupPage([makeGroup({ member_count: 3 })]);

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('button', { name: /delete \(1\)/i }));

      expect(screen.getByText(/will be unassigned/i)).toBeInTheDocument();
    });

    it('does not show warning when selected groups have no members', async () => {
      const user = userEvent.setup();
      await setupPage([makeGroup({ member_count: 0 })]);

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('button', { name: /delete \(1\)/i }));

      expect(screen.queryByText(/will be unassigned/i)).not.toBeInTheDocument();
    });

    it('deletes all selected groups and shows success', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage([
        makeGroup({ id: 'g1', name: 'Group A', member_count: 0, max_members: 5 }),
        makeGroup({ id: 'g2', name: 'Group B', member_count: 0, max_members: 5 }),
      ]);

      await user.click(screen.getByRole('checkbox', { name: /select all groups with space/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      axios.delete.mockResolvedValue({});
      axios.get.mockResolvedValueOnce({ data: { groups: [] } });

      await user.click(screen.getByRole('button', { name: /delete 2 groups/i }));

      await waitFor(() => {
        expect(axios.delete).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Deleted 2 groups')).toBeInTheDocument();
      });
    });

    it('shows error when bulk delete fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage([makeGroup({ member_count: 0 })]);

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('button', { name: /delete \(1\)/i }));
      axios.delete.mockRejectedValue({ response: { data: { error: 'Delete failed' } } });

      await user.click(screen.getByRole('button', { name: /delete 1 group$/i }));

      await waitFor(() => expect(screen.getByText('Delete failed')).toBeInTheDocument());
    });
  });

  // ── Bulk create ────────────────────────────────────────────────────────
  describe('Bulk create', () => {
    it('opens bulk create modal', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));

      expect(screen.getByText('Bulk Create Groups')).toBeInTheDocument();
    });

    it('cancels bulk create modal', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText('Bulk Create Groups')).not.toBeInTheDocument();
    });

    it('disables submit button when prefix is empty', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));

      // no prefix typed, preview is empty → submit disabled
      expect(screen.getByRole('button', { name: /create.*groups/i })).toBeDisabled();
    });

    it('shows inline preview when prefix and count are set (<=5 groups)', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '3');

      expect(screen.getByText('Team1, Team2, Team3')).toBeInTheDocument();
    });

    it('shows truncated preview for more than 5 groups', async () => {
      const user = userEvent.setup();
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '6');

      expect(screen.getByText(/team6/i)).toBeInTheDocument();
      expect(screen.getByText(/\(6 groups\)/i)).toBeInTheDocument();
    });

    it('creates groups and shows success', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '3');

      axios.post.mockResolvedValue({});
      axios.get.mockResolvedValueOnce({ data: { groups: [] } });

      await user.click(screen.getByRole('button', { name: /create 3 groups/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledTimes(3);
        expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), { name: 'Team1' });
        expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), { name: 'Team2' });
        expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), { name: 'Team3' });
        expect(screen.getByText('Created 3 groups')).toBeInTheDocument();
      });
    });

    it('creates groups with member limit when limit is set', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '2');
      await user.type(screen.getByPlaceholderText(/unlimited/i), '30');

      axios.post.mockResolvedValue({});
      axios.get.mockResolvedValueOnce({ data: { groups: [] } });

      await user.click(screen.getByRole('button', { name: /create 2 groups/i }));

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), {
          name: 'Team1',
          maxMembers: 30,
        });
        expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), {
          name: 'Team2',
          maxMembers: 30,
        });
      });
    });

    it('shows error when bulk create fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage([]);

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '2');

      axios.post.mockRejectedValue({ response: { data: { error: 'Create failed' } } });
      axios.get.mockResolvedValueOnce({ data: { groups: [] } });

      await user.click(screen.getByRole('button', { name: /create 2 groups/i }));

      await waitFor(() => expect(screen.getByText('Create failed')).toBeInTheDocument());
    });
  });

  // ── Bulk set limit ─────────────────────────────────────────────────────
  describe('Bulk set limit', () => {
    it('opens limit modal with multi-group text when bulk set limit is clicked', async () => {
      const user = userEvent.setup();
      await setupPage([
        makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
        makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
      ]);

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('checkbox', { name: /select group b/i }));
      await user.click(screen.getByRole('button', { name: /set limit \(2\)/i }));

      const heading = screen.getByRole('heading', { name: 'Set Member Limit' });
      expect(heading).toBeInTheDocument();
      // "Applies to N selected groups." paragraph is only shown for bulk (>1) operations
      expect(heading.parentElement).toHaveTextContent(/applies to.*selected groups/i);
    });

    it('saves limit for all selected groups and shows success', async () => {
      const user = userEvent.setup();
      await setupPage([
        makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
        makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
      ]);

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('checkbox', { name: /select group b/i }));
      await user.click(screen.getByRole('button', { name: /set limit \(2\)/i }));

      const input = screen.getByPlaceholderText('Unlimited');
      await user.clear(input);
      await user.type(input, '8');

      axios.put.mockResolvedValue({});
      axios.get.mockResolvedValueOnce({ data: { groups: [] } });

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledTimes(2);
        expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g1$/), { maxMembers: 8 });
        expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g2$/), { maxMembers: 8 });
        expect(screen.getByText('Updated limit for 2 groups')).toBeInTheDocument();
      });
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────
  describe('Group search', () => {
    it('shows all groups when search is empty', async () => {
      await setupPage([makeGroup({ name: 'Alpha' }), makeGroup({ id: 'g2', name: 'Beta' })]);

      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('filters groups by name when search term is entered', async () => {
      const user = userEvent.setup();
      await setupPage([makeGroup({ name: 'Alpha Team' }), makeGroup({ id: 'g2', name: 'Beta Group' })]);

      await user.type(screen.getByPlaceholderText('Search groups...'), 'alpha');

      await waitFor(() => {
        expect(screen.getByText('Alpha Team')).toBeInTheDocument();
        expect(screen.queryByText('Beta Group')).not.toBeInTheDocument();
      });
    });

    it('shows no-results message when search matches nothing', async () => {
      const user = userEvent.setup();
      await setupPage([makeGroup({ name: 'Alpha Team' })]);

      await user.type(screen.getByPlaceholderText('Search groups...'), 'zzz');

      await waitFor(() => {
        expect(screen.getByText('No groups match your search')).toBeInTheDocument();
        expect(screen.queryByText('Alpha Team')).not.toBeInTheDocument();
      });
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      await setupPage([makeGroup({ name: 'Alpha Team' })]);

      await user.type(screen.getByPlaceholderText('Search groups...'), 'ALPHA');

      await waitFor(() => expect(screen.getByText('Alpha Team')).toBeInTheDocument());
    });
  });

  // ── Export Mappings ────────────────────────────────────────────────────
  describe('Export Mappings', () => {
    it('renders the "Export Mappings" button', async () => {
      await setupPage();
      expect(screen.getByRole('button', { name: /export mappings/i })).toBeInTheDocument();
    });

    it('calls export-mappings API and triggers download on click', async () => {
      const { downloadCsv } = require('../../../src/utils/csv.js');
      const user = userEvent.setup();
      await setupPage();

      const mappings = [
        { groupName: 'Team Alpha', email: 'alice@test.com' },
        { groupName: 'Team Beta', email: 'bob@test.com' },
      ];
      axios.get.mockResolvedValueOnce({ data: { mappings } });

      await user.click(screen.getByRole('button', { name: /export mappings/i }));

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/export-mappings$/));
        expect(downloadCsv).toHaveBeenCalledWith(
          mappings,
          ['groupName', 'email'],
          expect.stringMatching(/^group-mappings-\d{4}-\d{2}-\d{2}\.csv$/)
        );
      });
    });

    it('shows error message when export fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      axios.get.mockRejectedValueOnce(new Error('network'));

      await user.click(screen.getByRole('button', { name: /export mappings/i }));

      await waitFor(() => expect(screen.getByText('Failed to export mappings')).toBeInTheDocument());
    });
  });

  // ── Import Mappings link ────────────────────────────────────────────────
  describe('Import Mappings', () => {
    it('renders the "Import Mappings" link pointing to /groups/import', async () => {
      await setupPage();
      const link = screen.getByRole('link', { name: /import mappings/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/groups/import');
    });
  });
});
