import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../../src/components/ErrorBoundary.jsx';
import { logger } from '../../../src/utils/logger.js';

function ThrowingComponent({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Safe content</div>;
}

// Suppress the expected React error output during these tests.
// jest.restoreAllMocks() in setup.js afterEach handles restoration.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Safe content')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
  });

  it('shows a refresh button in the fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();
  });

  it('calls the onReset prop when the refresh button is clicked', () => {
    const onReset = jest.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('resets error state after onReset so children render again on next render', () => {
    const onReset = jest.fn();

    // 1. Render with a throwing child — boundary enters error state
    const { rerender } = render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();

    // 2. Swap to a safe child while boundary is still in error state
    rerender(
      <ErrorBoundary onReset={onReset}>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    // Still showing fallback — hasError hasn't been cleared yet
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();

    // 3. Click reset — clears hasError, safe child renders normally
    fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));
    expect(screen.queryByRole('heading', { name: /something went wrong/i })).not.toBeInTheDocument();
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('logs the error via componentDidCatch', () => {
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error caught by ErrorBoundary',
      expect.objectContaining({ message: 'Test error' })
    );
  });

  it('logs a normalized message when a non-Error value is thrown', () => {
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    function ThrowingString() {
      throw 'raw string error';
    }

    render(
      <ErrorBoundary>
        <ThrowingString />
      </ErrorBoundary>
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error caught by ErrorBoundary',
      expect.objectContaining({ message: 'raw string error' })
    );
  });
});
