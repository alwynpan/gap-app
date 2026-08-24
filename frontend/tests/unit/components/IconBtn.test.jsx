import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconBtn from '../../../src/components/IconBtn.jsx';

describe('IconBtn', () => {
  it('renders a button with the label as aria-label', () => {
    render(
      <IconBtn onClick={() => {}} label="Delete group" className="text-red-600">
        <span>icon</span>
      </IconBtn>
    );
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeInTheDocument();
  });

  it('renders its children inside the button', () => {
    render(
      <IconBtn onClick={() => {}} label="Edit" className="">
        <span data-testid="icon-child">icon</span>
      </IconBtn>
    );
    const button = screen.getByRole('button', { name: 'Edit' });
    expect(button).toContainElement(screen.getByTestId('icon-child'));
  });

  it('renders the label text in a tooltip span', () => {
    render(
      <IconBtn onClick={() => {}} label="Set limit" className="">
        <span>icon</span>
      </IconBtn>
    );
    // Label appears twice: once as aria-label, once as visible tooltip text
    expect(screen.getByText('Set limit')).toBeInTheDocument();
  });

  it('appends the className prop to the button classes', () => {
    render(
      <IconBtn onClick={() => {}} label="Disable" className="text-gray-400 hover:bg-gray-100">
        <span>icon</span>
      </IconBtn>
    );
    const button = screen.getByRole('button', { name: 'Disable' });
    expect(button).toHaveClass('text-gray-400');
    expect(button).toHaveClass('hover:bg-gray-100');
    expect(button).toHaveClass('p-1.5');
  });

  it('has type="button" so it never submits forms', () => {
    render(
      <IconBtn onClick={() => {}} label="Remove" className="">
        <span>icon</span>
      </IconBtn>
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveAttribute('type', 'button');
  });

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(
      <IconBtn onClick={handleClick} label="Delete" className="">
        <span>icon</span>
      </IconBtn>
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick without a click', () => {
    const handleClick = jest.fn();
    render(
      <IconBtn onClick={handleClick} label="Delete" className="">
        <span>icon</span>
      </IconBtn>
    );
    expect(handleClick).not.toHaveBeenCalled();
  });
});
