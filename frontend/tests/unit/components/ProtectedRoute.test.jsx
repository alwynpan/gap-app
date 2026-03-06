import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../../../src/components/ProtectedRoute.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

function renderRoute(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/secure']}>
      <ProtectedRoute {...props}>
        <div>Secret Content</div>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows loading spinner while auth is loading', () => {
    useAuth.mockReturnValue({
      loading: true,
      isAuthenticated: false,
      isAdmin: false,
      isTeamManager: false,
    });

    const { container } = renderRoute();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      isAdmin: false,
      isTeamManager: false,
    });

    renderRoute();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('redirects non-admin users when admin is required', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: false,
      isTeamManager: true,
    });

    renderRoute({ requireAdmin: true });
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('redirects users without team-manager access when required', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: false,
      isTeamManager: false,
    });

    renderRoute({ requireTeamManager: true });
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('renders children when requirements are met', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      isAdmin: true,
      isTeamManager: true,
    });

    renderRoute({ requireAdmin: true, requireTeamManager: true });
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });
});
