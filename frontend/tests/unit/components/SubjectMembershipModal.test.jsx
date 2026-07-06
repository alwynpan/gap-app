import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import SubjectMembershipModal from '../../../src/components/SubjectMembershipModal.jsx';

jest.mock('@/utils/api');

const SUBJECT_A = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Subject A' };
const SUBJECT_B = { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Subject B' };
const SUBJECT_C = { id: 'aaaaaaaa-0000-4000-8000-000000000003', name: 'Subject C' };

const MEMBERSHIP_A = {
  assignment_id: 'bbbbbbbb-0000-4000-8000-000000000001',
  assignment_name: 'Assignment 1',
  subject_id: SUBJECT_A.id,
  subject_name: 'Subject A',
  group_id: 'cccccccc-0000-4000-8000-000000000001',
  group_name: 'Group 1',
};

const baseUser = {
  id: 'u0000000-0000-0000-0000-000000000001',
  username: 'alice',
  subjects: [SUBJECT_A],
  memberships: [MEMBERSHIP_A],
};

const defaultProps = {
  user: baseUser,
  subjects: [SUBJECT_A, SUBJECT_B, SUBJECT_C],
  onClose: jest.fn(),
  onChanged: jest.fn(),
};

function renderModal(overrides = {}) {
  return render(<SubjectMembershipModal {...defaultProps} {...overrides} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  api.post.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});

describe('SubjectMembershipModal', () => {
  it('renders the title with the username', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Manage Subjects — alice' })).toBeInTheDocument();
  });

  it('renders a checkbox for every subject, pre-checked for current memberships', () => {
    renderModal();
    expect(screen.getByRole('checkbox', { name: 'Subject A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Subject B' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Subject C' })).not.toBeChecked();
  });

  it('toggles checkboxes on click', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
    expect(screen.getByRole('checkbox', { name: 'Subject B' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
    expect(screen.getByRole('checkbox', { name: 'Subject A' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
    expect(screen.getByRole('checkbox', { name: 'Subject A' })).toBeChecked();
  });

  it('saves the diff: POST for additions and DELETE for removals', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
    await user.click(screen.getByRole('checkbox', { name: 'Subject C' }));
    await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT_B.id}/users`), {
        userIds: [baseUser.id],
      });
    });
    expect(api.post).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT_C.id}/users`), {
      userIds: [baseUser.id],
    });
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.delete).toHaveBeenCalledWith(expect.stringContaining(`/subjects/${SUBJECT_A.id}/users/${baseUser.id}`));
    expect(api.delete).toHaveBeenCalledTimes(1);
  });

  it('calls onChanged then onClose on successful save', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(defaultProps.onChanged).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a warning before saving when a removed subject contains group memberships', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.queryByText(/removing a subject also removes/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
    expect(
      screen.getByText(/removing a subject also removes the user's group memberships in it\./i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
    expect(screen.queryByText(/removing a subject also removes/i)).not.toBeInTheDocument();
  });

  it('does not warn when removing a subject with no memberships in it', async () => {
    const user = userEvent.setup();
    renderModal({
      user: { ...baseUser, subjects: [SUBJECT_B], memberships: [] },
    });

    await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
    expect(screen.queryByText(/removing a subject also removes/i)).not.toBeInTheDocument();
  });

  it('shows the API error and stays open when a save call fails', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue({ response: { data: { error: 'Enrolment failed' } } });
    renderModal();

    await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Enrolment failed')).toBeInTheDocument();
    });
    expect(defaultProps.onChanged).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Manage Subjects — alice' })).toBeInTheDocument();
  });

  it('shows a fallback error message when the failure has no error field', async () => {
    const user = userEvent.setup();
    api.delete.mockRejectedValue(new Error('network'));
    renderModal();

    await user.click(screen.getByRole('checkbox', { name: 'Subject A' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to update subjects')).toBeInTheDocument();
    });
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('saving with no changes makes no API calls and just closes', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(defaultProps.onChanged).not.toHaveBeenCalled();
  });

  it('cancel calls onClose without any API calls', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('checkbox', { name: 'Subject B' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
