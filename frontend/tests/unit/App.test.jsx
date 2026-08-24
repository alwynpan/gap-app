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
jest.mock('../../src/pages/ForgotPassword.jsx', () => {
  const MockForgotPassword = () => <div>Forgot Password Page</div>;
  MockForgotPassword.displayName = 'MockForgotPassword';
  return MockForgotPassword;
});
jest.mock('../../src/pages/SetPassword.jsx', () => {
  const MockSetPassword = () => <div>Set Password Page</div>;
  MockSetPassword.displayName = 'MockSetPassword';
  return MockSetPassword;
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
jest.mock('../../src/pages/ImportUsers.jsx', () => {
  const MockImportUsers = () => <div>Import Users Page</div>;
  MockImportUsers.displayName = 'MockImportUsers';
  return MockImportUsers;
});
jest.mock('../../src/pages/Groups.jsx', () => {
  const MockGroups = () => <div>Groups Page</div>;
  MockGroups.displayName = 'MockGroups';
  return MockGroups;
});
jest.mock('../../src/pages/ImportGroupMappings.jsx', () => {
  const MockImportGroupMappings = () => <div>Import Group Mappings Page</div>;
  MockImportGroupMappings.displayName = 'MockImportGroupMappings';
  return MockImportGroupMappings;
});
jest.mock('../../src/pages/Settings.jsx', () => {
  const MockSettings = () => <div>Settings Page</div>;
  MockSettings.displayName = 'MockSettings';
  return MockSettings;
});
jest.mock('../../src/pages/Subjects.jsx', () => {
  const MockSubjects = () => <div>Subjects Page</div>;
  MockSubjects.displayName = 'MockSubjects';
  return MockSubjects;
});
jest.mock('../../src/pages/SubjectDetail.jsx', () => {
  const MockSubjectDetail = () => <div>Subject Detail Page</div>;
  MockSubjectDetail.displayName = 'MockSubjectDetail';
  return MockSubjectDetail;
});

jest.mock('../../src/context/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: jest.fn(),
}));

const asPlainUser = () => ({
  isAuthenticated: true,
  loading: false,
  isAdmin: false,
  isAssignmentManager: false,
  user: { username: 'member', role: 'user' },
});

const asAssignmentManager = () => ({
  isAuthenticated: true,
  loading: false,
  isAdmin: false,
  isAssignmentManager: true,
  user: { username: 'tm', role: 'assignment_manager' },
});

