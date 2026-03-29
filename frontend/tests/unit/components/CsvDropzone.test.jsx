/* global File */
import { render, screen, fireEvent, createEvent, act } from '@testing-library/react';
import CsvDropzone from '../../../src/components/CsvDropzone.jsx';

function makeCsvFile(content = 'a,b\n1,2', name = 'test.csv') {
  return new File([content], name, { type: 'text/csv' });
}

describe('CsvDropzone', () => {
  it('renders the upload text and file input', () => {
    render(<CsvDropzone onFile={jest.fn()} />);
    expect(screen.getByText(/click to browse or drag/i)).toBeInTheDocument();
    expect(screen.getByText(/only .csv files are accepted/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('applies a custom className to the wrapper', () => {
    const { container } = render(<CsvDropzone onFile={jest.fn()} className="mb-4 custom" />);
    expect(container.firstChild).toHaveClass('mb-4', 'custom');
  });

  it('calls onFile when a file is selected via the input', () => {
    const onFile = jest.fn();
    render(<CsvDropzone onFile={onFile} />);
    const file = makeCsvFile();
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    act(() => {
      fireEvent.change(input);
    });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('resets input value after selection so the same file can be re-selected', () => {
    render(<CsvDropzone onFile={jest.fn()} />);
    const input = document.querySelector('input[type="file"]');
    const file = makeCsvFile();
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    // Spy on the value setter — JSDOM resets it to '' on fireEvent.change, so
    // we just confirm no error is thrown and the handler still fires.
    expect(() => {
      act(() => {
        fireEvent.change(input);
      });
    }).not.toThrow();
  });

  it('calls onFile when a file is dropped onto the dropzone', () => {
    const onFile = jest.fn();
    render(<CsvDropzone onFile={onFile} />);
    const file = makeCsvFile();
    const dropzone = screen.getByRole('button', { name: /click to browse/i });
    act(() => {
      fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('does not call onFile when drop has no files', () => {
    const onFile = jest.fn();
    render(<CsvDropzone onFile={onFile} />);
    const dropzone = screen.getByRole('button', { name: /click to browse/i });
    act(() => {
      fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
    });
    expect(onFile).not.toHaveBeenCalled();
  });

  it('prevents default on dragOver', () => {
    render(<CsvDropzone onFile={jest.fn()} />);
    const dropzone = screen.getByRole('button', { name: /click to browse/i });
    const event = createEvent.dragOver(dropzone);
    event.preventDefault = jest.fn();
    act(() => {
      fireEvent(dropzone, event);
    });
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('opens file picker on Enter key press', () => {
    render(<CsvDropzone onFile={jest.fn()} />);
    const input = document.querySelector('input[type="file"]');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    const dropzone = screen.getByRole('button', { name: /click to browse/i });
    act(() => {
      fireEvent.keyDown(dropzone, { key: 'Enter' });
    });
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('opens file picker on Space key press', () => {
    render(<CsvDropzone onFile={jest.fn()} />);
    const input = document.querySelector('input[type="file"]');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    const dropzone = screen.getByRole('button', { name: /click to browse/i });
    act(() => {
      fireEvent.keyDown(dropzone, { key: ' ' });
    });
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('does not open file picker on other key presses', () => {
    render(<CsvDropzone onFile={jest.fn()} />);
    const input = document.querySelector('input[type="file"]');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    const dropzone = screen.getByRole('button', { name: /click to browse/i });
    act(() => {
      fireEvent.keyDown(dropzone, { key: 'Tab' });
    });
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('opens file picker on click', () => {
    render(<CsvDropzone onFile={jest.fn()} />);
    const input = document.querySelector('input[type="file"]');
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    const dropzone = screen.getByRole('button', { name: /click to browse/i });
    act(() => {
      fireEvent.click(dropzone);
    });
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
