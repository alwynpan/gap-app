import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TypedDeleteConfirmModal from '../../../src/components/TypedDeleteConfirmModal.jsx';

const defaultProps = {
  entityLabel: 'Subject',
  entityName: 'Subject A',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

function renderModal(overrides = {}) {
  return render(<TypedDeleteConfirmModal {...defaultProps} {...overrides} />);
}

async function advanceToStepTwo(user) {
  await user.type(screen.getByLabelText('Confirmation name'), 'Subject A');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TypedDeleteConfirmModal', () => {
  describe('step 1 — typed entity name gate', () => {
    it('renders the heading with the entity label', () => {
      renderModal();
      expect(screen.getByRole('heading', { name: 'Delete Subject' })).toBeInTheDocument();
    });

    it('disables Continue initially', () => {
      renderModal();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('keeps Continue disabled on partial input', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText('Confirmation name'), 'Subj');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('keeps Continue disabled on case-mismatched input', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText('Confirmation name'), 'subject a');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('keeps Continue disabled on padded input (no trimming)', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText('Confirmation name'), ' Subject A');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });

    it('enables Continue on an exact match', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText('Confirmation name'), 'Subject A');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    it('does not call onConfirm from step 1', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      expect(defaultProps.onConfirm).not.toHaveBeenCalled();
    });

    it('renders the warning node in a yellow box when provided', () => {
      renderModal({ warning: <p>3 assignments will be deleted</p> });
      expect(screen.getByText('3 assignments will be deleted')).toBeInTheDocument();
    });

    it('does not render a warning box when warning is null', () => {
      renderModal();
      expect(screen.queryByText('3 assignments will be deleted')).not.toBeInTheDocument();
    });

    it('calls onCancel when Cancel is clicked at step 1', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('step 2 — typed delete gate', () => {
    it('clears the input when advancing to step 2', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      expect(screen.getByLabelText('Confirmation word')).toHaveValue('');
    });

    it('disables Delete when the input is empty', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });

    it('keeps Delete disabled on "Delete" (wrong case)', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      await user.type(screen.getByLabelText('Confirmation word'), 'Delete');
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });

    it('keeps Delete disabled on partial input "del"', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      await user.type(screen.getByLabelText('Confirmation word'), 'del');
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });

    it('enables Delete on exactly "delete"', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    });

    it('calls onConfirm exactly once after completing both steps', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Cancel is clicked at step 2', async () => {
      const user = userEvent.setup();
      renderModal();
      await advanceToStepTwo(user);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
      expect(defaultProps.onConfirm).not.toHaveBeenCalled();
    });

    it('disables the Delete button and shows "Deleting..." while deleting', async () => {
      const user = userEvent.setup();
      const { rerender } = renderModal();
      await advanceToStepTwo(user);
      await user.type(screen.getByLabelText('Confirmation word'), 'delete');
      rerender(<TypedDeleteConfirmModal {...defaultProps} deleting={true} />);
      const deleteButton = screen.getByRole('button', { name: 'Deleting...' });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe('remount behaviour', () => {
    it('resets to step 1 with an empty input on remount', async () => {
      const user = userEvent.setup();
      const { unmount } = renderModal();
      await advanceToStepTwo(user);
      unmount();
      renderModal();
      const input = screen.getByLabelText('Confirmation name');
      expect(input).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });
  });
});