const asAdmin = () => ({
  isAuthenticated: true,
  loading: false,
  isAdmin: true,
  isAssignmentManager: true,
  user: { username: 'admin', role: 'admin' },
});

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    useAuth.mockReturnValue(asPlainUser());

    window.history.pushState({}, '', '/dashboard');
    render(<App />);

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('redirects authenticated user from /login to /dashboard', () => {
    useAuth.mockReturnValue(asPlainUser());

    window.history.pushState({}, '', '/login');
    render(<App />);

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  // A shared /register link used to hit the catch-all before /auth/config
  // resolved, and the later flag update never restored the route.
  it('holds /register while the registration flag is still loading', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      isAdmin: false,
      isAssignmentManager: false,
      user: null,
      registrationEnabled: false,
      registrationConfigLoading: true,
    });

    window.history.pushState({}, '', '/register');
    render(<App />);

    // Neither the form nor a redirect yet — the route stays mounted
    expect(screen.queryByText('Register Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
  });

  it('renders /register once the flag resolves to enabled', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      isAdmin: false,
      isAssignmentManager: false,
      user: null,
      registrationEnabled: true,
      registrationConfigLoading: false,
    });

    window.history.pushState({}, '', '/register');
    render(<App />);

    expect(screen.getByText('Register Page')).toBeInTheDocument();
  });

  it('redirects /register to login when registration is disabled', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      isAdmin: false,
      isAssignmentManager: false,
      user: null,
      registrationEnabled: false,
      registrationConfigLoading: false,
    });

    window.history.pushState({}, '', '/register');
    render(<App />);

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Register Page')).not.toBeInTheDocument();
  });

  it('redirects authenticated user from /register to /dashboard when registration enabled', () => {
    useAuth.mockReturnValue({ ...asPlainUser(), registrationEnabled: true, registrationConfigLoading: false });

    window.history.pushState({}, '', '/register');
    render(<App />);

    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    expect(screen.queryByText('Register Page')).not.toBeInTheDocument();
  });

  describe('/users admin-only routes', () => {
    it('renders users page for admins', () => {
      useAuth.mockReturnValue(asAdmin());

      window.history.pushState({}, '', '/users');
      render(<App />);

      expect(screen.getByText('Users Page')).toBeInTheDocument();
    });

    it('redirects assignment managers from /users to dashboard', () => {
      useAuth.mockReturnValue(asAssignmentManager());

      window.history.pushState({}, '', '/users');
      render(<App />);

      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
      expect(screen.queryByText('Users Page')).not.toBeInTheDocument();
    });

    it('redirects plain users from /users to dashboard', () => {
      useAuth.mockReturnValue(asPlainUser());

      window.history.pushState({}, '', '/users');
      render(<App />);

      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
      expect(screen.queryByText('Users Page')).not.toBeInTheDocument();
    });

    it('renders import users page for admins', () => {
      useAuth.mockReturnValue(asAdmin());

      window.history.pushState({}, '', '/users/import');
      render(<App />);

      expect(screen.getByText('Import Users Page')).toBeInTheDocument();
    });

    it('redirects assignment managers from /users/import to dashboard', () => {
      useAuth.mockReturnValue(asAssignmentManager());

      window.history.pushState({}, '', '/users/import');
      render(<App />);

      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
      expect(screen.queryByText('Import Users Page')).not.toBeInTheDocument();
    });
  });

  describe('/subjects routes', () => {
    it('renders subjects page for assignment managers', () => {
      useAuth.mockReturnValue(asAssignmentManager());

      window.history.pushState({}, '', '/subjects');
      render(<App />);

      expect(screen.getByText('Subjects Page')).toBeInTheDocument();
    });

    it('renders subjects page for admins', () => {
      useAuth.mockReturnValue(asAdmin());

      window.history.pushState({}, '', '/subjects');
      render(<App />);

      expect(screen.getByText('Subjects Page')).toBeInTheDocument();
    });

    it('blocks plain users from /subjects', () => {
      useAuth.mockReturnValue(asPlainUser());

      window.history.pushState({}, '', '/subjects');
      render(<App />);

      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
      expect(screen.queryByText('Subjects Page')).not.toBeInTheDocument();
    });

    it('renders subject detail page at /subjects/:subjectId for assignment managers', () => {
      useAuth.mockReturnValue(asAssignmentManager());

      window.history.pushState({}, '', '/subjects/11111111-1111-4111-8111-111111111111');
      render(<App />);

      expect(screen.getByText('Subject Detail Page')).toBeInTheDocument();
    });

    it('blocks plain users from /subjects/:subjectId', () => {
      useAuth.mockReturnValue(asPlainUser());

      window.history.pushState({}, '', '/subjects/11111111-1111-4111-8111-111111111111');
      render(<App />);

      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
      expect(screen.queryByText('Subject Detail Page')).not.toBeInTheDocument();
    });

    it('renders groups page at /subjects/:subjectId/assignments/:assignmentId for assignment managers', () => {
      useAuth.mockReturnValue(asAssignmentManager());

      window.history.pushState({}, '', '/subjects/s1/assignments/a1');
      render(<App />);

      expect(screen.getByText('Groups Page')).toBeInTheDocument();
    });

    it('blocks plain users from the assignment groups route', () => {
      useAuth.mockReturnValue(asPlainUser());

      window.history.pushState({}, '', '/subjects/s1/assignments/a1');
      render(<App />);

      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
      expect(screen.queryByText('Groups Page')).not.toBeInTheDocument();
    });
  });

  describe('/groups legacy routes', () => {
    it('redirects /groups to /subjects for assignment managers', () => {
      useAuth.mockReturnValue(asAssignmentManager());

      window.history.pushState({}, '', '/groups');
      render(<App />);

      expect(screen.getByText('Subjects Page')).toBeInTheDocument();
      expect(screen.queryByText('Groups Page')).not.toBeInTheDocument();
    });

    it('redirects /groups to /subjects for admins', () => {
      useAuth.mockReturnValue(asAdmin());

      window.history.pushState({}, '', '/groups');
      render(<App />);

      expect(screen.getByText('Subjects Page')).toBeInTheDocument();
      expect(screen.queryByText('Groups Page')).not.toBeInTheDocument();
    });

    it('keeps /groups/import for assignment managers', () => {
      useAuth.mockReturnValue(asAssignmentManager());

      window.history.pushState({}, '', '/groups/import');
      render(<App />);

      expect(screen.getByText('Import Group Mappings Page')).toBeInTheDocument();
    });
  });
});
