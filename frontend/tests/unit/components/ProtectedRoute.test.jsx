import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../../../src/components/ProtectedRoute.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

function renderRoute(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/secure']}>
      <Routes>
        <Route
          path="/secure"
          element={
            <ProtectedRoute {...props}>
              <div>Secret Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows loading spinner while auth is loading', () => {
    useAuth.mockReturnValue({
      loading: true,
      isAuthenticated: false,
      isAdmin: false,
      isAssignmentManager: false,
    });

    const { container } = renderRoute();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      isAdmin: false,
      isAssignmentManager: false,
    });

    renderRoute();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('redirects non-admin users to /dashboard when admin is required', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: false,
      isAssignmentManager: true,
    });

    renderRoute({ requireAdmin: true });
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('redirects users without assignment-manager access to /dashboard when required', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: false,
      isAssignmentManager: false,
    });

    renderRoute({ requireAssignmentManager: true });
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('renders children when requirements are met', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: true,
      isAssignmentManager: true,
    });

    renderRoute({ requireAdmin: true, requireAssignmentManager: true });
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });
});
