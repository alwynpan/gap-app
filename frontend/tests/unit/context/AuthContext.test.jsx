import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import { AuthProvider, useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('@/utils/api');

// tests/setup.js mocks localStorage but not sessionStorage — mock it the same way here
const sessionStorageMock = (() => {
  let store = {};

  return {
    getItem: jest.fn((key) => store[key] ?? null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  configurable: true,
});

beforeEach(() => {
  sessionStorageMock.clear();
});

function TestHarness() {
  const {
    user,
    loading,
    token,
    isAuthenticated,
    isAdmin,
    isAssignmentManager,
    login,
    register,
    logout,
    refreshUser,
    registrationEnabled,
    memberships,
    managedAssignmentIds,
    currentSubjectId,
    setCurrentSubject,
  } = useAuth();

  const handleLogin = async () => {
    const result = await login('demo', 'password');
    window.__authResult = result;
  };

  const handleRegister = async () => {
    const result = await register('demo', 'demo@example.com', 'password123', { studentId: 's1234' });
    window.__authResult = result;
  };

  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="auth">{isAuthenticated ? 'yes' : 'no'}</div>
      <div data-testid="token">{token ?? 'none'}</div>
      <div data-testid="user">{user?.username ?? 'none'}</div>
      <div data-testid="is-admin">{isAdmin ? 'yes' : 'no'}</div>
      <div data-testid="is-assignment-manager">{isAssignmentManager ? 'yes' : 'no'}</div>
      <div data-testid="registration-enabled">{registrationEnabled ? 'yes' : 'no'}</div>
      <div data-testid="memberships-count">{memberships.length}</div>
      <div data-testid="membership-groups">{memberships.map((m) => m.group_name).join(',') || 'none'}</div>
      <div data-testid="managed-assignment-ids">{managedAssignmentIds.join(',') || 'none'}</div>
      <div data-testid="current-subject">{currentSubjectId ?? 'none'}</div>
      <button onClick={handleLogin}>Login</button>
      <button onClick={handleRegister}>Register</button>
      <button onClick={logout}>Logout</button>
      <button onClick={refreshUser}>Refresh</button>
      <button onClick={() => setCurrentSubject('s2')}>Select S2</button>
      <button onClick={() => setCurrentSubject(null)}>Clear Subject</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.__authResult;
    jest.clearAllMocks();
    // Provide a default mock for the /auth/config fetch that fires on mount
    api.get.mockResolvedValue({ data: { registrationEnabled: false } });
  });

  it('starts unauthenticated with no token', async () => {
    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(screen.getByTestId('auth')).toHaveTextContent('no');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    // Derived fields default to empty when there is no user
    expect(screen.getByTestId('memberships-count')).toHaveTextContent('0');
    expect(screen.getByTestId('membership-groups')).toHaveTextContent('none');
    expect(screen.getByTestId('managed-assignment-ids')).toHaveTextContent('none');
    // /auth/config is always fetched on mount; /auth/me is only called when a token exists
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/auth/me'));
  });

  it('hydrates user from token via /auth/me', async () => {
    localStorage.setItem('token', 'existing-token');
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({
        data: {
          user: {
            username: 'alice',
            role: 'assignment_manager',
            subjects: [{ id: 's1', name: 'Software Modelling' }],
            memberships: [],
            managedAssignments: [
              { id: 'as1', name: 'Assignment 1', subject_id: 's1', subject_name: 'Software Modelling' },
              { id: 'as2', name: 'Assignment 2', subject_id: 's1', subject_name: 'Software Modelling' },
            ],
          },
        },
      }); // /auth/me on mount

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('alice');
    expect(screen.getByTestId('is-admin')).toHaveTextContent('no');
    expect(screen.getByTestId('is-assignment-manager')).toHaveTextContent('yes');
    expect(screen.getByTestId('managed-assignment-ids')).toHaveTextContent('as1,as2');
    expect(screen.getByTestId('memberships-count')).toHaveTextContent('0');
  });

  it('derives memberships and managedAssignmentIds from the user object', async () => {
    localStorage.setItem('token', 'existing-token');
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({
        data: {
          user: {
            username: 'bob',
            role: 'user',
            subjects: [{ id: 's1', name: 'Software Modelling' }],
            memberships: [
              {
                assignment_id: 'as1',
                assignment_name: 'Assignment 1',
                subject_id: 's1',
                subject_name: 'Software Modelling',
                group_id: 'g1',
                group_name: 'Team Alpha',
              },
              {
                assignment_id: 'as2',
                assignment_name: 'Assignment 2',
                subject_id: 's1',
                subject_name: 'Software Modelling',
                group_id: 'g2',
                group_name: 'Team Beta',
              },
            ],
            managedAssignments: [{ id: 'as9', name: 'Managed', subject_id: 's1', subject_name: 'Software Modelling' }],
          },
        },
      }); // /auth/me on mount

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });

    expect(screen.getByTestId('memberships-count')).toHaveTextContent('2');
    expect(screen.getByTestId('membership-groups')).toHaveTextContent('Team Alpha,Team Beta');
    expect(screen.getByTestId('managed-assignment-ids')).toHaveTextContent('as9');
  });

  it('defaults derived fields to empty arrays when user lacks membership fields', async () => {
    localStorage.setItem('token', 'existing-token');
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({ data: { user: { username: 'legacy', role: 'user' } } }); // /auth/me on mount

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });

    expect(screen.getByTestId('memberships-count')).toHaveTextContent('0');
    expect(screen.getByTestId('membership-groups')).toHaveTextContent('none');
    expect(screen.getByTestId('managed-assignment-ids')).toHaveTextContent('none');
  });

  it('clears invalid token when /auth/me fails', async () => {
    localStorage.setItem('token', 'bad-token');
    api.get.mockRejectedValue(new Error('unauthorized'));

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    expect(screen.getByTestId('auth')).toHaveTextContent('no');
  });

  it('login stores token and authenticates user on success', async () => {
    const demoUser = {
      username: 'demo',
      role: 'normal_user',
      subjects: [],
      memberships: [],
      managedAssignments: [],
    };
    // /auth/config on mount (no token yet), then /auth/me after token is set by login
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({ data: { user: demoUser } }); // /auth/me after login sets token

    api.post.mockResolvedValue({
      data: { token: 'jwt-token', user: demoUser },
    });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('token', 'jwt-token');
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
      expect(screen.getByTestId('user')).toHaveTextContent('demo');
      expect(screen.getByTestId('token')).toHaveTextContent('jwt-token');
    });

    expect(window.__authResult).toEqual({ success: true });
  });

  it('login returns error on failure', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Invalid credentials' } },
    });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
    });

    expect(window.__authResult).toEqual({ success: false, error: 'Invalid credentials' });
  });

  it('login error includes status field from response', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Account locked' }, status: 403 },
    });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
    });

    expect(window.__authResult).toEqual({
      success: false,
      error: 'Account locked',
      status: 403,
    });
  });

  it('register sends expected payload and returns success message', async () => {
    api.post.mockResolvedValue({ data: { message: 'Registered' } });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Register'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/auth\/register$/),
        expect.objectContaining({
          username: 'demo',
          email: 'demo@example.com',
          password: 'password123',
          studentId: 's1234',
        })
      );
    });

    expect(window.__authResult).toEqual({ success: true, message: 'Registered' });
  });

  it('register returns default error message when response has no error', async () => {
    api.post.mockRejectedValue(new Error('network'));

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Register'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
    });

    expect(window.__authResult).toEqual({ success: false, error: 'Registration failed' });
  });

  it('refreshUser updates user data from /auth/me', async () => {
    localStorage.setItem('token', 'existing-token');
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({ data: { user: { username: 'alice', role: 'user', memberships: [] } } })
      .mockResolvedValueOnce({
        data: {
          user: {
            username: 'alice',
            role: 'user',
            memberships: [
              {
                assignment_id: 'as1',
                assignment_name: 'Assignment 1',
                subject_id: 's1',
                subject_name: 'Software Modelling',
                group_id: 'g0000000-0000-0000-0000-000000000001',
                group_name: 'Team A',
              },
            ],
          },
        },
      });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });
    expect(screen.getByTestId('membership-groups')).toHaveTextContent('none');

    await userEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(3); // config + /auth/me on mount + refreshUser
    });
    expect(screen.getByTestId('membership-groups')).toHaveTextContent('Team A');
  });

  it('refreshUser clears auth on failure', async () => {
    localStorage.setItem('token', 'existing-token');
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({ data: { user: { username: 'alice', role: 'user' } } })
      .mockRejectedValueOnce(new Error('unauthorized'));

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });

    await userEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('no');
      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    });
  });

  it('logout clears local state and storage', async () => {
    localStorage.setItem('token', 'existing-token');
    const S1 = '11111111-1111-4111-8111-111111111111';
    sessionStorage.setItem('gap.currentSubject', S1);
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({
        data: { user: { username: 'root', role: 'admin', subjects: [{ id: S1, name: 'S1' }] } },
      }); // /auth/me on mount
    api.post.mockRejectedValue(new Error('network error'));

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });
    expect(screen.getByTestId('is-admin')).toHaveTextContent('yes');

    await userEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
    });

    expect(screen.getByTestId('auth')).toHaveTextContent('no');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    // The remembered subject selection must not leak to the next user in this tab
    expect(sessionStorage.getItem('gap.currentSubject')).toBeNull();
  });
});

