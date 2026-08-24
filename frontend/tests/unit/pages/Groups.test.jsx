import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '@/utils/api';
import Groups from '../../../src/pages/Groups.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('@/utils/api');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../src/utils/csv.js', () => ({
  downloadCsv: jest.fn(),
}));

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const ASSIGNMENT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ASSIGNMENT_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '44444444-4444-4444-8444-444444444444';

const makeGroup = (overrides = {}) => ({
  id: GROUP_ID,
  name: 'Group A',
  enabled: true,
  member_count: 3,
  max_members: 5,
  assignment_id: ASSIGNMENT_ID,
  created_at: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const makeAssignment = (overrides = {}) => ({
  id: ASSIGNMENT_ID,
  name: 'Assignment 1',
  subject_id: SUBJECT_ID,
  subject_name: 'COMP1000',
  group_count: 1,
  ...overrides,
});

describe('Groups page (groups of one assignment)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ isAdmin: true, user: { username: 'admin', role: 'admin' } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const asManagingAM = () =>
    useAuth.mockReturnValue({
      isAdmin: false,
      user: {
        username: 'am1',
        role: 'assignment_manager',
        managedAssignments: [{ id: ASSIGNMENT_ID, name: 'Assignment 1' }],
      },
    });

  const asNonManagingAM = () =>
    useAuth.mockReturnValue({
      isAdmin: false,
      user: {
        username: 'am2',
        role: 'assignment_manager',
        managedAssignments: [{ id: OTHER_ASSIGNMENT_ID, name: 'Other Assignment' }],
      },
    });

  const asRegularUser = () => useAuth.mockReturnValue({ isAdmin: false, user: { username: 'stu', role: 'user' } });

  /**
   * Route api.get calls by URL instead of queueing mockResolvedValueOnce —
   * avoids queue-pollution between the parallel fetches this page performs.
   * Calling setupApi again mid-test swaps the dataset (e.g. after a refetch).
   */
  const setupApi = ({
    groups = [makeGroup()],
    assignment = makeAssignment(),
    members = [],
    subjectUsers = [],
    mappings = [],
  } = {}) => {
    api.get.mockImplementation((url) => {
      if (url.endsWith(`/assignments/${ASSIGNMENT_ID}/groups`)) {
        return Promise.resolve({ data: { groups } });
      }
      if (url.endsWith(`/assignments/${ASSIGNMENT_ID}/export-mappings`)) {
        return Promise.resolve({ data: { mappings } });
      }
      if (url.endsWith(`/assignments/${ASSIGNMENT_ID}`)) {
        return Promise.resolve({ data: { assignment } });
      }
      if (url.endsWith(`/subjects/${SUBJECT_ID}/users`)) {
        return Promise.resolve({ data: { users: subjectUsers } });
      }
      if (/\/groups\/[^/]+$/.test(url)) {
        return Promise.resolve({ data: { group: {}, members } });
      }
      return Promise.reject(new Error(`Unmocked GET ${url}`));
    });
  };

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={[`/subjects/${SUBJECT_ID}/assignments/${ASSIGNMENT_ID}`]}>
        <Routes>
          <Route path="/subjects/:subjectId/assignments/:assignmentId" element={<Groups />} />
        </Routes>
      </MemoryRouter>
    );

  const setupPage = async (options = {}) => {
    setupApi(options);
    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Subjects' })).toBeInTheDocument());
  };

  // ── Loading / fetch ────────────────────────────────────────────────────
  it('shows loading spinner before data resolves', () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Subjects' })).not.toBeInTheDocument();
  });

  it('shows empty-state text when there are no groups', async () => {
    await setupPage({ groups: [] });
    expect(screen.getByText('No groups created yet')).toBeInTheDocument();
  });

  it('shows fetch error banner when initial load fails', async () => {
    api.get.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByText('Failed to load groups')).toBeInTheDocument());
  });

  it('fetches assignment info and groups from the assignment-scoped endpoints', async () => {
    await setupPage();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/assignments/${ASSIGNMENT_ID}$`)));
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/assignments/${ASSIGNMENT_ID}/groups$`)));
    // Old flat GET /groups endpoint must no longer be used
    const flatGroupCalls = api.get.mock.calls.filter(
      ([url]) => url.endsWith('/groups') && !url.includes('/assignments/')
    );
    expect(flatGroupCalls).toHaveLength(0);
  });

  it('renders group name and member count after successful fetch', async () => {
    await setupPage();
    expect(screen.getByText('Group A')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('shows ∞ when max_members is null', async () => {
    await setupPage({ groups: [makeGroup({ max_members: null })] });
    expect(screen.getByText('3 / ∞')).toBeInTheDocument();
  });

  // ── Breadcrumb ─────────────────────────────────────────────────────────
  describe('Breadcrumb', () => {
    it('renders Subjects › subject › assignment breadcrumb with correct links', async () => {
      await setupPage();
      const subjectsLink = screen.getByRole('link', { name: 'Subjects' });
      expect(subjectsLink).toHaveAttribute('href', '/subjects');
      const subjectLink = screen.getByRole('link', { name: 'COMP1000' });
      expect(subjectLink).toHaveAttribute('href', `/subjects/${SUBJECT_ID}`);
      const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(within(breadcrumb).getByText('Assignment 1')).toBeInTheDocument();
    });

    it('passes the assignment name to the page header', async () => {
      await setupPage();
      // Breadcrumb leaf + Header pageName
      expect(screen.getAllByText('Assignment 1').length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Three sections ─────────────────────────────────────────────────────
  it('places open group in "Groups with space" section', async () => {
    await setupPage({ groups: [makeGroup({ member_count: 2, max_members: 5 })] });
    expect(screen.getByText(/groups with space/i)).toBeInTheDocument();
  });

  it('places unlimited group in "Groups with space" section', async () => {
    await setupPage({ groups: [makeGroup({ member_count: 10, max_members: null })] });
    expect(screen.getByText(/groups with space/i)).toBeInTheDocument();
  });

  it('places full group in "Groups full" section', async () => {
    await setupPage({ groups: [makeGroup({ member_count: 5, max_members: 5 })] });
    expect(screen.getByText(/groups full/i)).toBeInTheDocument();
  });

  it('places disabled group in "Disabled groups" section', async () => {
    await setupPage({ groups: [makeGroup({ enabled: false })] });
    expect(screen.getByText(/disabled groups/i)).toBeInTheDocument();
  });

  it('shows correct counts in section headings', async () => {
    await setupPage({
      groups: [
        makeGroup({ id: 'g1', name: 'Open', member_count: 1, max_members: 5 }),
        makeGroup({ id: 'g2', name: 'Full', member_count: 3, max_members: 3 }),
        makeGroup({ id: 'g3', name: 'Disabled', enabled: false }),
      ],
    });
    expect(screen.getByText(/groups with space/i).closest('h3')).toHaveTextContent('(1)');
    expect(screen.getByText(/groups full/i).closest('h3')).toHaveTextContent('(1)');
    expect(screen.getByText(/disabled groups/i).closest('h3')).toHaveTextContent('(1)');
  });

  // ── Enable / disable ───────────────────────────────────────────────────
  it('shows disable, set-limit, and delete icon buttons', async () => {
    await setupPage();
    expect(screen.getByRole('button', { name: 'Disable Group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Member Limit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Group' })).toBeInTheDocument();
  });

  it('shows enable button for a disabled group', async () => {
    await setupPage({ groups: [makeGroup({ enabled: false })] });
    expect(screen.getByRole('button', { name: 'Enable Group' })).toBeInTheDocument();
  });

  it('disables a group and shows success feedback', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    api.put.mockResolvedValueOnce({});

    await user.click(screen.getByRole('button', { name: 'Disable Group' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/groups/${GROUP_ID}$`)), {
        enabled: false,
      });
      expect(screen.getByText('Group disabled successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Group disabled successfully')).not.toBeInTheDocument());
  });

  it('enables a disabled group', async () => {
    const user = userEvent.setup();
    await setupPage({ groups: [makeGroup({ enabled: false })] });
    api.put.mockResolvedValueOnce({});

    await user.click(screen.getByRole('button', { name: 'Enable Group' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\//), { enabled: true });
    });
  });

  it('shows API error when toggle fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    api.put.mockRejectedValue({ response: { data: { error: 'Cannot update group' } } });

    await user.click(screen.getByRole('button', { name: 'Disable Group' }));

    await waitFor(() => expect(screen.getByText('Cannot update group')).toBeInTheDocument());

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Cannot update group')).not.toBeInTheDocument());
  });

  // ── Delete (single-step modal) ─────────────────────────────────────────
  it('opens delete confirmation modal when delete icon is clicked', async () => {
    const user = userEvent.setup();
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));

    expect(screen.getByText(/delete 1 group\?/i)).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('shows member warning in delete modal when group has members', async () => {
    const user = userEvent.setup();
    await setupPage({ groups: [makeGroup({ member_count: 3 })] });

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));

    expect(screen.getByText(/will be unassigned/i)).toBeInTheDocument();
    expect(screen.getByText(/3 members/i)).toBeInTheDocument();
  });

  it('does not show warning in delete modal when group has no members', async () => {
    const user = userEvent.setup();
    await setupPage({ groups: [makeGroup({ member_count: 0 })] });

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));

    expect(screen.queryByText(/will be unassigned/i)).not.toBeInTheDocument();
  });

  it('deletes group after modal confirmation and shows success', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    api.delete.mockResolvedValueOnce({});

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    await user.click(screen.getByRole('button', { name: /delete 1 group$/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/groups/${GROUP_ID}$`)));
      expect(screen.getByText('Group deleted successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Group deleted successfully')).not.toBeInTheDocument());
  });

  it('cancels delete modal without deleting', async () => {
    const user = userEvent.setup();
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.queryByText(/delete 1 group\?/i)).not.toBeInTheDocument();
  });

  it('shows error when delete fails', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    api.delete.mockRejectedValue({ response: { data: { error: 'Cannot delete' } } });

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
    api.put.mockResolvedValueOnce({});

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    const input = screen.getByPlaceholderText('Unlimited');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/groups/${GROUP_ID}$`)), {
        maxMembers: 10,
      });
      expect(screen.getByText('Group limit updated')).toBeInTheDocument();
    });
  });

  it('saves unlimited (blank) limit via modal', async () => {
    const user = userEvent.setup();
    await setupPage();
    api.put.mockResolvedValueOnce({});

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    await user.clear(screen.getByPlaceholderText('Unlimited'));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\//), { maxMembers: null });
    });
  });

  it('rejects invalid limit input client-side', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    const input = screen.getByPlaceholderText('Unlimited');
    await user.clear(input);
    await user.type(input, '0'); // 0 is rejected since min is 1
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText('Max members must be a positive number')).toBeInTheDocument());
    expect(api.put).not.toHaveBeenCalled();
  });

  it('cancels the set limit modal', async () => {
    const user = userEvent.setup();
    await setupPage();

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    expect(screen.getByRole('heading', { name: 'Set Member Limit' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('heading', { name: 'Set Member Limit' })).not.toBeInTheDocument();
  });

  it('shows API error when the limit is below the current member count', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage();
    api.put.mockRejectedValue({
      response: { data: { error: 'Max members cannot be less than current member count' } },
    });

    await user.click(screen.getByRole('button', { name: 'Set Member Limit' }));
    const input = screen.getByPlaceholderText('Unlimited');
    await user.clear(input);
    await user.type(input, '1');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByText('Max members cannot be less than current member count')).toBeInTheDocument()
    );
  });

  // ── Create group modal ─────────────────────────────────────────────────
  it('opens create-group modal', async () => {
    await setupPage({ groups: [] });
    await userEvent.click(screen.getByRole('button', { name: /create group/i }));
    expect(screen.getByText('Create New Group')).toBeInTheDocument();
  });

  it('creates a group sending assignmentId and shows success feedback', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupPage({ groups: [] });
    api.post.mockResolvedValueOnce({});

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), ' New Team ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), {
        assignmentId: ASSIGNMENT_ID,
        name: 'New Team',
      });
      expect(screen.getByText('Group created successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText('Group created successfully')).not.toBeInTheDocument());
  });

  it('creates a group with maxMembers', async () => {
    const user = userEvent.setup();
    await setupPage({ groups: [] });
    api.post.mockResolvedValueOnce({});

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Limited Team');
    await user.type(screen.getByPlaceholderText(/leave blank for unlimited/i), '10');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), {
        assignmentId: ASSIGNMENT_ID,
        name: 'Limited Team',
        maxMembers: 10,
      });
    });
  });

  it('does not create a group when name is blank', async () => {
    const user = userEvent.setup();
    await setupPage({ groups: [] });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), '   ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows duplicate-name error inside modal when create returns 409', async () => {
    const user = userEvent.setup();
    await setupPage({ groups: [] });
    api.post.mockRejectedValue({
      response: { status: 409, data: { error: 'A group with this name already exists in this assignment' } },
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Team X');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() =>
      expect(screen.getByText('A group with this name already exists in this assignment')).toBeInTheDocument()
    );
  });

  it('shows generic error inside modal when create group fails without response body', async () => {
    const user = userEvent.setup();
    await setupPage({ groups: [] });
    api.post.mockRejectedValue(new Error('network'));

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
    await setupPage({ groups: [] });

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
        role_name: 'user',
      },
    ];
    const subjectUsersData = [
      ...membersData,
      {
        id: 'u0000000-0000-0000-0000-000000000012',
        username: 'charlie',
        email: 'charlie@test.com',
        first_name: 'Charlie',
        last_name: 'Brown',
        student_id: 'S003',
        role_name: 'user',
        status: 'enabled',
      },
    ];

    const expandGroup = async (user) => {
      await user.click(screen.getByText('Group A'));
    };

    it('expands group row to show members fetched from GET /groups/:id', async () => {
      const user = userEvent.setup();
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument();
        expect(screen.getByText('bob')).toBeInTheDocument();
        expect(screen.getByText('alice@test.com')).toBeInTheDocument();
      });
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/groups/${GROUP_ID}$`)));
    });

    it('fetches the add-member candidates from the parent subject', async () => {
      const user = userEvent.setup();
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/subjects/${SUBJECT_ID}/users$`)));
    });

    it('shows full name and student ID for each member', async () => {
      const user = userEvent.setup();
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

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
      await setupPage({ members: [], subjectUsers: [] });

      await expandGroup(user);

      await waitFor(() => expect(screen.getByText('No members in this group')).toBeInTheDocument());
    });

    it('collapses row on second click', async () => {
      const user = userEvent.setup();
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      await expandGroup(user);
      await waitFor(() => expect(screen.queryByText('alice')).not.toBeInTheDocument());
    });

    it('removes a member with PUT /users/:id/group { assignmentId, groupId: null }', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      api.put.mockResolvedValueOnce({});
      await user.click(screen.getByRole('button', { name: /remove alice/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000010\/group$/),
          { assignmentId: ASSIGNMENT_ID, groupId: null }
        );
        expect(screen.getByText('Member removed successfully')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Member removed successfully')).not.toBeInTheDocument());
    });

    it('adds a member with PUT /users/:id/group { assignmentId, groupId }', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      // charlie is the only subject member not already in the group
      await user.selectOptions(screen.getByRole('combobox'), 'u0000000-0000-0000-0000-000000000012');

      api.put.mockResolvedValueOnce({});
      await user.click(screen.getByRole('button', { name: /^add$/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000012\/group$/),
          { assignmentId: ASSIGNMENT_ID, groupId: GROUP_ID }
        );
        expect(screen.getByText('Member added successfully')).toBeInTheDocument();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Member added successfully')).not.toBeInTheDocument());
    });

    it('does not submit add when no user selected', async () => {
      const user = userEvent.setup();
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /^add$/i }));
      expect(api.put).not.toHaveBeenCalled();
    });

    it('excludes users already in the expanded group from the dropdown', async () => {
      const user = userEvent.setup();
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

      const optionTexts = screen.getAllByRole('option').map((o) => o.textContent);
      expect(optionTexts.some((t) => t.includes('charlie'))).toBe(true);
      expect(optionTexts.every((t) => !t.includes('alice'))).toBe(true);
      expect(optionTexts.every((t) => !t.includes('bob'))).toBe(true);
    });

    it('excludes admins and managers from the Add Member dropdown', async () => {
      const user = userEvent.setup();
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
      await setupPage({ members: [], subjectUsers: [adminUser, managerUser, regularUser] });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

      const optionTexts = screen.getAllByRole('option').map((o) => o.textContent);
      expect(optionTexts.some((t) => t.includes('regularuser'))).toBe(true);
      expect(optionTexts.every((t) => !t.includes('adminuser'))).toBe(true);
      expect(optionTexts.every((t) => !t.includes('manageruser'))).toBe(true);
    });

    it('hides add member dropdown when group is full', async () => {
      const user = userEvent.setup();
      await setupPage({
        groups: [makeGroup({ member_count: 2, max_members: 2 })],
        members: membersData,
        subjectUsers: subjectUsersData,
      });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      // groupMembers.length (2) === max_members (2), so dropdown must be hidden
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('shows error when fetching members fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      api.get.mockRejectedValueOnce(new Error('network'));

      await expandGroup(user);

      await waitFor(() => expect(screen.getByText('Failed to load group members')).toBeInTheDocument());

      jest.advanceTimersByTime(3000);
      await waitFor(() => expect(screen.queryByText('Failed to load group members')).not.toBeInTheDocument());
    });

    it('shows error when remove member fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      api.put.mockRejectedValue({ response: { data: { error: 'Remove failed' } } });
      await user.click(screen.getByRole('button', { name: /remove alice/i }));

      await waitFor(() => expect(screen.getByText('Remove failed')).toBeInTheDocument());
    });

    it('surfaces the 403 subject-membership error from the backend', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

      await user.selectOptions(screen.getByRole('combobox'), 'u0000000-0000-0000-0000-000000000012');
      api.put.mockRejectedValue({
        response: { status: 403, data: { error: 'User is not a member of this subject' } },
      });
      await user.click(screen.getByRole('button', { name: /^add$/i }));

      await waitFor(() => expect(screen.getByText('User is not a member of this subject')).toBeInTheDocument());
    });

    it('surfaces the 409 already-in-a-group error from the backend', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ members: membersData, subjectUsers: subjectUsersData });

      await expandGroup(user);
      await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

      await user.selectOptions(screen.getByRole('combobox'), 'u0000000-0000-0000-0000-000000000012');
      api.put.mockRejectedValue({
        response: { status: 409, data: { error: 'User is already in a group for this assignment' } },
      });
      await user.click(screen.getByRole('button', { name: /^add$/i }));

      await waitFor(() =>
        expect(screen.getByText('User is already in a group for this assignment')).toBeInTheDocument()
      );
    });
  });

  // ── Permission gating ──────────────────────────────────────────────────
  describe('Permission gating (canManage)', () => {
    it('shows management controls for an AM who manages this assignment', async () => {
      asManagingAM();
      await setupPage();

      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bulk create/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /import mappings/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Disable Group' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Set Member Limit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete Group' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /select group a/i })).toBeInTheDocument();
    });

    it('hides all management controls for an AM who does not manage this assignment', async () => {
      asNonManagingAM();
      await setupPage();

      // Read-only listing still renders
      expect(screen.getByText('Group A')).toBeInTheDocument();
      expect(screen.getByText('3 / 5')).toBeInTheDocument();

      expect(screen.queryByRole('button', { name: /^\+ create group$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /bulk create/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /import mappings/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit Group' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Disable Group' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Set Member Limit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('hides all management controls for a regular user', async () => {
      asRegularUser();
      await setupPage();

      expect(screen.getByText('Group A')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^\+ create group$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('hides add/remove member controls and skips the subject users fetch when not managing', async () => {
      asNonManagingAM();
      const user = userEvent.setup();
      await setupPage({
        members: [
          {
            id: 'u0000000-0000-0000-0000-000000000010',
            username: 'alice',
            email: 'alice@test.com',
            first_name: 'Alice',
            last_name: 'Smith',
            role_name: 'user',
          },
        ],
      });

      await user.click(screen.getByText('Group A'));
      await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: /remove alice/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/subjects/${SUBJECT_ID}/users$`)));
    });

    it('hides the empty-state create button when not managing', async () => {
      asNonManagingAM();
      await setupPage({ groups: [] });

      expect(screen.getByText('No groups created yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create your first group/i })).not.toBeInTheDocument();
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
      await setupPage({
        groups: [
          makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
          makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
        ],
      });

      await user.click(screen.getByRole('checkbox', { name: /select all groups with space/i }));

      expect(screen.getByRole('button', { name: /delete \(2\)/i })).toBeInTheDocument();
    });

    it('section select-all deselects all when all already selected', async () => {
      const user = userEvent.setup();
      await setupPage({
        groups: [
          makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
          makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
        ],
      });

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
    it('deletes all selected groups via DELETE /groups/bulk and shows success', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({
        groups: [
          makeGroup({ id: 'g1', name: 'Group A', member_count: 0, max_members: 5 }),
          makeGroup({ id: 'g2', name: 'Group B', member_count: 0, max_members: 5 }),
        ],
      });

      await user.click(screen.getByRole('checkbox', { name: /select all groups with space/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      api.delete.mockResolvedValue({});
      await user.click(screen.getByRole('button', { name: /delete 2 groups/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledTimes(1);
        expect(api.delete).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/bulk$/), {
          data: { ids: expect.arrayContaining(['g1', 'g2']) },
        });
        expect(screen.getByText('Deleted 2 groups')).toBeInTheDocument();
      });
    });

    it('single delete still uses DELETE /groups/:id (not bulk)', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage();
      api.delete.mockResolvedValueOnce({});

      await user.click(screen.getByRole('button', { name: 'Delete Group' }));
      await user.click(screen.getByRole('button', { name: /delete 1 group$/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/groups/${GROUP_ID}$`)));
        expect(api.delete).not.toHaveBeenCalledWith(expect.stringMatching(/\/groups\/bulk/), expect.anything());
      });
    });

    it('shows error when bulk delete fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({
        groups: [
          makeGroup({ id: 'g1', name: 'Group A', member_count: 0, max_members: 5 }),
          makeGroup({ id: 'g2', name: 'Group B', member_count: 0, max_members: 5 }),
        ],
      });

      await user.click(screen.getByRole('checkbox', { name: /select all groups with space/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      api.delete.mockRejectedValue({ response: { data: { error: 'Bulk delete failed' } } });
      await user.click(screen.getByRole('button', { name: /delete 2 groups/i }));

      await waitFor(() => expect(screen.getByText('Bulk delete failed')).toBeInTheDocument());
    });
  });

  // ── Bulk create ────────────────────────────────────────────────────────
  describe('Bulk create', () => {
    it('opens and cancels bulk create modal', async () => {
      const user = userEvent.setup();
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      expect(screen.getByText('Bulk Create Groups')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText('Bulk Create Groups')).not.toBeInTheDocument();
    });

    it('disables submit button when prefix is empty', async () => {
      const user = userEvent.setup();
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));

      expect(screen.getByRole('button', { name: /create.*groups/i })).toBeDisabled();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('disables submit button when count is invalid (0)', async () => {
      const user = userEvent.setup();
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '0');

      expect(screen.getByRole('button', { name: /create.*groups/i })).toBeDisabled();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows inline preview when prefix and count are set (<=5 groups)', async () => {
      const user = userEvent.setup();
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '3');

      expect(screen.getByText('Team1, Team2, Team3')).toBeInTheDocument();
    });

    it('shows truncated preview for more than 5 groups', async () => {
      const user = userEvent.setup();
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '6');

      expect(screen.getByText(/team6/i)).toBeInTheDocument();
      expect(screen.getByText(/\(6 groups\)/i)).toBeInTheDocument();
    });

    it('pads generated names to the width of the batch size (3 digits for 300 groups)', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '300');

      // Preview reflects the padded last name
      expect(screen.getByText(/team300/i)).toBeInTheDocument();
      expect(screen.getByText(/team001/i)).toBeInTheDocument();

      api.post.mockResolvedValueOnce({ data: { groups: [] } });
      await user.click(screen.getByRole('button', { name: /create 300 groups/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledTimes(1);
        const body = api.post.mock.calls[0][1];
        expect(body.groups[0].name).toBe('Team001');
        expect(body.groups[9].name).toBe('Team010');
        expect(body.groups[99].name).toBe('Team100');
        expect(body.groups[299].name).toBe('Team300');
      });
    });

    it('pads generated names to 4 digits for 3000 groups', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '3000');

      api.post.mockResolvedValue({ data: { groups: [] } });
      await user.click(screen.getByRole('button', { name: /create 3000 groups/i }));

      await waitFor(() => {
        // Large batches are split into sequential calls; check first and last chunk
        const calls = api.post.mock.calls;
        const firstBatch = calls[0][1].groups;
        const lastBatch = calls[calls.length - 1][1].groups;
        expect(firstBatch[0].name).toBe('Team0001');
        expect(lastBatch[lastBatch.length - 1].name).toBe('Team3000');
      });
    });

    it('keeps 2-digit padding for batches of 10–99 (existing behaviour)', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '90');

      api.post.mockResolvedValueOnce({ data: { groups: [] } });
      await user.click(screen.getByRole('button', { name: /create 90 groups/i }));

      await waitFor(() => {
        const body = api.post.mock.calls[0][1];
        expect(body.groups[0].name).toBe('Team01');
        expect(body.groups[89].name).toBe('Team90');
      });
    });

    it('sends { assignmentId, groups } in a single POST /groups/bulk call', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '3');

      api.post.mockResolvedValueOnce({ data: { groups: [] } });
      await user.click(screen.getByRole('button', { name: /create 3 groups/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/bulk$/), {
          assignmentId: ASSIGNMENT_ID,
          groups: [{ name: 'Team1' }, { name: 'Team2' }, { name: 'Team3' }],
        });
        expect(screen.getByText('Created 3 groups')).toBeInTheDocument();
      });
    });

    it('splits large batches (>500) into sequential { assignmentId, groups } calls', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Group');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '1500');

      api.post.mockResolvedValue({ data: { groups: [] } });
      await user.click(screen.getByRole('button', { name: /create 1500 groups/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledTimes(3);
        const [firstCall, secondCall, thirdCall] = api.post.mock.calls;
        expect(firstCall[0]).toMatch(/\/groups\/bulk$/);
        expect(firstCall[1].assignmentId).toBe(ASSIGNMENT_ID);
        expect(firstCall[1].groups).toHaveLength(500);
        expect(firstCall[1].groups[0]).toEqual({ name: 'Group0001' });
        expect(firstCall[1].groups[499]).toEqual({ name: 'Group0500' });
        expect(secondCall[1].groups).toHaveLength(500);
        expect(secondCall[1].groups[0]).toEqual({ name: 'Group0501' });
        expect(thirdCall[1].groups).toHaveLength(500);
        expect(thirdCall[1].groups[499]).toEqual({ name: 'Group1500' });
        expect(screen.getByText('Created 1500 groups')).toBeInTheDocument();
      });
    });

    it('includes maxMembers in each item when set', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '2');
      await user.type(screen.getByPlaceholderText(/unlimited/i), '30');

      api.post.mockResolvedValueOnce({ data: { groups: [] } });
      await user.click(screen.getByRole('button', { name: /create 2 groups/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/bulk$/), {
          assignmentId: ASSIGNMENT_ID,
          groups: [
            { name: 'Team1', maxMembers: 30 },
            { name: 'Team2', maxMembers: 30 },
          ],
        });
      });
    });

    it('shows in-batch duplicate error (400) from the backend', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '2');

      api.post.mockRejectedValueOnce({
        response: { status: 400, data: { error: 'Duplicate group names in request' } },
      });
      await user.click(screen.getByRole('button', { name: /create 2 groups/i }));

      await waitFor(() => {
        expect(screen.getByText('Duplicate group names in request')).toBeInTheDocument();
        expect(screen.queryByText(/created \d+ group/i)).not.toBeInTheDocument();
      });
    });

    it('shows existing-name conflict error (409) from the backend', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '2');

      api.post.mockRejectedValueOnce({
        response: { status: 409, data: { error: 'Groups already exist: Team1, Team2' } },
      });
      await user.click(screen.getByRole('button', { name: /create 2 groups/i }));

      await waitFor(() => expect(screen.getByText('Groups already exist: Team1, Team2')).toBeInTheDocument());
    });

    it('partial failure: first batch succeeds, second batch fails — shows both toasts', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupPage({ groups: [] });

      await user.click(screen.getByRole('button', { name: /bulk create/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. team/i), 'Team');
      const countInput = screen.getByPlaceholderText(/e\.g\. 10/i);
      await user.clear(countInput);
      await user.type(countInput, '1500');

      api.post
        .mockResolvedValueOnce({ data: { groups: [] } })
        .mockRejectedValueOnce({ response: { data: { error: 'DB overloaded' } } });

      await user.click(screen.getByRole('button', { name: /create 1500 groups/i }));

      await waitFor(
        () => {
          expect(screen.getByText('Created 500 groups')).toBeInTheDocument();
          expect(screen.getByText('DB overloaded')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });
  });

  // ── Bulk set limit ─────────────────────────────────────────────────────
  describe('Bulk set limit', () => {
    it('opens limit modal with multi-group text when bulk set limit is clicked', async () => {
      const user = userEvent.setup();
      await setupPage({
        groups: [
          makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
          makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
        ],
      });

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('checkbox', { name: /select group b/i }));
      await user.click(screen.getByRole('button', { name: /set limit \(2\)/i }));

      const heading = screen.getByRole('heading', { name: 'Set Member Limit' });
      expect(heading).toBeInTheDocument();
      expect(heading.parentElement).toHaveTextContent(/applies to.*selected groups/i);
    });

    it('saves limit for all selected groups and shows success', async () => {
      const user = userEvent.setup();
      await setupPage({
        groups: [
          makeGroup({ id: 'g1', name: 'Group A', member_count: 1, max_members: 5 }),
          makeGroup({ id: 'g2', name: 'Group B', member_count: 2, max_members: 5 }),
        ],
      });

      await user.click(screen.getByRole('checkbox', { name: /select group a/i }));
      await user.click(screen.getByRole('checkbox', { name: /select group b/i }));
      await user.click(screen.getByRole('button', { name: /set limit \(2\)/i }));

      const input = screen.getByPlaceholderText('Unlimited');
      await user.clear(input);
      await user.type(input, '8');

      api.put.mockResolvedValue({});
      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledTimes(2);
        expect(api.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g1$/), { maxMembers: 8 });
        expect(api.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g2$/), { maxMembers: 8 });
        expect(screen.getByText('Updated limit for 2 groups')).toBeInTheDocument();
      });
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────
  describe('Group search', () => {
    it('shows all groups when search is empty', async () => {
      await setupPage({ groups: [makeGroup({ name: 'Alpha' }), makeGroup({ id: 'g2', name: 'Beta' })] });

      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('filters groups by name when search term is entered (case-insensitive)', async () => {
      const user = userEvent.setup();
      await setupPage({ groups: [makeGroup({ name: 'Alpha Team' }), makeGroup({ id: 'g2', name: 'Beta Group' })] });

      await user.type(screen.getByPlaceholderText('Search groups...'), 'ALPHA');

      await waitFor(() => {
        expect(screen.getByText('Alpha Team')).toBeInTheDocument();
        expect(screen.queryByText('Beta Group')).not.toBeInTheDocument();
      });
    });

    it('shows no-results message when search matches nothing', async () => {
      const user = userEvent.setup();
      await setupPage({ groups: [makeGroup({ name: 'Alpha Team' })] });

      await user.type(screen.getByPlaceholderText('Search groups...'), 'zzz');

      await waitFor(() => {
        expect(screen.getByText('No groups match your search')).toBeInTheDocument();
        expect(screen.queryByText('Alpha Team')).not.toBeInTheDocument();
      });
    });
  });

  // ── Export Mappings ────────────────────────────────────────────────────
  describe('Export Mappings', () => {
    it('calls the assignment-scoped export endpoint and triggers download', async () => {
      const { downloadCsv } = require('../../../src/utils/csv.js');
      const user = userEvent.setup();
      const mappings = [
        { groupName: 'Team Alpha', email: 'alice@test.com' },
        { groupName: 'Team Beta', email: 'bob@test.com' },
      ];
      await setupPage({ mappings });

      await user.click(screen.getByRole('button', { name: /export mappings/i }));

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`/assignments/${ASSIGNMENT_ID}/export-mappings$`))
        );
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
      api.get.mockRejectedValueOnce(new Error('network'));

      await user.click(screen.getByRole('button', { name: /export mappings/i }));

      await waitFor(() => expect(screen.getByText('Failed to export mappings')).toBeInTheDocument());
    });
  });

  // ── Import Mappings link ────────────────────────────────────────────────
  describe('Import Mappings', () => {
    it('renders the import link with subjectId and assignmentId query params', async () => {
      await setupPage();
      const link = screen.getByRole('link', { name: /import mappings/i });
      expect(link).toHaveAttribute('href', `/groups/import?subjectId=${SUBJECT_ID}&assignmentId=${ASSIGNMENT_ID}`);
    });
  });

  // ── Data freshness ─────────────────────────────────────────────────────
  describe('data freshness on tab visibility', () => {
    it('re-fetches groups when the browser tab becomes visible', async () => {
      await setupPage({ groups: [makeGroup({ name: 'Group A' })] });

      // Simulate another tab creating a group, then this tab regaining focus
      setupApi({ groups: [makeGroup({ name: 'Group A' }), makeGroup({ id: 'g2', name: 'Group B' })] });

      Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      await waitFor(() => expect(screen.getByText('Group B')).toBeInTheDocument());
    });

    it('does not re-fetch when the tab becomes hidden', async () => {
      await setupPage();

      const callsBefore = api.get.mock.calls.length;

      Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(api.get.mock.calls.length).toBe(callsBefore);
    });
  });
});
