import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../../../src/components/Modal.jsx';

describe('Modal', () => {
  const renderModal = ({ onClose = jest.fn(), closeOnBackdrop, children } = {}) => {
    const utils = render(
      <Modal title="Delete Subject" onClose={onClose} closeOnBackdrop={closeOnBackdrop}>
        {children ?? (
          <>
            <input aria-label="First field" />
            <button type="button">Confirm</button>
          </>
        )}
      </Modal>
    );
    return { onClose, ...utils };
  };

  it('exposes itself as a modal dialog named by its title', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Delete Subject');
    expect(screen.getByRole('heading', { name: 'Delete Subject' })).toBeInTheDocument();
  });

  it('moves focus to the first focusable control on open', () => {
    renderModal();

    expect(screen.getByLabelText('First field')).toHaveFocus();
  });

  it('focuses the panel itself when it holds no focusable control', () => {
    renderModal({ children: <p>Nothing to do here</p> });

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    renderModal();

    const field = screen.getByLabelText('First field');
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(field).toHaveFocus();

    await user.tab();
    expect(confirm).toHaveFocus();
    // Past the last control, focus wraps to the first rather than escaping
    await user.tab();
    expect(field).toHaveFocus();
  });

  it('wraps backwards on Shift+Tab from the first control', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
  });

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // The backdrop is the dialog's parent overlay
    await user.click(screen.getByRole('dialog').parentElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a click inside the panel', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores backdrop clicks when closeOnBackdrop is false', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ closeOnBackdrop: false });

    await user.click(screen.getByRole('dialog').parentElement);

    expect(onClose).not.toHaveBeenCalled();
    // Escape still works, so the dialog is never a trap
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the trigger when it unmounts', async () => {
    const user = userEvent.setup();
    render(<button type="button">Open dialog</button>);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);
    expect(trigger).toHaveFocus();

    const { unmount } = render(
      <Modal title="Delete Subject" onClose={jest.fn()}>
        <input aria-label="First field" />
      </Modal>
    );
    expect(screen.getByLabelText('First field')).toHaveFocus();

    unmount();

    expect(trigger).toHaveFocus();
  });
});
