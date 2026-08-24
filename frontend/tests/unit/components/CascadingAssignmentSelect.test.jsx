import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import CascadingAssignmentSelect from '../../../src/components/CascadingAssignmentSelect.jsx';

jest.mock('@/utils/api');

const subjects = [
  { id: 's0000000-0000-0000-0000-000000000001', name: 'Subject A' },
  { id: 's0000000-0000-0000-0000-000000000002', name: 'Subject B' },
];

const assignments = [
  { id: 'a0000000-0000-0000-0000-000000000001', name: 'Assignment 1', group_count: 2 },
  { id: 'a0000000-0000-0000-0000-000000000002', name: 'Assignment 2', group_count: 0 },
];

const groups = [
  { id: 'g0000000-0000-0000-0000-000000000001', name: 'Group 1', enabled: true, max_members: 5, member_count: 2 },
  { id: 'g0000000-0000-0000-0000-000000000002', name: 'Group 2', enabled: true, max_members: null, member_count: 0 },
];

const emptyValue = { subjectId: '', assignmentId: '', groupId: '' };

function renderSelect(props = {}) {
  return render(<CascadingAssignmentSelect subjects={subjects} value={emptyValue} onChange={() => {}} {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url.includes('/subjects/')) {
      return Promise.resolve({ data: { subject: subjects[0], assignments } });
    }
    if (url.includes('/groups')) {
      return Promise.resolve({ data: { groups } });
    }
    return Promise.reject(new Error(`Unexpected url: ${url}`));
  });
});

describe('CascadingAssignmentSelect', () => {
  it('renders subject options from the subjects prop with a placeholder', () => {
    renderSelect();
    const select = screen.getByLabelText('Subject');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Select subject' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Subject A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Subject B' })).toBeInTheDocument();
  });

  it('disables the assignment select before a subject is chosen', () => {
    renderSelect();
    expect(screen.getByLabelText('Assignment')).toBeDisabled();
  });

  it('disables the group select before an assignment is chosen', () => {
    renderSelect();
    expect(screen.getByLabelText('Group')).toBeDisabled();
  });

  it('disables all selects when disabled is true', () => {
    renderSelect({ disabled: true });
    expect(screen.getByLabelText('Subject')).toBeDisabled();
    expect(screen.getByLabelText('Assignment')).toBeDisabled();
    expect(screen.getByLabelText('Group')).toBeDisabled();
  });

  it('hides the group select when showGroup is false', () => {
    renderSelect({ showGroup: false });
    expect(screen.queryByLabelText('Group')).not.toBeInTheDocument();
  });

  it('emits the full next value with children reset when the subject changes', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderSelect({
      value: {
        subjectId: subjects[1].id,
        assignmentId: assignments[0].id,
        groupId: groups[0].id,
      },
      onChange,
    });
    await user.selectOptions(screen.getByLabelText('Subject'), subjects[0].id);
    expect(onChange).toHaveBeenCalledWith({ subjectId: subjects[0].id, assignmentId: '', groupId: '' });
  });

  it('fetches and populates assignments when a subject is selected', async () => {
    renderSelect({ value: { ...emptyValue, subjectId: subjects[0].id } });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/subjects\/s0000000-0000-0000-0000-000000000001$/));
    expect(screen.getByRole('option', { name: 'Assignment 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Select assignment' })).toBeInTheDocument();
    expect(screen.getByLabelText('Assignment')).toBeEnabled();
  });

  it('emits assignment change with groupId reset', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderSelect({
      value: { subjectId: subjects[0].id, assignmentId: '', groupId: '' },
      onChange,
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Assignment'), assignments[0].id);
    expect(onChange).toHaveBeenCalledWith({
      subjectId: subjects[0].id,
      assignmentId: assignments[0].id,
      groupId: '',
    });
  });

  it('fetches and populates groups when an assignment is selected', async () => {
    renderSelect({
      value: { subjectId: subjects[0].id, assignmentId: assignments[0].id, groupId: '' },
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/assignments\/a0000000-0000-0000-0000-000000000001\/groups$/)
    );
    // No max_members -> plain name without count suffix
    expect(screen.getByRole('option', { name: 'Group 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Select group' })).toBeInTheDocument();
  });

  it('emits group change preserving subject and assignment', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderSelect({
      value: { subjectId: subjects[0].id, assignmentId: assignments[0].id, groupId: '' },
      onChange,
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Group 1 (2/5)' })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Group'), groups[0].id);
    expect(onChange).toHaveBeenCalledWith({
      subjectId: subjects[0].id,
      assignmentId: assignments[0].id,
      groupId: groups[0].id,
    });
  });

  it('does not fetch groups when showGroup is false', async () => {
    renderSelect({
      value: { subjectId: subjects[0].id, assignmentId: assignments[0].id, groupId: '' },
      showGroup: false,
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument();
    });
    expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/assignments\/.+\/groups$/));
  });

  it('shows an error and leaves the assignment select empty when the fetch fails', async () => {
    api.get.mockRejectedValue(new Error('network'));
    renderSelect({ value: { ...emptyValue, subjectId: subjects[0].id } });
    await waitFor(() => {
      expect(screen.getByText('Failed to load options')).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: 'Assignment 1' })).not.toBeInTheDocument();
  });

  it('does not refetch a cached subject (one api call per subject id)', async () => {
    const { rerender } = renderSelect({ value: { ...emptyValue, subjectId: subjects[0].id } });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    // Switch away then back to the same subject
    rerender(
      <CascadingAssignmentSelect
        subjects={subjects}
        value={{ ...emptyValue, subjectId: subjects[1].id }}
        onChange={() => {}}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    rerender(
      <CascadingAssignmentSelect
        subjects={subjects}
        value={{ ...emptyValue, subjectId: subjects[0].id }}
        onChange={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Assignment 1' })).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('uses custom labels when provided', () => {
    renderSelect({ labels: { subject: 'Course' } });
    expect(screen.getByLabelText('Course')).toBeInTheDocument();
  });
});