describe('registrationEnabled config', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('sets registrationEnabled to true when /auth/config returns true', async () => {
    api.get.mockResolvedValue({ data: { registrationEnabled: true } });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('registration-enabled')).toHaveTextContent('yes');
    });
  });

  it('defaults registrationEnabled to false when /auth/config call fails', async () => {
    api.get.mockRejectedValue(new Error('network error'));

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(screen.getByTestId('registration-enabled')).toHaveTextContent('no');
  });
});

describe('currentSubjectId management', () => {
  const SUBJECT_1 = { id: 's1', name: 'Software Modelling' };
  const SUBJECT_2 = { id: 's2', name: 'Distributed Systems' };
  const SUBJECT_3 = { id: 's3', name: 'Algorithms' };

  function mockUserFetch(subjects) {
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({
        data: {
          user: { username: 'carol', role: 'user', subjects, memberships: [], managedAssignments: [] },
        },
      }); // /auth/me on mount
  }

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: { registrationEnabled: false } });
  });

  it('defaults currentSubjectId to null when nothing is stored', async () => {
    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(screen.getByTestId('current-subject')).toHaveTextContent('none');
  });

  it('auto-selects the only subject and persists it to sessionStorage', async () => {
    localStorage.setItem('token', 'existing-token');
    mockUserFetch([SUBJECT_1]);

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-subject')).toHaveTextContent('s1');
    });
    expect(sessionStorage.setItem).toHaveBeenCalledWith('gap.currentSubject', 's1');
  });

  it('restores a stored subject id that is in the user subject list', async () => {
    sessionStorage.setItem('gap.currentSubject', 's2');
    localStorage.setItem('token', 'existing-token');
    mockUserFetch([SUBJECT_1, SUBJECT_2]);

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });

    expect(screen.getByTestId('current-subject')).toHaveTextContent('s2');
    expect(sessionStorage.removeItem).not.toHaveBeenCalledWith('gap.currentSubject');
  });

  it('ignores a stale stored subject id and clears the storage key', async () => {
    sessionStorage.setItem('gap.currentSubject', 'stale-subject');
    localStorage.setItem('token', 'existing-token');
    mockUserFetch([SUBJECT_1, SUBJECT_2]);

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-subject')).toHaveTextContent('none');
    });
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('gap.currentSubject');
  });

  it('setCurrentSubject persists the id and clears storage when called with null', async () => {
    localStorage.setItem('token', 'existing-token');
    mockUserFetch([SUBJECT_1, SUBJECT_2]);

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });
    expect(screen.getByTestId('current-subject')).toHaveTextContent('none');

    await userEvent.click(screen.getByText('Select S2'));

    await waitFor(() => {
      expect(screen.getByTestId('current-subject')).toHaveTextContent('s2');
    });
    expect(sessionStorage.setItem).toHaveBeenCalledWith('gap.currentSubject', 's2');

    await userEvent.click(screen.getByText('Clear Subject'));

    await waitFor(() => {
      expect(screen.getByTestId('current-subject')).toHaveTextContent('none');
    });
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('gap.currentSubject');
  });

  it('clears the selection when the subject disappears after refreshUser', async () => {
    sessionStorage.setItem('gap.currentSubject', 's2');
    localStorage.setItem('token', 'existing-token');
    api.get
      .mockResolvedValueOnce({ data: { registrationEnabled: false } }) // /auth/config on mount
      .mockResolvedValueOnce({
        data: {
          user: {
            username: 'carol',
            role: 'user',
            subjects: [SUBJECT_1, SUBJECT_2],
            memberships: [],
            managedAssignments: [],
          },
        },
      }) // /auth/me on mount
      .mockResolvedValueOnce({
        data: {
          user: {
            username: 'carol',
            role: 'user',
            subjects: [SUBJECT_1, SUBJECT_3],
            memberships: [],
            managedAssignments: [],
          },
        },
      }); // refreshUser

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    });
    expect(screen.getByTestId('current-subject')).toHaveTextContent('s2');

    await userEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(screen.getByTestId('current-subject')).toHaveTextContent('none');
    });
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('gap.currentSubject');
  });
});

describe('useAuth', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when used outside AuthProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestHarness />)).toThrow('useAuth must be used within an AuthProvider');
  });
});
