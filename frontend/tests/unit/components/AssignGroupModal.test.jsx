import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import AssignGroupModal from '../../../src/components/AssignGroupModal.jsx';

jest.mock('@/utils/api');

const subjectA = { id: 's0000000-0000-0000-0000-000000000001', name: 'Subject A' };
const subjectB = { id: 's0000000-0000-0000-0000-000000000002', name: 'Subject B' };

const assignmentWithMembership = { id: 'a0000000-0000-0000-0000-000000000001', name: 'Assignment 1', group_count: 2 };
const assignmentWithoutMembership = {
  id: 'a0000000-0000-0000-0000-000000000002',
  name: 'Assignment 2',
  group_count: 1,
};

const groups = [
  { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group 1', enabled: true, max_members: 5, member_count: 2 },
];

const baseUser = {
  id: 'u0000000-0000-0000-0000-000000000001',
  username: 'alice',
  memberships: [{ assignment_id: assignmentWithMembership.id, group_id: groups[0].id }],
  subjects: [subjectA],
};

const defaultProps = {
  user: baseUser,
  subjects: [subjectA, subjectB],
  onClose: jest.fn(),
  onAssigned: jest.fn(),
};

function renderModal(overrides = {}) {
  return render(<AssignGroupModal {...defaultProps} {...overrides} />);
}

async function selectCascade(user, assignmentName = 'Assignment 1') {
  await user.selectOptions(screen.getByLabelText('Subject'), subjectA.id);
  await waitFor(() => {
    expect(screen.getByRole('option', { name: assignmentName })).toBeInTheDocument();
  });
  const assignment = assignmentName === 'Assignment 1' ? assignmentWithMembership : assignmentWithoutMembership;
  await user.selectOptions(screen.getByLabelText('Assignment'), assignment.id);
}

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes('/subjects/')) {
      return Promise.resolve({
        data: { subject: subjectA, assignments: [assignmentWithMembership, assignmentWithoutMembership] },
      });
    }
    if (url.includes('/groups')) {
      return Promise.resolve({ data: { groups } });
    }
    return Promise.reject(new Error(`Unexpected url: ${url}`));
  });
  api.put.mockResolvedValue({ data: {} });
});

describe('AssignGroupModal', () => {
  it('renders the title with the username', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Assign Group — alice' })).toBeInTheDocument();
  });

  it("offers only the target user's subjects", () => {
    renderModal();
    expect(screen.getByRole('option', { name: 'Subject A' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Subject B' })).not.toBeInTheDocument();
  });

  it('falls back to the subjects prop filtered by membership subject ids when user.subjects is missing', () => {
    renderModal({
      user: {
        ...baseUser,
        subjects: undefined,
        memberships: [{ assignment_id: assignmentWithMembership.id, group_id: groups[0].id, subject_id: subjectA.id }],
      },
    });
    expect(screen.getByRole('option', { name: 'Subject A' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Subject B' })).not.toBeInTheDocument();
  });

  it('disables Assign until subject, assignment, and group are all chosen', async () => {
    const user = userEvent.setup();
    renderModal();
    const assignButton = screen.getByRole('button', { name: 'Assign' });
    expect(assignButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Subject'), subjectA.id);
    expect(assignButton).toBeDisabled();

    await selectCascade(user);
    expect(assignButton).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Group'), groups[0].id);
    expect(assignButton).toBeEnabled();
  });

  it('PUTs the correct body on assign and calls onAssigned and onClose', async () => {
    const user = userEvent.setup();
    renderModal();
    await selectCascade(user);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Group'), groups[0].id);
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/group$/),
        {
          assignmentId: assignmentWithMembership.id,
          groupId: groups[0].id,
        }
      );
    });
    expect(defaultProps.onAssigned).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Remove from group only when a membership exists for the selected assignment', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.queryByRole('button', { name: 'Remove from group' })).not.toBeInTheDocument();

    await selectCascade(user, 'Assignment 1');
    expect(screen.getByRole('button', { name: 'Remove from group' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Assignment'), assignmentWithoutMembership.id);
    expect(screen.queryByRole('button', { name: 'Remove from group' })).not.toBeInTheDocument();
  });

  it('PUTs groupId null on remove and calls onAssigned and onClose', async () => {
    const user = userEvent.setup();
    renderModal();
    await selectCascade(user, 'Assignment 1');
    await user.click(screen.getByRole('button', { name: 'Remove from group' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/group$/),
        {
          assignmentId: assignmentWithMembership.id,
          groupId: null,
        }
      );
    });
    expect(defaultProps.onAssigned).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the API error on 403 and keeps the modal open', async () => {
    const user = userEvent.setup();
    api.put.mockRejectedValue({ response: { status: 403, data: { error: 'Forbidden' } } });
    renderModal();
    await selectCascade(user);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Group'), groups[0].id);
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument();
    });
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(defaultProps.onAssigned).not.toHaveBeenCalled();
  });

  it('shows "Group is full" on 409', async () => {
    const user = userEvent.setup();
    api.put.mockRejectedValue({ response: { status: 409, data: { error: 'Group is full' } } });
    renderModal();
    await selectCascade(user);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Group'), groups[0].id);
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => {
      expect(screen.getByText('Group is full')).toBeInTheDocument();
    });
  });

  it('shows a fallback message when the error response has no error field', async () => {
    const user = userEvent.setup();
    api.put.mockRejectedValue(new Error('network'));
    renderModal();
    await selectCascade(user);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Group'), groups[0].id);
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to update group')).toBeInTheDocument();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
