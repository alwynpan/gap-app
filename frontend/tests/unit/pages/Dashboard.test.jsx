import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import Dashboard from '../../../src/pages/Dashboard.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('@/utils/api');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

const mockLogout = jest.fn();
const mockRefreshUser = jest.fn();
const mockSetCurrentSubject = jest.fn();

const SUBJECT_1 = { id: 'sub-1', name: 'Software Modelling' };
const SUBJECT_2 = { id: 'sub-2', name: 'Distributed Systems' };

const MEMBERSHIP_A1 = {
  assignment_id: 'a-1',
  assignment_name: 'Assignment 1',
  subject_id: 'sub-1',
  subject_name: 'Software Modelling',
  group_id: 'g-1',
  group_name: 'Team Alpha',
};

function makeUser(overrides = {}) {
  return {
    id: 'u-10',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    studentId: 's1234567',
    subjects: [SUBJECT_1],
    memberships: [],
    managedAssignments: [],
    ...overrides,
  };
}

function mockAuth({ user, isAdmin = false, isAssignmentManager = false, currentSubjectId = null }) {
  useAuth.mockReturnValue({
    user,
    logout: mockLogout,
    refreshUser: mockRefreshUser,
    isAdmin,
    isAssignmentManager,
    memberships: user?.memberships ?? [],
    managedAssignmentIds: (user?.managedAssignments ?? []).map((a) => a.id),
    currentSubjectId,
    setCurrentSubject: mockSetCurrentSubject,
  });
}

