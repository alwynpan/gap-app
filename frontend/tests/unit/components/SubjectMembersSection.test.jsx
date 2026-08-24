import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import SubjectMembersSection from '../../../src/components/SubjectMembersSection.jsx';

jest.mock('@/utils/api');

const SUBJECT = { id: '11111111-1111-4111-8111-111111111111', name: 'Mathematics' };
const OTHER_SUBJECT = { id: '22222222-2222-4222-8222-222222222222', name: 'Physics' };

const SUSPEND_WARNING =
  'Suspending removes their group memberships in this subject. Re-enabling will NOT restore groups.';

const makeMember = (overrides = {}) => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  username: 'u1',
  email: 'u1@test.com',
  first_name: 'First',
  last_name: 'Last',
  student_id: 's1',
  enabled: true,
  status: 'active',
  role_name: 'user',
  membership_enabled: true,
  ...overrides,
});

/** URL router mock: subject members endpoint plus the admin GET /users list. */
const mockApiGet = ({ members = [makeMember()], allUsers = [], assignments = [] } = {}) => {
  api.get.mockImplementation((url) => {
    if (/\/subjects\/[^/]+\/users$/.test(url)) {
      return Promise.resolve({ data: { users: members } });
    }
    if (/\/subjects\/[^/]+$/.test(url)) {
      return Promise.resolve({ data: { subject: SUBJECT, assignments } });
    }
    if (/\/users$/.test(url)) {
      return Promise.resolve({ data: { users: allUsers } });
    }
    return Promise.reject(new Error(`Unexpected url: ${url}`));
  });
};

const renderSection = async ({
  members,
  allUsers,
  assignments,
  subject = SUBJECT,
  isAdmin = true,
  canManage = true,
} = {}) => {
  mockApiGet({ members, allUsers, assignments });
  const view = render(<SubjectMembersSection subject={subject} isAdmin={isAdmin} canManage={canManage} />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument());
  await waitFor(() => expect(view.container.querySelector('.animate-spin')).not.toBeInTheDocument());
  return view;
};

