import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IndeterminateCheckbox from '../../../src/components/IndeterminateCheckbox.jsx';

describe('IndeterminateCheckbox', () => {
  it('sets the DOM indeterminate property when indeterminate={true}', () => {
    render(<IndeterminateCheckbox indeterminate={true} checked={false} onChange={() => {}} aria-label="select" />);
    const input = screen.getByRole('checkbox');
    expect(input.indeterminate).toBe(true);
  });

  it('leaves indeterminate false when indeterminate={false}', () => {
    render(<IndeterminateCheckbox indeterminate={false} checked={false} onChange={() => {}} aria-label="select" />);
    const input = screen.getByRole('checkbox');
    expect(input.indeterminate).toBe(false);
  });

  it('defaults indeterminate to false when the prop is omitted (nullish fallback)', () => {
    render(<IndeterminateCheckbox checked={false} onChange={() => {}} aria-label="select" />);
    const input = screen.getByRole('checkbox');
    expect(input.indeterminate).toBe(false);
  });

  it('maps the checked prop to the input checked state', () => {
    render(<IndeterminateCheckbox checked={true} indeterminate={false} onChange={() => {}} aria-label="select" />);
    const input = screen.getByRole('checkbox');
    expect(input.checked).toBe(true);
  });

  it('reflects an unchecked checked prop', () => {
    render(<IndeterminateCheckbox checked={false} indeterminate={false} onChange={() => {}} aria-label="select" />);
    const input = screen.getByRole('checkbox');
    expect(input.checked).toBe(false);
  });

  it('fires onChange when toggled', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<IndeterminateCheckbox checked={false} indeterminate={false} onChange={handleChange} aria-label="select" />);
    await user.click(screen.getByRole('checkbox'));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('forwards aria-label and className to the input', () => {
    render(
      <IndeterminateCheckbox
        checked={false}
        indeterminate={false}
        onChange={() => {}}
        aria-label="Select all rows"
        className="custom-checkbox"
      />
    );
    const input = screen.getByRole('checkbox', { name: /select all rows/i });
    expect(input).toHaveClass('custom-checkbox');
  });

  it('updates the DOM indeterminate property when the prop changes true to false', () => {
    const { rerender } = render(
      <IndeterminateCheckbox indeterminate={true} checked={false} onChange={() => {}} aria-label="select" />
    );
    const input = screen.getByRole('checkbox');
    expect(input.indeterminate).toBe(true);

    rerender(<IndeterminateCheckbox indeterminate={false} checked={false} onChange={() => {}} aria-label="select" />);
    expect(input.indeterminate).toBe(false);
  });

  it('updates the DOM indeterminate property when the prop changes false to true', () => {
    const { rerender } = render(
      <IndeterminateCheckbox indeterminate={false} checked={false} onChange={() => {}} aria-label="select" />
    );
    const input = screen.getByRole('checkbox');
    expect(input.indeterminate).toBe(false);

    rerender(<IndeterminateCheckbox indeterminate={true} checked={false} onChange={() => {}} aria-label="select" />);
    expect(input.indeterminate).toBe(true);
  });
});