function mockApi({
  locked = false,
  subjects = {},
  groupsByAssignment = {},
  membersByGroup = {},
  failSubjects = [],
} = {}) {
  api.get.mockImplementation((url) => {
    const subjectMatch = url.match(/\/subjects\/([^/?]+)$/);
    if (subjectMatch) {
      const id = subjectMatch[1];
      if (failSubjects.includes(id)) {
        return Promise.reject(new Error('subject fetch failed'));
      }
      // `locked` stamps the per-assignment flag the component now reads.
      const assignments = (subjects[id] ?? []).map((a) => ({ join_locked: locked, ...a }));
      return Promise.resolve({ data: { subject: { id }, assignments } });
    }
    const assignmentMatch = url.match(/\/assignments\/([^/?]+)\/groups/);
    if (assignmentMatch) {
      return Promise.resolve({ data: { groups: groupsByAssignment[assignmentMatch[1]] ?? [] } });
    }
    const groupMatch = url.match(/\/groups\/([^/?]+)$/);
    if (groupMatch) {
      return Promise.resolve({ data: { group: {}, members: membersByGroup[groupMatch[1]] ?? [] } });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe('Dashboard page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('profile card', () => {
    it('shows subject names joined by comma and no Group row', async () => {
      mockAuth({ user: makeUser({ subjects: [SUBJECT_1, SUBJECT_2] }) });
      mockApi({ subjects: { 'sub-1': [], 'sub-2': [] } });

      renderDashboard();

      expect(screen.getByText(/welcome back, testuser!/i)).toBeInTheDocument();
      expect(screen.getByText('Software Modelling, Distributed Systems')).toBeInTheDocument();
      expect(screen.queryByText(/^Group$/)).not.toBeInTheDocument();
      expect(screen.queryByText('Not assigned')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/subjects/sub-1'));
      });
    });

    it('shows a dash when the user has no subjects', () => {
      mockAuth({
        user: makeUser({ username: 'admin', role: 'admin', subjects: [] }),
        isAdmin: true,
        isAssignmentManager: true,
      });

      renderDashboard();

      expect(screen.getByText('Subjects')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('administration links', () => {
    it('shows Subjects & Assignments link for admins pointing at /subjects', () => {
      mockAuth({
        user: makeUser({ username: 'admin', role: 'admin', subjects: [] }),
        isAdmin: true,
        isAssignmentManager: true,
      });

      renderDashboard();

      const subjectsLink = screen.getByRole('link', { name: /subjects & assignments/i });
      expect(subjectsLink).toBeInTheDocument();
      expect(subjectsLink).toHaveAttribute('href', '/subjects');
      expect(screen.getByRole('link', { name: /manage users/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /manage groups/i })).not.toBeInTheDocument();
    });

    it('hides the Manage Users link for assignment managers and mentions user management in the Subjects card', () => {
      mockAuth({
        user: makeUser({ username: 'manager', role: 'assignment_manager', subjects: [] }),
        isAdmin: false,
        isAssignmentManager: true,
      });

      renderDashboard();

      // Manage Users is admin-only now
      expect(screen.queryByRole('link', { name: /^👥 Manage Users$/ })).not.toBeInTheDocument();
      expect(screen.queryAllByRole('link').some((l) => l.getAttribute('href') === '/users')).toBe(false);
      // AM copy tweak: Subjects card mentions managing users within their subjects
      const subjectsLink = screen.getByRole('link', { name: /subjects & assignments/i });
      expect(subjectsLink).toHaveAttribute('href', '/subjects');
      expect(subjectsLink).toHaveTextContent(/manage users within your subjects/i);
    });

    it('keeps the Manage Users link admin-only', () => {
      mockAuth({
        user: makeUser({ username: 'admin', role: 'admin', subjects: [] }),
        isAdmin: true,
        isAssignmentManager: true,
      });

      renderDashboard();

      const usersLink = screen.getByRole('link', { name: /^👥 Manage Users$/ });
      expect(usersLink).toHaveAttribute('href', '/users');
      // Admin keeps the plain Subjects card copy
      const subjectsLink = screen.getByRole('link', { name: /subjects & assignments/i });
      expect(subjectsLink).not.toHaveTextContent(/manage users within your subjects/i);
    });

    it('hides the administration block for normal users', () => {
      mockAuth({ user: makeUser({ subjects: [] }) });

      renderDashboard();

      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /subjects & assignments/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    });
  });

  describe('subject selection', () => {
    const multiSubjectFixture = {
      'sub-1': [
        { id: 'a-1', name: 'Assignment 1', group_count: 2 },
        { id: 'a-2', name: 'Assignment 2', group_count: 1 },
      ],
      'sub-2': [{ id: 'a-3', name: 'Assignment 3', group_count: 0 }],
    };
    const multiSubjectGroups = { 'a-1': [], 'a-2': [], 'a-3': [] };

    it('shows the subject picker instead of subject cards when nothing is selected', async () => {
      mockAuth({ user: makeUser({ subjects: [SUBJECT_1, SUBJECT_2] }) });
      mockApi({ subjects: multiSubjectFixture, groupsByAssignment: multiSubjectGroups });

      renderDashboard();

      expect(screen.getByText('Select your subject')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /software modelling/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /distributed systems/i })).toBeInTheDocument();

      // Assignment counts appear once the (already existing) subject fetches resolve
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /software modelling/i })).toHaveTextContent('2 assignments');
        expect(screen.getByRole('button', { name: /distributed systems/i })).toHaveTextContent('1 assignment');
      });

      // No subject card content is rendered while the picker is showing
      expect(screen.queryByText('Assignment 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Assignment 3')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /switch subject/i })).not.toBeInTheDocument();
    });

    it('selects a subject when its picker card is clicked', async () => {
      mockAuth({ user: makeUser({ subjects: [SUBJECT_1, SUBJECT_2] }) });
      mockApi({ subjects: multiSubjectFixture, groupsByAssignment: multiSubjectGroups });

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /distributed systems/i }));

      expect(mockSetCurrentSubject).toHaveBeenCalledWith('sub-2');
    });

    it('renders only the selected subject card plus a switcher when a subject is selected', async () => {
      mockAuth({
        user: makeUser({ subjects: [SUBJECT_1, SUBJECT_2], memberships: [MEMBERSHIP_A1] }),
        currentSubjectId: 'sub-1',
      });
      mockApi({ subjects: multiSubjectFixture, groupsByAssignment: multiSubjectGroups });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Assignment 1')).toBeInTheDocument();
        expect(screen.getByText('Assignment 2')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Software Modelling' })).toBeInTheDocument();
      // The other subject's card is not rendered
      expect(screen.queryByText('Assignment 3')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Distributed Systems' })).not.toBeInTheDocument();
      // No picker, but a switcher is available
      expect(screen.queryByText('Select your subject')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /switch subject/i })).toBeInTheDocument();
    });

    it('returns to the picker when Switch subject is clicked', async () => {
      mockAuth({ user: makeUser({ subjects: [SUBJECT_1, SUBJECT_2] }), currentSubjectId: 'sub-1' });
      mockApi({ subjects: multiSubjectFixture, groupsByAssignment: multiSubjectGroups });

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /switch subject/i }));

      expect(mockSetCurrentSubject).toHaveBeenCalledWith(null);
    });

    it('lands single-subject users straight on their subject card with no picker or switcher', async () => {
      mockAuth({ user: makeUser({ subjects: [SUBJECT_1], memberships: [MEMBERSHIP_A1] }) });
      mockApi({ subjects: { 'sub-1': [{ id: 'a-1', name: 'Assignment 1', group_count: 2 }] } });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Assignment 1')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Software Modelling' })).toBeInTheDocument();
      expect(screen.queryByText('Select your subject')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /switch subject/i })).not.toBeInTheDocument();
      expect(mockSetCurrentSubject).not.toHaveBeenCalled();
    });
  });

  describe('per-subject cards', () => {
    it('does not render subject cards or fetch subjects for admins', () => {
      mockAuth({
        user: makeUser({ username: 'admin', role: 'admin', subjects: [SUBJECT_1] }),
        isAdmin: true,
        isAssignmentManager: true,
      });
      mockApi();

      renderDashboard();

      expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/subjects/'));
      expect(screen.queryByText(/you are not enrolled in any subject/i)).not.toBeInTheDocument();
    });

    it('shows an empty state when the user has no subjects', () => {
      mockAuth({ user: makeUser({ subjects: [] }) });
      mockApi();

      renderDashboard();

      expect(
        screen.getByText('You are not enrolled in any subject yet. Contact your administrator.')
      ).toBeInTheDocument();
    });

    it('shows an inline error when the selected subject fails to load', async () => {
      mockAuth({ user: makeUser({ subjects: [SUBJECT_1, SUBJECT_2] }), currentSubjectId: 'sub-1' });
      mockApi({
        subjects: { 'sub-2': [{ id: 'a-3', name: 'Assignment 3', group_count: 0 }] },
        groupsByAssignment: { 'a-3': [] },
        failSubjects: ['sub-1'],
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load subject details')).toBeInTheDocument();
      });
      // The other (healthy) subject stays hidden behind the switcher
      expect(screen.queryByText('Assignment 3')).not.toBeInTheDocument();
    });
  });

  describe('assignment with membership', () => {
    const memberUser = makeUser({ memberships: [MEMBERSHIP_A1] });
    const subjectFixture = { 'sub-1': [{ id: 'a-1', name: 'Assignment 1', group_count: 2 }] };

    it('shows the current group with a leave button', async () => {
      mockAuth({ user: memberUser });
      mockApi({ subjects: subjectFixture });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/your group:/i)).toBeInTheDocument();
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
      });
      // No join UI for an assignment the user already belongs to
      expect(screen.queryByRole('button', { name: /^join$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /feeling lucky/i })).not.toBeInTheDocument();
    });

    it('fetches and shows group members only when expanded', async () => {
      mockAuth({ user: memberUser });
      mockApi({
        subjects: subjectFixture,
        membersByGroup: {
          'g-1': [
            { id: 'u-10', username: 'testuser', first_name: 'Test', last_name: 'User', role_name: 'user' },
            { id: 'u-20', username: 'alice', first_name: 'Alice', last_name: 'Smith', role_name: 'user' },
            { id: 'u-30', username: 'legacyuser', first_name: null, last_name: null, role_name: 'user' },
          ],
        },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /show members/i })).toBeInTheDocument();
      });
      expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g-1$/));

      await userEvent.click(screen.getByRole('button', { name: /show members/i }));

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g-1$/));
        // "Initial. LastName" format, current user marked, username fallback
        expect(screen.getByText('T. User')).toBeInTheDocument();
        expect(screen.getByText('A. Smith')).toBeInTheDocument();
        expect(screen.getByText('legacyuser')).toBeInTheDocument();
        expect(screen.getByText('(you)')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /hide members/i }));
      expect(screen.queryByText('A. Smith')).not.toBeInTheDocument();
    });

    it('hides the leave button and shows lock banner when the assignment is locked', async () => {
      mockAuth({ user: memberUser });
      mockApi({ locked: true, subjects: subjectFixture });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByText(/group joining is locked/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /leave group/i })).not.toBeInTheDocument();
    });

    it('leaves a group, refreshes the user, and refetches joinable groups', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      mockAuth({ user: memberUser });
      mockApi({ subjects: subjectFixture, groupsByAssignment: { 'a-1': [] } });
      api.post.mockResolvedValue({ data: {} });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /leave group/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g-1\/leave$/));
        expect(screen.getByText('Successfully left group')).toBeInTheDocument();
        expect(mockRefreshUser).toHaveBeenCalled();
        expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/assignments/a-1/groups'));
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Successfully left group')).not.toBeInTheDocument();
      });
    });

    it('shows the server error when leaving fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      mockAuth({ user: memberUser });
      mockApi({ subjects: subjectFixture });
      api.post.mockRejectedValue({ response: { data: { error: 'Group changes are locked' } } });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /leave group/i }));

      await waitFor(() => {
        expect(screen.getByText('Group changes are locked')).toBeInTheDocument();
      });
      expect(mockRefreshUser).not.toHaveBeenCalled();

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Group changes are locked')).not.toBeInTheDocument();
      });
    });
  });

  describe('assignment without membership', () => {
    const subjectFixture = { 'sub-1': [{ id: 'a-2', name: 'Assignment 2', group_count: 3 }] };

    it('lists joinable groups and filters out full ones', async () => {
      mockAuth({ user: makeUser() });
      mockApi({
        subjects: subjectFixture,
        groupsByAssignment: {
          'a-2': [
            { id: 'g-2', name: 'Team B', enabled: true, max_members: 5, member_count: 2 },
            { id: 'g-3', name: 'Team C', enabled: true, max_members: null, member_count: 10 },
            { id: 'g-4', name: 'Full Team', enabled: true, max_members: 3, member_count: 3 },
          ],
        },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Team B')).toBeInTheDocument();
        expect(screen.getByText('Team C')).toBeInTheDocument();
      });
      expect(screen.queryByText('Full Team')).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^join$/i })).toHaveLength(2);
    });

    it('shows a message when no joinable groups exist', async () => {
      mockAuth({ user: makeUser() });
      mockApi({ subjects: subjectFixture, groupsByAssignment: { 'a-2': [] } });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No available groups to join')).toBeInTheDocument();
      });
    });

    it('joins a group and refreshes the user', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      mockAuth({ user: makeUser() });
      mockApi({
        subjects: subjectFixture,
        groupsByAssignment: {
          'a-2': [{ id: 'g-2', name: 'Team B', enabled: true, max_members: 5, member_count: 2 }],
        },
      });
      api.post.mockResolvedValue({ data: { message: 'ok', groupId: 'g-2', groupName: 'Team B' } });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Team B')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^join$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g-2\/join$/));
        expect(screen.getByText('Successfully joined group')).toBeInTheDocument();
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Successfully joined group')).not.toBeInTheDocument();
      });
    });

    it('shows the server error when joining fails with 409', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      mockAuth({ user: makeUser() });
      mockApi({
        subjects: subjectFixture,
        groupsByAssignment: {
          'a-2': [{ id: 'g-2', name: 'Team B', enabled: true, max_members: 5, member_count: 2 }],
        },
      });
      api.post.mockRejectedValue({
        response: { status: 409, data: { error: 'You already belong to a group for this assignment' } },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Team B')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^join$/i }));

      await waitFor(() => {
        expect(screen.getByText('You already belong to a group for this assignment')).toBeInTheDocument();
      });
      expect(mockRefreshUser).not.toHaveBeenCalled();

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('You already belong to a group for this assignment')).not.toBeInTheDocument();
      });
    });

    it("joins a random non-empty group via I'm Feeling Lucky", async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

      mockAuth({ user: makeUser() });
      mockApi({
        subjects: subjectFixture,
        groupsByAssignment: {
          'a-2': [
            { id: 'g-empty', name: 'Empty Group', enabled: true, max_members: 5, member_count: 0 },
            { id: 'g-a', name: 'Active A', enabled: true, max_members: 5, member_count: 1 },
            { id: 'g-b', name: 'Active B', enabled: true, max_members: 5, member_count: 2 },
          ],
        },
      });
      api.post.mockResolvedValue({ data: {} });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /feeling lucky/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /feeling lucky/i }));

      await waitFor(() => {
        // pool is the non-empty groups [g-a, g-b]; floor(0.99 * 2) = 1 -> g-b
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g-b\/join$/));
      });

      randomSpy.mockRestore();
    });

    it('falls back to empty groups for lucky when all groups are empty', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

      mockAuth({ user: makeUser() });
      mockApi({
        subjects: subjectFixture,
        groupsByAssignment: {
          'a-2': [{ id: 'g-empty', name: 'Empty Group', enabled: true, max_members: 5, member_count: 0 }],
        },
      });
      api.post.mockResolvedValue({ data: {} });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /feeling lucky/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /feeling lucky/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/g-empty\/join$/));
      });

      randomSpy.mockRestore();
    });

    it('shows an error when lucky finds no joinable group', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      mockAuth({ user: makeUser() });
      mockApi({ subjects: subjectFixture, groupsByAssignment: { 'a-2': [] } });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /feeling lucky/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /feeling lucky/i }));

      await waitFor(() => {
        expect(screen.getByText('No available group to join')).toBeInTheDocument();
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows the locked banner instead of join UI when the assignment is locked', async () => {
      mockAuth({ user: makeUser() });
      mockApi({
        locked: true,
        subjects: subjectFixture,
        groupsByAssignment: {
          'a-2': [{ id: 'g-2', name: 'Team B', enabled: true, max_members: 5, member_count: 2 }],
        },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/group joining is locked/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /^join$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /feeling lucky/i })).not.toBeInTheDocument();
    });
  });

  describe('mixed subject content', () => {
    it('renders membership and join UI side by side within the same subject card', async () => {
      mockAuth({ user: makeUser({ memberships: [MEMBERSHIP_A1] }) });
      mockApi({
        subjects: {
          'sub-1': [
            { id: 'a-1', name: 'Assignment 1', group_count: 2 },
            { id: 'a-2', name: 'Assignment 2', group_count: 1 },
          ],
        },
        groupsByAssignment: {
          'a-2': [{ id: 'g-2', name: 'Team B', enabled: true, max_members: 5, member_count: 2 }],
        },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByText('Team B')).toBeInTheDocument();
      });

      const card = screen.getByRole('heading', { name: 'Software Modelling' }).closest('div');
      expect(within(card).getByRole('button', { name: /leave group/i })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: /^join$/i })).toBeInTheDocument();
      // groups are only fetched for the assignment without a membership
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/assignments/a-2/groups'));
      expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/assignments/a-1/groups'));
    });
  });
});
