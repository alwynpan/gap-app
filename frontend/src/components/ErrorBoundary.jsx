import { Component } from 'react';
import { logger } from '../utils/logger.js';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const isError = error instanceof Error;
    const message = isError ? error.message : String(error);
    logger.error('Unhandled error caught by ErrorBoundary', {
      name: isError ? error.name : undefined,
      message,
      stack: isError ? error.stack : undefined,
      componentStack: info?.componentStack,
    });
  }

  handleReload() {
    if (typeof this.props.onReset === 'function') {
      this.setState({ hasError: false }, () => this.props.onReset());
    } else {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md px-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">An unexpected error occurred. Please try refreshing the page.</p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
