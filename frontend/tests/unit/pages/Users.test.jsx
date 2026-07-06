import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import Users from '../../../src/pages/Users.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('@/utils/api');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

const SUBJECT_A = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Subject A',
  assignment_count: 1,
  member_count: 2,
};
const SUBJECT_B = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'Subject B',
  assignment_count: 1,
  member_count: 1,
};
const ASSIGNMENT_1 = { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Assignment 1', group_count: 1 };
const GROUP_1 = { id: 'cccccccc-0000-4000-8000-000000000001', name: 'Group 1', max_members: 5, member_count: 2 };
const MEMBERSHIP_1 = {
  assignment_id: ASSIGNMENT_1.id,
  assignment_name: 'Assignment 1',
  subject_id: SUBJECT_A.id,
  subject_name: 'Subject A',
  group_id: GROUP_1.id,
  group_name: 'Group 1',
};

describe('Users page', () => {
  const initialUsers = [
    {
      id: 'u0000000-0000-0000-0000-000000000001',
      username: 'u1',
      email: 'u1@test.com',
      first_name: 'First',
      last_name: 'Last',
      role_name: 'user',
      student_id: 's1',
      role_id: 3,
      enabled: true,
      subjects: [],
      memberships: [],
    },
  ];
  const initialSubjects = [SUBJECT_A, SUBJECT_B];

  /**
   * URL-router mock for api.get covering the page fetch (GET /users + GET /subjects)
   * plus the endpoints used by CascadingAssignmentSelect inside the modals.
   */
  const mockApiGet = ({
    users = initialUsers,
    subjects = initialSubjects,
    assignments = [ASSIGNMENT_1],
    groups = [GROUP_1],
  } = {}) => {
    api.get.mockImplementation((url) => {
      if (/\/users$/.test(url)) {
        return Promise.resolve({ data: { users } });
      }
      if (/\/subjects$/.test(url)) {
        return Promise.resolve({ data: { subjects } });
      }
      if (/\/subjects\/[^/]+$/.test(url)) {
        return Promise.resolve({ data: { subject: SUBJECT_A, assignments } });
      }
      if (/\/assignments\/[^/]+\/groups$/.test(url)) {
        return Promise.resolve({ data: { groups } });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });
  };

  const renderPage = async (options) => {
    mockApiGet(options);
    render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/manage users/i)).toBeInTheDocument());
  };

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
    api.get.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText(/manage users/i)).not.toBeInTheDocument();
  });

  it('fetches users and subjects in parallel and renders users', async () => {
    await renderPage();

    expect(screen.getByText('u1')).toBeInTheDocument();
    expect(screen.getByText('u1@test.com')).toBeInTheDocument();
    // Subjects column placeholder for a user without subjects
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/users$/));
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/subjects$/));
    expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/groups\/enabled$/));
  });

  it('shows error when fetch fails', async () => {
    api.get.mockRejectedValue(new Error('nope'));

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
    await renderPage({ users: [], subjects: [] });

    expect(screen.getByText('No admin or manager accounts')).toBeInTheDocument();
  });

  describe('sections by subject membership', () => {
    it('splits regular users into "without a subject" and "in subjects" sections', async () => {
      const users = [
        { ...initialUsers[0], id: 'u1', username: 'bob', email: 'bob@t.com', subjects: [] },
        {
          ...initialUsers[0],
          id: 'u2',
          username: 'carol',
          email: 'carol@t.com',
          subjects: [SUBJECT_A],
          memberships: [MEMBERSHIP_1],
        },
      ];
      await renderPage({ users });

      const withoutSection = screen.getByRole('heading', { name: /users without a subject/i }).closest('.mb-8');
      expect(within(withoutSection).getByText('bob')).toBeInTheDocument();
      expect(within(withoutSection).queryByText('carol')).not.toBeInTheDocument();

      const inSection = screen.getByRole('heading', { name: /users in subjects/i }).closest('.mb-8');
      expect(within(inSection).getByText('carol')).toBeInTheDocument();
      expect(within(inSection).queryByText('bob')).not.toBeInTheDocument();
    });

    it('keeps admins and managers in the Administrators section', async () => {
      const users = [
        { ...initialUsers[0], id: 'u1', username: 'boss', role_name: 'admin', subjects: [] },
        { ...initialUsers[0], id: 'u2', username: 'mgr', email: 'm@t.com', role_name: 'assignment_manager' },
      ];
      await renderPage({ users });

      const adminSection = screen.getByRole('heading', { name: /administrators/i }).closest('.mb-8');
      expect(within(adminSection).getByText('boss')).toBeInTheDocument();
      expect(within(adminSection).getByText('mgr')).toBeInTheDocument();
    });
  });

  describe('Subjects column', () => {
    it('renders subject names joined with a comma', async () => {
      const users = [{ ...initialUsers[0], subjects: [SUBJECT_A, SUBJECT_B] }];
      await renderPage({ users });

      expect(screen.getByText('Subject A, Subject B')).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader', { name: 'Subjects' }).length).toBeGreaterThan(0);
      expect(screen.queryByRole('columnheader', { name: 'Current Group' })).not.toBeInTheDocument();
    });

    it('renders an em dash when the user has no subjects', async () => {
      await renderPage();
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('adds a title tooltip listing memberships as Subject › Assignment › Group lines', async () => {
      const secondMembership = {
        assignment_id: 'bbbbbbbb-0000-4000-8000-000000000002',
        assignment_name: 'Assignment 2',
        subject_id: SUBJECT_B.id,
        subject_name: 'Subject B',
        group_id: 'cccccccc-0000-4000-8000-000000000002',
        group_name: 'Group 2',
      };
      const users = [
        { ...initialUsers[0], subjects: [SUBJECT_A, SUBJECT_B], memberships: [MEMBERSHIP_1, secondMembership] },
      ];
      await renderPage({ users });

      const cell = screen.getByText('Subject A, Subject B');
      expect(cell).toHaveAttribute('title', 'Subject A › Assignment 1 › Group 1\nSubject B › Assignment 2 › Group 2');
    });
  });

  describe('subject filter', () => {
    const filterUsers = [
      { ...initialUsers[0], id: 'u1', username: 'bob', email: 'bob@t.com', subjects: [SUBJECT_A] },
      { ...initialUsers[0], id: 'u2', username: 'carol', email: 'carol@t.com', subjects: [SUBJECT_B] },
    ];

    it('offers All subjects plus each subject as options', async () => {
      await renderPage({ users: filterUsers });

      const select = screen.getByRole('combobox', { name: /filter by subject/i });
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
      expect(options).toEqual(['All subjects', 'Subject A', 'Subject B']);
    });

    it('filters users client-side by selected subject', async () => {
      const user = userEvent.setup();
      await renderPage({ users: filterUsers });

      await user.selectOptions(screen.getByRole('combobox', { name: /filter by subject/i }), SUBJECT_A.id);

      expect(screen.getByText('bob')).toBeInTheDocument();
      expect(screen.queryByText('carol')).not.toBeInTheDocument();
    });

    it('clear filters resets the subject filter', async () => {
      const user = userEvent.setup();
      await renderPage({ users: filterUsers });

      await user.selectOptions(screen.getByRole('combobox', { name: /filter by subject/i }), SUBJECT_B.id);
      expect(screen.queryByText('bob')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /clear filters/i }));

      expect(screen.getByText('bob')).toBeInTheDocument();
      expect(screen.getByText('carol')).toBeInTheDocument();
    });
  });

  describe('Assign Group modal', () => {
    const memberUser = {
      ...initialUsers[0],
      subjects: [SUBJECT_A],
      memberships: [],
    };

    it('opens AssignGroupModal for the right user when the row action is clicked', async () => {
      const user = userEvent.setup();
      await renderPage({ users: [memberUser] });

      await user.click(screen.getByRole('button', { name: /assign group/i }));

      const heading = screen.getByRole('heading', { name: 'Assign Group — u1' });
      expect(heading).toBeInTheDocument();
      // Cascade offers only the target user's subjects
      const modal = heading.closest('.fixed');
      expect(within(modal).getByRole('option', { name: 'Subject A' })).toBeInTheDocument();
      expect(within(modal).queryByRole('option', { name: 'Subject B' })).not.toBeInTheDocument();
    });

    it('assigns via the cascade, PUTs assignmentId+groupId, refetches and shows success', async () => {
      const user = userEvent.setup();
      api.put.mockResolvedValue({ data: {} });
      await renderPage({ users: [memberUser] });

      await user.click(screen.getByRole('button', { name: /assign group/i }));
      await user.selectOptions(screen.getByLabelText('Subject'), SUBJECT_A.id);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Assignment'), ASSIGNMENT_1.id);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Group'), GROUP_1.id);

      const callsBefore = api.get.mock.calls.filter((c) => /\/users$/.test(c[0])).length;
      await user.click(screen.getByRole('button', { name: 'Assign' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/group$/),
          { assignmentId: ASSIGNMENT_1.id, groupId: GROUP_1.id }
        );
      });
      await waitFor(() => {
        expect(screen.getByText('User group updated successfully')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Assign Group — u1' })).not.toBeInTheDocument();
        expect(api.get.mock.calls.filter((c) => /\/users$/.test(c[0])).length).toBeGreaterThan(callsBefore);
      });
    });

    it('shows the API error inside the modal and keeps it open on failure', async () => {
      const user = userEvent.setup();
      api.put.mockRejectedValue({ response: { data: { error: 'Update denied' } } });
      await renderPage({ users: [memberUser] });

      await user.click(screen.getByRole('button', { name: /assign group/i }));
      await user.selectOptions(screen.getByLabelText('Subject'), SUBJECT_A.id);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Assignment'), ASSIGNMENT_1.id);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Group'), GROUP_1.id);
      await user.click(screen.getByRole('button', { name: 'Assign' }));

      await waitFor(() => expect(screen.getByText('Update denied')).toBeInTheDocument());
      expect(screen.getByRole('heading', { name: 'Assign Group — u1' })).toBeInTheDocument();
    });

    it('closes the modal without a PUT when Cancel is clicked', async () => {
      const user = userEvent.setup();
      await renderPage({ users: [memberUser] });

      await user.click(screen.getByRole('button', { name: /assign group/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('heading', { name: 'Assign Group — u1' })).not.toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('shows Assign Group for assignment managers', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000098', username: 'mgr', role: 'assignment_manager' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      await renderPage({ users: [memberUser] });

      expect(screen.getByRole('button', { name: /assign group/i })).toBeInTheDocument();
    });

    it('hides Assign Group for admin-role rows', async () => {
      await renderPage({ users: [{ ...initialUsers[0], role_name: 'admin' }] });
      expect(screen.queryByRole('button', { name: /assign group/i })).not.toBeInTheDocument();
    });

    it('hides Assign Group for assignment_manager-role rows', async () => {
      await renderPage({ users: [{ ...initialUsers[0], role_name: 'assignment_manager' }] });
      expect(screen.queryByRole('button', { name: /assign group/i })).not.toBeInTheDocument();
    });

    it('hides Assign Group when the viewer is a regular user', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await renderPage({ users: [memberUser] });

      expect(screen.queryByRole('button', { name: /assign group/i })).not.toBeInTheDocument();
    });
  });

  describe('Manage Subjects modal', () => {
    const enrolledUser = {
      ...initialUsers[0],
      subjects: [SUBJECT_A],
      memberships: [MEMBERSHIP_1],
    };

    it('shows the Manage Subjects action for admins on user rows only', async () => {
      const users = [enrolledUser, { ...initialUsers[0], id: 'u9', username: 'mgr', role_name: 'assignment_manager' }];
      await renderPage({ users });

      expect(screen.getAllByRole('button', { name: /manage subjects/i })).toHaveLength(1);
    });

    it('hides the Manage Subjects action for assignment managers', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000098', username: 'mgr', role: 'assignment_manager' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      await renderPage({ users: [enrolledUser] });

      expect(screen.queryByRole('button', { name: /manage subjects/i })).not.toBeInTheDocument();
    });

    it('opens the modal with checkboxes pre-checked for the user subjects', async () => {
      const user = userEvent.setup();
      await renderPage({ users: [enrolledUser] });

      await user.click(screen.getByRole('button', { name: /manage subjects/i }));

      expect(screen.getByRole('heading', { name: 'Manage Subjects — u1' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Subject A' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Subject B' })).not.toBeChecked();
    });

    it('diff-saves: POST for added subjects and DELETE for removed, then refetches with success', async () => {
      const user = userEvent.setup();
      api.post.mockResolvedValue({ data: {} });
      api.delete.mockResolvedValue({ data: {} });
      await renderPage({ users: [enrolledUser] });

      await user.click(screen.getByRole('button', { name: /manage subjects/i }));
      await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
      await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT_B.id}/users`), {
          userIds: [enrolledUser.id],
        });
      });
      expect(api.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/subjects/${SUBJECT_A.id}/users/${enrolledUser.id}`)
      );
      await waitFor(() => {
        expect(screen.getByText('Subjects updated successfully')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Manage Subjects — u1' })).not.toBeInTheDocument();
      });
    });

    it('warns inside the modal when unchecking a subject that holds group memberships', async () => {
      const user = userEvent.setup();
      await renderPage({ users: [enrolledUser] });

      await user.click(screen.getByRole('button', { name: /manage subjects/i }));
      expect(screen.queryByText(/removing a subject also removes/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
      expect(
        screen.getByText(/removing a subject also removes the user's group memberships in it\./i)
      ).toBeInTheDocument();
    });

    it('shows the API error and keeps the modal open when saving fails', async () => {
      const user = userEvent.setup();
      api.post.mockRejectedValue({ response: { data: { error: 'Enrolment failed' } } });
      await renderPage({ users: [enrolledUser] });

      await user.click(screen.getByRole('button', { name: /manage subjects/i }));
      await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.getByText('Enrolment failed')).toBeInTheDocument());
      expect(screen.getByRole('heading', { name: 'Manage Subjects — u1' })).toBeInTheDocument();
      expect(screen.queryByText('Subjects updated successfully')).not.toBeInTheDocument();
    });
  });

  describe('Create User', () => {
    const setupRenderedPage = async () => {
      await renderPage();
    };

    const fillRequiredFields = async (user) => {
      await user.type(screen.getByPlaceholderText('Enter username'), 'newuser');
      await user.type(screen.getByPlaceholderText('Enter email'), 'new@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'Test');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'User');
    };

    const selectSubject = async (user) => {
      await user.selectOptions(screen.getByLabelText('Subject'), SUBJECT_A.id);
    };

    it('shows Create User button for admin', async () => {
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
    });

    it('hides Create User button for assignment_manager', async () => {
      useAuth.mockReturnValue({
        user: { username: 'manager', role: 'assignment_manager' },
        isAdmin: false,
        isAssignmentManager: true,
      });
      await setupRenderedPage();
      expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
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

    it('blocks creating a role=user account without a subject', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(screen.getByText('Subject is required')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
      expect(screen.getByText('Create New User')).toBeInTheDocument();
    });

    it('creates a user with subjectIds and optional placement and shows success', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({ data: { message: 'User created successfully', user: {} } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Assignment'), ASSIGNMENT_1.id);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Group'), GROUP_1.id);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({
            username: 'newuser',
            email: 'new@test.com',
            role: 'user',
            subjectIds: [SUBJECT_A.id],
            assignmentId: ASSIGNMENT_1.id,
            groupId: GROUP_1.id,
          })
        );
      });
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('assignmentIds');
      await waitFor(() => {
        expect(screen.getByText('User created successfully')).toBeInTheDocument();
        expect(screen.queryByText('Create New User')).not.toBeInTheDocument();
      });
    });

    it('omits assignmentId and groupId when only a subject is selected', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({ data: { message: 'ok', user: {} } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({ subjectIds: [SUBJECT_A.id] })
        );
      });
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('assignmentId');
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('groupId');
    });

    it('shows a yellow warning banner when creation succeeds with a warning', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({
        data: { message: 'ok', user: {}, warning: 'User created but the setup email failed to send' },
      });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText('User created but the setup email failed to send')).toBeInTheDocument();
      });
      expect(screen.queryByText('Create New User')).not.toBeInTheDocument();
      const banner = screen.getByText('User created but the setup email failed to send').closest('div');
      expect(banner.className).toContain('bg-yellow-50');
    });

    it('creates an assignment manager with assignmentIds scope and no subjectIds', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({ data: { message: 'ok', user: {} } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      const roleSelect = screen
        .getAllByRole('combobox')
        .find((el) => el.querySelector('option[value="assignment_manager"]') && !el.querySelector('option[value=""]'));
      await user.selectOptions(roleSelect, 'assignment_manager');

      // AM cascade hides the group select
      expect(screen.queryByLabelText('Group')).not.toBeInTheDocument();

      await selectSubject(user);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument());
      await user.selectOptions(screen.getByLabelText('Assignment'), ASSIGNMENT_1.id);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({ role: 'assignment_manager', assignmentIds: [ASSIGNMENT_1.id] })
        );
      });
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('subjectIds');
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('groupId');
    });

    it('creates an assignment manager without assignmentIds when no assignment is chosen', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({ data: { message: 'ok', user: {} } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      const roleSelect = screen
        .getAllByRole('combobox')
        .find((el) => el.querySelector('option[value="assignment_manager"]') && !el.querySelector('option[value=""]'));
      await user.selectOptions(roleSelect, 'assignment_manager');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({ role: 'assignment_manager' })
        );
      });
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('assignmentIds');
    });

    it('resets the cascade when the role changes', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await selectSubject(user);
      expect(screen.getByLabelText('Subject')).toHaveValue(SUBJECT_A.id);

      const roleSelect = screen
        .getAllByRole('combobox')
        .find((el) => el.querySelector('option[value="assignment_manager"]') && !el.querySelector('option[value=""]'));
      await user.selectOptions(roleSelect, 'assignment_manager');

      expect(screen.getByLabelText('Subject')).toHaveValue('');
    });

    it('shows generic error when user creation fails with 409', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockRejectedValue({ response: { data: { error: 'Username already exists' }, status: 409 } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText('Username or email already in use. Please use a different one.')).toBeInTheDocument();
      });
    });

    it('shows generic error when user creation fails with 400', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockRejectedValue({ response: { data: { error: 'Invalid input' }, status: 400 } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid input. Please check all required fields.')).toBeInTheDocument();
      });
    });

    it('shows generic error when user creation fails with 500', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockRejectedValue({ response: { data: { error: 'Server error' }, status: 500 } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
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

    it('sends firstName, lastName and studentId when creating a user', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({ data: { message: 'User created', user: {} } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'jdoe');
      await user.type(screen.getByPlaceholderText('Enter email'), 'j@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'John');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'Doe');
      await user.type(screen.getByPlaceholderText('Enter student ID'), 'ST99');
      await selectSubject(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
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

    it('sendSetupEmail checkbox is unchecked by default', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /create user/i }));

      const checkbox = screen.getByRole('checkbox', { name: /send.*set password.*email now/i });
      expect(checkbox).not.toBeChecked();
    });

    it('passes sendSetupEmail: false when checkbox is unchecked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({ data: { message: 'User created successfully', user: {} } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({ sendSetupEmail: false })
        );
      });
    });

    it('passes sendSetupEmail: true when checkbox is checked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      api.post.mockResolvedValue({ data: { message: 'User created successfully', user: {} } });

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillRequiredFields(user);
      await selectSubject(user);
      await user.click(screen.getByRole('checkbox', { name: /send.*set password.*email now/i }));
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({ sendSetupEmail: true })
        );
      });
    });
  });

  it('displays formatted role names instead of raw values', async () => {
    const usersWithRoles = [
      { ...initialUsers[0], id: 'u1', username: 'a1', email: 'a1@t.com', role_name: 'admin', role_id: 1 },
      { ...initialUsers[0], id: 'u2', username: 'a2', email: 'a2@t.com', role_name: 'assignment_manager', role_id: 2 },
      { ...initialUsers[0], id: 'u3', username: 'a3', email: 'a3@t.com', role_name: 'user', role_id: 3 },
    ];

    await renderPage({ users: usersWithRoles });

    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assignment Manager').length).toBeGreaterThan(0);

    const roleBadges = document.querySelectorAll('span.rounded-full');
    const badgeTexts = Array.from(roleBadges).map((el) => el.textContent);
    expect(badgeTexts).not.toContain('admin');
    expect(badgeTexts).not.toContain('assignment_manager');
    expect(badgeTexts).toContain('Admin');
    expect(badgeTexts).toContain('Assignment Manager');
    expect(badgeTexts).toContain('User');
  });

  describe('Edit User', () => {
    const setupRenderedPage = async (users = initialUsers) => {
      await renderPage({ users });
    };

    it('shows Edit button for admin on all users', async () => {
      await setupRenderedPage();
      expect(screen.getByRole('button', { name: /edit user profile/i })).toBeInTheDocument();
    });

    it('shows Edit button for regular users on their own row', async () => {
      useAuth.mockReturnValue({
        user: { id: 'u0000000-0000-0000-0000-000000000001', username: 'u1', role: 'user' },
        isAdmin: false,
        isAssignmentManager: false,
      });
      await setupRenderedPage();
      expect(screen.queryByRole('button', { name: /edit user profile/i })).toBeInTheDocument();
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

    it('shows a read-only memberships summary for role user', async () => {
      const user = userEvent.setup();
      await setupRenderedPage([{ ...initialUsers[0], subjects: [SUBJECT_A], memberships: [MEMBERSHIP_1] }]);

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      expect(screen.getByText('Memberships')).toBeInTheDocument();
      expect(screen.getByText('Subject A › Assignment 1 › Group 1')).toBeInTheDocument();
    });

    it('shows None in the memberships summary when the user has no memberships', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      expect(screen.getByText('Memberships')).toBeInTheDocument();
      expect(screen.getByText('None')).toBeInTheDocument();
    });

    it('does not show the memberships summary for admin-role users', async () => {
      const user = userEvent.setup();
      await setupRenderedPage([{ ...initialUsers[0], role_name: 'admin' }]);

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      expect(screen.queryByText('Memberships')).not.toBeInTheDocument();
    });

    it('admin can edit user and save successfully', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      const usernameInput = screen.getByDisplayValue('u1');
      expect(usernameInput.disabled).toBe(true);

      const firstNameInput = screen.getByDisplayValue('First');
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'NewFirst');

      const lastNameInput = screen.getByDisplayValue('Last');
      await user.clear(lastNameInput);
      await user.type(lastNameInput, 'NewLast');

      api.put.mockResolvedValue({});

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/),
          expect.objectContaining({ email: 'u1@test.com', firstName: 'NewFirst', lastName: 'NewLast' })
        );
        expect(screen.getByText('User updated successfully')).toBeInTheDocument();
      });

      expect(screen.queryByText('Edit User')).not.toBeInTheDocument();

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('User updated successfully')).not.toBeInTheDocument();
      });
    });

    it('admin can edit email, studentId, and enabled fields', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      const emailInput = screen.getByDisplayValue('u1@test.com');
      await user.clear(emailInput);
      await user.type(emailInput, 'new@test.com');

      const studentInput = screen.getByDisplayValue('s1');
      await user.clear(studentInput);
      await user.type(studentInput, 's999');

      const enabledCheckbox = screen.getByRole('checkbox', { name: /enabled/i });
      await user.click(enabledCheckbox);

      api.put.mockResolvedValue({});

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
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

      const modal = screen.getByText('Edit User').closest('div');
      expect(within(modal).queryByLabelText(/role/i)).not.toBeInTheDocument();
      expect(within(modal).getByText('Enabled')).toBeInTheDocument();
    });

    it('shows error when edit fails', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /edit user profile/i }));

      api.put.mockRejectedValue({ response: { data: { error: 'Username taken' } } });

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

      api.put.mockResolvedValue({});

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
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

      api.put.mockResolvedValue({});

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\//),
          expect.objectContaining({ enabled: false })
        );
      });
    });
  });

  describe('CSV Export', () => {
    const multiUsers = [
      {
        ...initialUsers[0],
        id: 'u0000000-0000-0000-0000-000000000001',
        username: 'admin1',
        first_name: 'Ad',
        last_name: 'Min',
        email: 'admin@test.com',
        role_name: 'admin',
        student_id: null,
        role_id: 1,
      },
      {
        ...initialUsers[0],
        id: 'u0000000-0000-0000-0000-000000000002',
        username: 'nosubject',
        first_name: 'No',
        last_name: 'Subject',
        email: 'nosubject@test.com',
        student_id: 's2',
      },
      {
        ...initialUsers[0],
        id: 'u0000000-0000-0000-0000-000000000003',
        username: 'enrolled',
        first_name: 'In',
        last_name: 'Subject',
        email: 'enrolled@test.com',
        student_id: 's3',
        subjects: [SUBJECT_A],
        memberships: [MEMBERSHIP_1],
      },
    ];

    let createObjectURL;
    let revokeObjectURL;
    let anchorClick;

    const setupRenderedPage = async () => {
      await renderPage({ users: multiUsers });
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
      expect(screen.getByRole('button', { name: /export users without a subject/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export users in subjects/i })).toBeInTheDocument();
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
      expect(text).not.toContain('nosubject');
      expect(text).not.toContain('enrolled');
    });

    it('exports only subject-less users when section export is clicked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export users without a subject/i }));

      const text = await readBlob(createObjectURL.mock.calls[0][0]);
      expect(text).toContain('nosubject');
      expect(text).not.toContain('admin1');
      expect(text).not.toContain('enrolled');
    });

    it('exports only enrolled users when section export is clicked', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export users in subjects/i }));

      const text = await readBlob(createObjectURL.mock.calls[0][0]);
      expect(text).toContain('enrolled');
      expect(text).not.toContain('admin1');
      expect(text).not.toContain('nosubject');
    });

    it('CSV includes Subjects and Groups columns with joined values', async () => {
      const user = userEvent.setup();
      await setupRenderedPage();

      await user.click(screen.getByRole('button', { name: /export all/i }));

      const text = await readBlob(createObjectURL.mock.calls[0][0]);
      const lines = text.split('\n');
      expect(lines[0]).toBe('Username,First Name,Last Name,Email,Role,Subjects,Groups,Student ID');
      expect(text).toContain('admin@test.com');
      expect(text).toContain('Subject A');
      expect(text).toContain('Assignment 1:Group 1');
      expect(text).not.toContain('Group,Student ID');
    });
  });

  // ── Delete user ────────────────────────────────────────────────────────
  describe('Delete user', () => {
    const setupDeletePage = async (users = initialUsers) => {
      await renderPage({ users });
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

    it('warns and lists memberships when the user being deleted has group memberships', async () => {
      const userWithMemberships = {
        ...initialUsers[0],
        subjects: [SUBJECT_A],
        memberships: [MEMBERSHIP_1],
      };
      const user = userEvent.setup();
      await setupDeletePage([userWithMemberships]);

      await user.click(screen.getByRole('button', { name: /delete user/i }));

      const modal = screen.getByText(/will be removed/i).closest('.bg-white');
      expect(modal).toHaveTextContent('Subject A › Assignment 1 › Group 1');
    });

    it('does not show warning when user has no memberships', async () => {
      const user = userEvent.setup();
      await setupDeletePage([{ ...initialUsers[0], subjects: [SUBJECT_A], memberships: [] }]);

      await user.click(screen.getByRole('button', { name: /delete user/i }));

      expect(screen.queryByText(/will be removed/i)).not.toBeInTheDocument();
    });

    it('delete modal has scrollable layout so action buttons remain accessible with many items', async () => {
      const user = userEvent.setup();
      const manyUsers = Array.from({ length: 50 }, (_, i) => ({
        ...initialUsers[0],
        id: `u0000000-0000-0000-0000-0000000000${String(i + 10).padStart(2, '0')}`,
        username: `user${i}`,
        email: `user${i}@test.com`,
        subjects: [SUBJECT_A],
        memberships: [MEMBERSHIP_1],
      }));
      await setupDeletePage(manyUsers);

      await user.click(screen.getAllByRole('button', { name: /delete user/i })[0]);

      const dialog = screen.getByText(/delete 1 user\?/i).closest('.bg-white');
      expect(dialog).toHaveClass('max-h-[90vh]');
      expect(dialog).toHaveClass('flex-col');

      const scrollable = dialog.querySelector('.overflow-y-auto');
      expect(scrollable).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /delete 1 user$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('deletes user after confirmation and shows success', async () => {
      const user = userEvent.setup();
      await setupDeletePage();
      api.delete.mockResolvedValueOnce({});

      await user.click(screen.getByRole('button', { name: /delete user/i }));
      mockApiGet({ users: [] });
      await user.click(screen.getByRole('button', { name: /delete 1 user$/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(
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

      expect(api.delete).not.toHaveBeenCalled();
      expect(screen.queryByText(/delete 1 user\?/i)).not.toBeInTheDocument();
    });

    it('shows error when delete fails', async () => {
      const user = userEvent.setup();
      await setupDeletePage();
      api.delete.mockRejectedValue({ response: { data: { error: 'Cannot delete user' } } });

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

      await user.click(screen.getByRole('checkbox', { name: /select all users without a subject/i }));

      expect(screen.getByRole('button', { name: /delete \(2\)/i })).toBeInTheDocument();
    });

    it('section select-all does not select the current logged-in user', async () => {
      const user = userEvent.setup();
      const usersWithSelf = [
        { ...initialUsers[0], id: 'u1', username: 'other', email: 'o@t.com' },
        { ...initialUsers[0], id: 'u0000000-0000-0000-0000-000000000099', username: 'me', email: 'm@t.com' },
      ];
      await setupDeletePage(usersWithSelf);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a subject/i }));

      expect(screen.getByRole('button', { name: /delete \(1\)/i })).toBeInTheDocument();
    });

    it('bulk deletes all selected users and shows success', async () => {
      const user = userEvent.setup();
      const twoUsers = [
        { ...initialUsers[0], id: 'u1', username: 'user1', email: 'u1@t.com' },
        { ...initialUsers[0], id: 'u2', username: 'user2', email: 'u2@t.com' },
      ];
      await setupDeletePage(twoUsers);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a subject/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      api.delete.mockResolvedValue({});
      mockApiGet({ users: [] });

      await user.click(screen.getByRole('button', { name: /delete 2 users/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledTimes(1);
        expect(api.delete).toHaveBeenCalledWith(expect.stringMatching(/\/users\/bulk$/), {
          data: { ids: expect.arrayContaining(['u1', 'u2']) },
        });
        expect(screen.getByText('Deleted 2 users')).toBeInTheDocument();
      });
    });
  });

  describe('Send setup emails', () => {
    const pendingUser = {
      ...initialUsers[0],
      id: 'u0000000-0000-0000-0000-000000000010',
      username: 'pending1',
      email: 'pending1@test.com',
      status: 'pending',
    };
    const activeUser = {
      ...initialUsers[0],
      id: 'u0000000-0000-0000-0000-000000000011',
      username: 'active1',
      email: 'active1@test.com',
      status: 'active',
    };

    it('shows "Send Setup Email" button when pending users exist', async () => {
      await renderPage({ users: [pendingUser] });
      expect(screen.getByRole('button', { name: /send setup email/i })).toBeInTheDocument();
    });

    it('does not show "Send Setup Email" button when no pending users exist', async () => {
      await renderPage({ users: [activeUser] });
      expect(screen.queryByRole('button', { name: /send setup email/i })).not.toBeInTheDocument();
    });

    it('shows confirmation modal when clicking Send Setup Emails button', async () => {
      const user = userEvent.setup();
      await renderPage({ users: [pendingUser] });

      await user.click(screen.getByRole('button', { name: /send setup email/i }));

      expect(screen.getByRole('heading', { name: /send setup email\??/i })).toBeInTheDocument();
      expect(screen.getByText(/1 pending user/i)).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('cancels sending when Cancel is clicked in confirmation modal', async () => {
      const user = userEvent.setup();
      await renderPage({ users: [pendingUser] });

      await user.click(screen.getByRole('button', { name: /send setup email/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText(/1 pending user/i)).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('calls send-setup-emails API for all pending users after confirming', async () => {
      const user = userEvent.setup();
      await renderPage({ users: [pendingUser, activeUser] });
      api.post.mockResolvedValue({ data: { sent: 1, errors: [] } });

      await user.click(screen.getByRole('button', { name: /send setup email/i }));
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringContaining('/users/send-setup-emails'), {});
      });
    });

    it('sends only to selected pending users when selection is active', async () => {
      const user = userEvent.setup();
      const pendingUser2 = {
        ...pendingUser,
        id: 'u0000000-0000-0000-0000-000000000012',
        username: 'pending2',
        email: 'pending2@test.com',
      };
      await renderPage({ users: [pendingUser, pendingUser2] });
      api.post.mockResolvedValue({ data: { sent: 1, errors: [] } });

      const checkbox = screen.getByRole('checkbox', { name: /select pending1/i });
      await user.click(checkbox);

      await user.click(screen.getByRole('button', { name: /send setup email/i }));
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringContaining('/users/send-setup-emails'), {
          userIds: ['u0000000-0000-0000-0000-000000000010'],
        });
      });
    });
  });

  describe('User search', () => {
    const searchUsers = [
      {
        ...initialUsers[0],
        id: 'u1',
        username: 'jdoe',
        email: 'jdoe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        student_id: 'S001',
        status: 'active',
      },
      {
        ...initialUsers[0],
        id: 'u2',
        username: 'msmith',
        email: 'msmith@example.com',
        first_name: 'Mary',
        last_name: 'Smith',
        student_id: 'S002',
        status: 'active',
      },
    ];

    const renderSearchPage = async () => {
      await renderPage({ users: searchUsers });
    };

    it('shows all users when search is empty', async () => {
      await renderSearchPage();
      expect(screen.getByText('jdoe')).toBeInTheDocument();
      expect(screen.getByText('msmith')).toBeInTheDocument();
    });

    it('filters users by username', async () => {
      const user = userEvent.setup();
      await renderSearchPage();

      await user.type(screen.getByPlaceholderText(/search by name, email/i), 'jdoe');

      expect(screen.getByText('jdoe')).toBeInTheDocument();
      expect(screen.queryByText('msmith')).not.toBeInTheDocument();
    });

    it('filters users by email', async () => {
      const user = userEvent.setup();
      await renderSearchPage();

      await user.type(screen.getByPlaceholderText(/search by name, email/i), 'msmith@');

      expect(screen.queryByText('jdoe')).not.toBeInTheDocument();
      expect(screen.getByText('msmith')).toBeInTheDocument();
    });

    it('filters users by student ID', async () => {
      const user = userEvent.setup();
      await renderSearchPage();

      await user.type(screen.getByPlaceholderText(/search by name, email/i), 'S001');

      expect(screen.getByText('jdoe')).toBeInTheDocument();
      expect(screen.queryByText('msmith')).not.toBeInTheDocument();
    });

    it('filters users by first name', async () => {
      const user = userEvent.setup();
      await renderSearchPage();

      await user.type(screen.getByPlaceholderText(/search by name, email/i), 'mary');

      expect(screen.queryByText('jdoe')).not.toBeInTheDocument();
      expect(screen.getByText('msmith')).toBeInTheDocument();
    });

    it('clear filters button also clears search term', async () => {
      const user = userEvent.setup();
      await renderSearchPage();

      await user.type(screen.getByPlaceholderText(/search by name, email/i), 'jdoe');
      expect(screen.queryByText('msmith')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /clear filters/i }));

      expect(screen.getByText('jdoe')).toBeInTheDocument();
      expect(screen.getByText('msmith')).toBeInTheDocument();
    });
  });

  // ── handleDeleteConfirmed routing (single vs bulk) ─────────────────────
  describe('handleDeleteConfirmed routing (single vs bulk)', () => {
    const setupDeletePage = async (users = initialUsers) => {
      await renderPage({ users });
    };

    it('single delete still uses DELETE /users/:id', async () => {
      const user = userEvent.setup();
      await setupDeletePage();
      api.delete.mockResolvedValueOnce({});

      await user.click(screen.getByRole('button', { name: /delete user/i }));
      mockApiGet({ users: [] });
      await user.click(screen.getByRole('button', { name: /delete 1 user$/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/)
        );
        expect(api.delete).not.toHaveBeenCalledWith(expect.stringMatching(/\/users\/bulk/));
      });
    });

    it('multi-delete uses DELETE /users/bulk with correct ids array', async () => {
      const user = userEvent.setup();
      const twoUsers = [
        { ...initialUsers[0], id: 'u1', username: 'user1', email: 'u1@t.com' },
        { ...initialUsers[0], id: 'u2', username: 'user2', email: 'u2@t.com' },
      ];
      await setupDeletePage(twoUsers);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a subject/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      api.delete.mockResolvedValueOnce({});
      mockApiGet({ users: [] });

      await user.click(screen.getByRole('button', { name: /delete 2 users/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledTimes(1);
        expect(api.delete).toHaveBeenCalledWith(expect.stringMatching(/\/users\/bulk$/), {
          data: { ids: expect.arrayContaining(['u1', 'u2']) },
        });
      });
    });

    it('success toast is shown after bulk delete', async () => {
      const user = userEvent.setup();
      const twoUsers = [
        { ...initialUsers[0], id: 'u1', username: 'user1', email: 'u1@t.com' },
        { ...initialUsers[0], id: 'u2', username: 'user2', email: 'u2@t.com' },
      ];
      await setupDeletePage(twoUsers);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a subject/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      api.delete.mockResolvedValueOnce({});
      mockApiGet({ users: [] });

      await user.click(screen.getByRole('button', { name: /delete 2 users/i }));

      await waitFor(() => expect(screen.getByText('Deleted 2 users')).toBeInTheDocument());
    });

    it('error toast is shown when bulk delete fails', async () => {
      const user = userEvent.setup();
      const twoUsers = [
        { ...initialUsers[0], id: 'u1', username: 'user1', email: 'u1@t.com' },
        { ...initialUsers[0], id: 'u2', username: 'user2', email: 'u2@t.com' },
      ];
      await setupDeletePage(twoUsers);

      await user.click(screen.getByRole('checkbox', { name: /select all users without a subject/i }));
      await user.click(screen.getByRole('button', { name: /delete \(2\)/i }));

      api.delete.mockRejectedValue({ response: { data: { error: 'Bulk user delete failed' } } });

      await user.click(screen.getByRole('button', { name: /delete 2 users/i }));

      await waitFor(() => expect(screen.getByText('Bulk user delete failed')).toBeInTheDocument());
    });
  });

  describe('data freshness on navigation and tab visibility', () => {
    it('re-fetches data when the browser tab becomes visible', async () => {
      const staleUser = { ...initialUsers[0], subjects: [] };
      const freshUser = { ...initialUsers[0], subjects: [SUBJECT_A], memberships: [MEMBERSHIP_1] };

      await renderPage({ users: [staleUser] });
      expect(screen.getByText('—')).toBeInTheDocument();

      // Simulate another tab enrolling the user, then this tab regaining focus
      mockApiGet({ users: [freshUser] });

      Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      await waitFor(() => expect(screen.getByTitle('Subject A › Assignment 1 › Group 1')).toBeInTheDocument());
    });

    it('does not re-fetch when the tab becomes hidden', async () => {
      await renderPage();

      const callsBefore = api.get.mock.calls.length;

      Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(api.get.mock.calls.length).toBe(callsBefore);
    });
  });
});
