import { render, screen } from '@testing-library/react';
import App from '../../src/App.jsx';
import { useAuth } from '../../src/context/AuthContext.jsx';

afterEach(() => {
  window.location.hash = '';
  window.history.pushState({}, '', '/');
});

jest.mock('../../src/pages/Login.jsx', () => {
  const MockLogin = () => <div>Login Page</div>;
  MockLogin.displayName = 'MockLogin';
  return MockLogin;
});
jest.mock('../../src/pages/Register.jsx', () => {
  const MockRegister = () => <div>Register Page</div>;
  MockRegister.displayName = 'MockRegister';
  return MockRegister;
});
jest.mock('../../src/pages/Dashboard.jsx', () => {
  const MockDashboard = () => <div>Dashboard Page</div>;
  MockDashboard.displayName = 'MockDashboard';
  return MockDashboard;
});
jest.mock('../../src/pages/Users.jsx', () => {
  const MockUsers = () => <div>Users Page</div>;
  MockUsers.displayName = 'MockUsers';
  return MockUsers;
});
jest.mock('../../src/pages/Groups.jsx', () => {
  const MockGroups = () => <div>Groups Page</div>;
  MockGroups.displayName = 'MockGroups';
  return MockGroups;
});

jest.mock('../../src/context/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: jest.fn(),
}));

describe('App', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      isAdmin: false,
      isAssignmentManager: false,
      user: null,
    });
  });

  it('redirects unauthenticated /dashboard to login', () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders dashboard for authenticated users', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      isAdmin: false,
      isAssignmentManager: false,
      user: { username: 'member', role: 'normal_user' },
    });

    window.history.pushState({}, '', '/dashboard');
    render(<App />);

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('blocks non-admin access to groups route', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      isAdmin: false,
      isAssignmentManager: true,
      user: { username: 'tm', role: 'assignment_manager' },
    });

    window.history.pushState({}, '', '/groups');
    render(<App />);

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('allows admin access to groups route', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      isAdmin: true,
      isAssignmentManager: true,
      user: { username: 'admin', role: 'admin' },
    });

    window.history.pushState({}, '', '/groups');
    render(<App />);

    expect(screen.getByText('Groups Page')).toBeInTheDocument();
  });
});