describe('SubjectMembersSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Fetch / loading / error / empty ─────────────────────────────────────
  describe('fetching members', () => {
    it('shows a loading spinner before data resolves', () => {
      api.get.mockImplementation(() => new Promise(() => {}));
      const { container } = render(<SubjectMembersSection subject={SUBJECT} isAdmin canManage />);

      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
      expect(screen.queryByText('u1')).not.toBeInTheDocument();
    });

    it('fetches members for the subject and renders name, username, email and status', async () => {
      await renderSection();

      expect(api.get).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT.id}/users`));
      expect(screen.getByText('First Last')).toBeInTheDocument();
      expect(screen.getByText('u1')).toBeInTheDocument();
      expect(screen.getByText('u1@test.com')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('refetches when the subject changes', async () => {
      const { rerender } = await renderSection();

      rerender(<SubjectMembersSection subject={OTHER_SUBJECT} isAdmin canManage />);

      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${OTHER_SUBJECT.id}/users`))
      );
    });

    it('shows the server error when the fetch fails with a message', async () => {
      api.get.mockRejectedValue({ response: { data: { error: 'Not authorized for this subject' } } });
      render(<SubjectMembersSection subject={SUBJECT} isAdmin canManage />);

      await waitFor(() => expect(screen.getByText('Not authorized for this subject')).toBeInTheDocument());
    });

    it('shows a generic error banner when the fetch fails without a message', async () => {
      api.get.mockRejectedValue(new Error('network'));
      render(<SubjectMembersSection subject={SUBJECT} isAdmin canManage />);

      await waitFor(() => expect(screen.getByText('Failed to load members')).toBeInTheDocument());
    });

    it('shows an empty state when the subject has no members', async () => {
      await renderSection({ members: [] });

      expect(screen.getByText('No members yet')).toBeInTheDocument();
    });
  });

  // ── Status badges ────────────────────────────────────────────────────────
  describe('status badges', () => {
    it('renders a yellow Pending badge for pending members', async () => {
      await renderSection({ members: [makeMember({ status: 'pending' })] });

      const badge = screen.getByText('Pending');
      expect(badge.className).toContain('bg-yellow-100');
    });

    it('renders a green Active badge for active members', async () => {
      await renderSection();

      const badge = screen.getByText('Active');
      expect(badge.className).toContain('bg-green-100');
    });

    it('renders a gray Suspended badge when membership_enabled is false', async () => {
      await renderSection({ members: [makeMember({ membership_enabled: false })] });

      const badge = screen.getByText('Suspended');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('does not render a Suspended badge when membership is enabled', async () => {
      await renderSection();

      expect(screen.queryByText('Suspended')).not.toBeInTheDocument();
    });
  });

  // ── Suspend / enable ────────────────────────────────────────────────────
  describe('suspend flow', () => {
    it('opens a confirm modal with the irreversibility warning', async () => {
      const user = userEvent.setup();
      await renderSection();

      await user.click(screen.getByRole('button', { name: 'Suspend Member' }));

      expect(screen.getByText(SUSPEND_WARNING)).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('confirms suspension, PUTs enabled=false, refetches and shows success', async () => {
      const user = userEvent.setup();
      api.put.mockResolvedValue({ data: { message: 'ok', membershipEnabled: false } });
      const member = makeMember();
      await renderSection({ members: [member] });
      const getCallsBefore = api.get.mock.calls.length;

      await user.click(screen.getByRole('button', { name: 'Suspend Member' }));
      await user.click(screen.getByRole('button', { name: 'Suspend' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT.id}/users/${member.id}`), {
          enabled: false,
        });
      });
      await waitFor(() => {
        expect(screen.getByText('Member suspended')).toBeInTheDocument();
        expect(api.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
      });
      expect(screen.queryByText(SUSPEND_WARNING)).not.toBeInTheDocument();
    });

    it('cancels the suspend modal without calling the API', async () => {
      const user = userEvent.setup();
      await renderSection();

      await user.click(screen.getByRole('button', { name: 'Suspend Member' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText(SUSPEND_WARNING)).not.toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('surfaces the API error when suspension fails', async () => {
      const user = userEvent.setup();
      api.put.mockRejectedValue({ response: { data: { error: 'Suspension denied' } } });
      await renderSection();

      await user.click(screen.getByRole('button', { name: 'Suspend Member' }));
      await user.click(screen.getByRole('button', { name: 'Suspend' }));

      await waitFor(() => expect(screen.getByText('Suspension denied')).toBeInTheDocument());
    });

    it('enables a suspended member directly without a modal', async () => {
      const user = userEvent.setup();
      api.put.mockResolvedValue({ data: { message: 'ok', membershipEnabled: true } });
      const member = makeMember({ membership_enabled: false });
      await renderSection({ members: [member] });
      const getCallsBefore = api.get.mock.calls.length;

      await user.click(screen.getByRole('button', { name: 'Enable Member' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT.id}/users/${member.id}`), {
          enabled: true,
        });
      });
      expect(screen.queryByText(SUSPEND_WARNING)).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('Member enabled')).toBeInTheDocument();
        expect(api.get.mock.calls.length).toBeGreaterThan(getCallsBefore);
      });
    });

    it('surfaces the API error when enabling fails', async () => {
      const user = userEvent.setup();
      api.put.mockRejectedValue({ response: { data: { error: 'Enable denied' } } });
      await renderSection({ members: [makeMember({ membership_enabled: false })] });

      await user.click(screen.getByRole('button', { name: 'Enable Member' }));

      await waitFor(() => expect(screen.getByText('Enable denied')).toBeInTheDocument());
    });
  });

  // ── Assign group ─────────────────────────────────────────────────────────
  describe('assign group', () => {
    it('opens AssignGroupModal scoped to this subject', async () => {
      const user = userEvent.setup();
      await renderSection();

      await user.click(screen.getByRole('button', { name: 'Assign Group' }));

      const heading = screen.getByRole('heading', { name: 'Assign Group — u1' });
      const modal = heading.closest('.fixed');
      expect(within(modal).getByRole('option', { name: 'Mathematics' })).toBeInTheDocument();
    });

    it('closes AssignGroupModal on cancel without a PUT', async () => {
      const user = userEvent.setup();
      await renderSection();

      await user.click(screen.getByRole('button', { name: 'Assign Group' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('heading', { name: 'Assign Group — u1' })).not.toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it("passes the member's memberships through so Remove from group is offered for their assignment", async () => {
      const ASSIGNMENT = { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Assignment 1' };
      const member = makeMember({
        memberships: [
          {
            subject_id: SUBJECT.id,
            assignment_id: ASSIGNMENT.id,
            assignment_name: ASSIGNMENT.name,
            group_id: 'cccccccc-0000-4000-8000-000000000001',
            group_name: 'Team Alpha',
          },
        ],
      });
      const user = userEvent.setup();
      await renderSection({ members: [member], assignments: [ASSIGNMENT] });

      await user.click(screen.getByRole('button', { name: 'Assign Group' }));

      // Walk the cascade — the modal offers "Remove from group" only when the
      // user has a membership for the selected assignment.
      await user.selectOptions(await screen.findByLabelText('Subject'), SUBJECT.id);
      await user.selectOptions(await screen.findByLabelText('Assignment'), ASSIGNMENT.id);

      expect(await screen.findByRole('button', { name: /remove from group/i })).toBeInTheDocument();
    });
  });

  // ── Send setup email ─────────────────────────────────────────────────────
  describe('send setup email', () => {
    it('posts the pending member id and shows success', async () => {
      const user = userEvent.setup();
      api.post.mockResolvedValue({ data: { sent: 1, errors: [] } });
      const member = makeMember({ status: 'pending' });
      await renderSection({ members: [member] });

      await user.click(screen.getByRole('button', { name: 'Send Setup Email' }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/users\/send-setup-emails$/), {
          userIds: [member.id],
        });
      });
      await waitFor(() => expect(screen.getByText('Setup email sent')).toBeInTheDocument());
    });

    // The endpoint answers 200 with per-user delivery failures, so a component
    // that only checks the status code would wrongly report success.
    it('reports non-delivery when the request succeeds but nothing was sent', async () => {
      const user = userEvent.setup();
      api.post.mockResolvedValue({
        data: { sent: 0, errors: [{ reason: 'Email not sent: SMTP is not configured' }] },
      });
      await renderSection({ members: [makeMember({ status: 'pending' })] });

      await user.click(await screen.findByRole('button', { name: /send setup email/i }));

      expect(await screen.findByText(/SMTP is not configured/i)).toBeInTheDocument();
      expect(screen.queryByText('Setup email sent')).not.toBeInTheDocument();
    });

    it('hides the setup email action for non-pending members', async () => {
      await renderSection();

      expect(screen.queryByRole('button', { name: 'Send Setup Email' })).not.toBeInTheDocument();
    });

    it('surfaces the API error when sending fails', async () => {
      const user = userEvent.setup();
      api.post.mockRejectedValue({ response: { data: { error: 'Email service down' } } });
      await renderSection({ members: [makeMember({ status: 'pending' })] });

      await user.click(screen.getByRole('button', { name: 'Send Setup Email' }));

      await waitFor(() => expect(screen.getByText('Email service down')).toBeInTheDocument());
    });
  });

  // ── Gating ───────────────────────────────────────────────────────────────
  describe('gating', () => {
    it('hides all row actions and toolbar buttons when canManage is false', async () => {
      await renderSection({
        members: [makeMember({ status: 'pending', membership_enabled: false })],
        isAdmin: false,
        canManage: false,
      });

      expect(screen.getByText('u1')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Suspend Member' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enable Member' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Assign Group' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send Setup Email' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add existing user/i })).not.toBeInTheDocument();
    });

    it('hides row actions for non-user roles even when canManage', async () => {
      await renderSection({
        members: [makeMember({ role_name: 'assignment_manager', status: 'pending' })],
      });

      expect(screen.queryByRole('button', { name: 'Suspend Member' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Assign Group' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send Setup Email' })).not.toBeInTheDocument();
    });

    it('shows Add Existing User for admins only', async () => {
      await renderSection();
      expect(screen.getByRole('button', { name: /add existing user/i })).toBeInTheDocument();
    });

    it('hides Add Existing User for non-admin managers', async () => {
      await renderSection({ isAdmin: false, canManage: true });

      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add existing user/i })).not.toBeInTheDocument();
    });
  });

  // ── Add existing user (admin) ────────────────────────────────────────────
  describe('add existing user', () => {
    const nonMember = makeMember({
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      username: 'newbie',
      email: 'newbie@test.com',
    });
    const managerUser = makeMember({
      id: 'aaaaaaaa-0000-4000-8000-000000000003',
      username: 'mgr',
      email: 'mgr@test.com',
      role_name: 'assignment_manager',
    });

    it('fetches /users and offers only user-role non-members', async () => {
      const user = userEvent.setup();
      await renderSection({ allUsers: [makeMember(), nonMember, managerUser] });

      await user.click(screen.getByRole('button', { name: /add existing user/i }));

      await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/users$/)));
      const select = await screen.findByRole('combobox', { name: 'Select user' });
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
      expect(options).toContain('newbie (newbie@test.com)');
      expect(options.some((o) => o.startsWith('u1 '))).toBe(false);
      expect(options.some((o) => o.startsWith('mgr '))).toBe(false);
    });

    // Adding an enrolled-but-suspended member changes nothing, so the UI must say
    // so rather than claiming success.
    it('reports that the member is suspended instead of claiming success', async () => {
      const user = userEvent.setup();
      const message = '1 user already enrolled but suspended — enable them to restore access.';
      api.post.mockResolvedValue({ data: { added: 0, alreadyEnrolled: 0, suspended: 1, message } });
      await renderSection({ allUsers: [makeMember(), nonMember] });

      await user.click(screen.getByRole('button', { name: /add existing user/i }));
      await user.selectOptions(await screen.findByRole('combobox', { name: 'Select user' }), nonMember.id);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText(/added to subject/i)).not.toBeInTheDocument();
    });

    it('adds the chosen user to the subject, refetches and shows success', async () => {
      const user = userEvent.setup();
      api.post.mockResolvedValue({
        data: { added: 1, alreadyEnrolled: 0, suspended: 0, message: '1 user added to subject.' },
      });
      await renderSection({ allUsers: [makeMember(), nonMember] });
      const memberCallsBefore = api.get.mock.calls.filter((c) => /\/subjects\/[^/]+\/users$/.test(c[0])).length;

      await user.click(screen.getByRole('button', { name: /add existing user/i }));
      await user.selectOptions(await screen.findByRole('combobox', { name: 'Select user' }), nonMember.id);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT.id}/users`), {
          userIds: [nonMember.id],
        });
      });
      await waitFor(() => {
        expect(screen.getByText('1 user added to subject.')).toBeInTheDocument();
        expect(api.get.mock.calls.filter((c) => /\/subjects\/[^/]+\/users$/.test(c[0])).length).toBeGreaterThan(
          memberCallsBefore
        );
      });
      expect(screen.queryByRole('combobox', { name: 'Select user' })).not.toBeInTheDocument();
    });

    it('shows the API error inside the modal and keeps it open when adding fails', async () => {
      const user = userEvent.setup();
      api.post.mockRejectedValue({ response: { data: { error: 'Already enrolled' } } });
      await renderSection({ allUsers: [nonMember] });

      await user.click(screen.getByRole('button', { name: /add existing user/i }));
      await user.selectOptions(await screen.findByRole('combobox', { name: 'Select user' }), nonMember.id);
      await user.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => expect(screen.getByText('Already enrolled')).toBeInTheDocument());
      expect(screen.getByRole('combobox', { name: 'Select user' })).toBeInTheDocument();
    });

    it('cancels the add modal without posting', async () => {
      const user = userEvent.setup();
      await renderSection({ allUsers: [nonMember] });

      await user.click(screen.getByRole('button', { name: /add existing user/i }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('combobox', { name: 'Select user' })).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // ── Create user ──────────────────────────────────────────────────────────
  describe('create user', () => {
    const fillForm = async (user) => {
      await user.type(screen.getByPlaceholderText('Enter username'), 'newuser');
      await user.type(screen.getByPlaceholderText('Enter email'), 'new@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'New');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'User');
    };

    it('creates a user enrolled in this subject, refetches and shows success', async () => {
      const user = userEvent.setup();
      api.post.mockResolvedValue({ data: { message: 'ok', user: {} } });
      await renderSection();
      const memberCallsBefore = api.get.mock.calls.filter((c) => /\/subjects\/[^/]+\/users$/.test(c[0])).length;

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillForm(user);
      await user.type(screen.getByPlaceholderText('Enter student ID'), 'ST42');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringMatching(/\/users$/),
          expect.objectContaining({
            username: 'newuser',
            email: 'new@test.com',
            firstName: 'New',
            lastName: 'User',
            studentId: 'ST42',
            role: 'user',
            subjectIds: [SUBJECT.id],
          })
        );
      });
      await waitFor(() => {
        expect(screen.getByText('User created successfully')).toBeInTheDocument();
        expect(screen.queryByText('Create New User')).not.toBeInTheDocument();
        expect(api.get.mock.calls.filter((c) => /\/subjects\/[^/]+\/users$/.test(c[0])).length).toBeGreaterThan(
          memberCallsBefore
        );
      });
    });

    it('shows a validation error and does not POST for an invalid username', async () => {
      const user = userEvent.setup();
      await renderSection();

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.type(screen.getByPlaceholderText('Enter username'), 'bad user!');
      await user.type(screen.getByPlaceholderText('Enter email'), 'new@test.com');
      await user.type(screen.getByPlaceholderText('Enter first name'), 'New');
      await user.type(screen.getByPlaceholderText('Enter last name'), 'User');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      expect(
        await screen.findByText('Username may only contain letters, numbers, underscores, hyphens, and dots')
      ).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('shows the API error inside the modal and keeps it open when creation fails', async () => {
      const user = userEvent.setup();
      api.post.mockRejectedValue({ response: { data: { error: 'Username already exists' } } });
      await renderSection();

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await fillForm(user);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => expect(screen.getByText('Username already exists')).toBeInTheDocument());
      expect(screen.getByText('Create New User')).toBeInTheDocument();
    });

    it('cancels the create modal without posting', async () => {
      const user = userEvent.setup();
      await renderSection();

      await user.click(screen.getByRole('button', { name: /create user/i }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Create New User')).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
