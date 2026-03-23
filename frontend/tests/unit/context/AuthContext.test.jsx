import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { AuthProvider, useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');

function TestHarness() {
  const { user, loading, token, isAuthenticated, isAdmin, isAssignmentManager, login, register, logout, refreshUser } =
    useAuth();

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
      <button onClick={handleLogin}>Login</button>
      <button onClick={handleRegister}>Register</button>
      <button onClick={logout}>Logout</button>
      <button onClick={refreshUser}>Refresh</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    delete axios.defaults.headers.common.Authorization;
    delete window.__authResult;
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
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('hydrates user from token via /auth/me', async () => {
    localStorage.setItem('token', 'existing-token');
    axios.get.mockResolvedValue({
      data: { user: { username: 'alice', role: 'assignment_manager' } },
    });

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
    expect(axios.defaults.headers.common.Authorization).toBe('Bearer existing-token');
  });

  it('clears invalid token when /auth/me fails', async () => {
    localStorage.setItem('token', 'bad-token');
    axios.get.mockRejectedValue(new Error('unauthorized'));

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
    axios.get.mockResolvedValue({
      data: { user: { username: 'demo', role: 'normal_user' } },
    });

    axios.post.mockResolvedValue({
      data: { token: 'jwt-token', user: { username: 'demo', role: 'normal_user' } },
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
    axios.post.mockRejectedValue({
      response: { data: { error: 'Invalid credentials' } },
    });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
    });

    expect(window.__authResult).toEqual({ success: false, error: 'Invalid credentials' });
  });

  it('register sends expected payload and returns success message', async () => {
    axios.post.mockResolvedValue({ data: { message: 'Registered' } });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Register'));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
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
    axios.post.mockRejectedValue(new Error('network'));

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText('Register'));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
    });

    expect(window.__authResult).toEqual({ success: false, error: 'Registration failed' });
  });

  it('refreshUser updates user data from /auth/me', async () => {
    localStorage.setItem('token', 'existing-token');
    axios.get
      .mockResolvedValueOnce({ data: { user: { username: 'alice', role: 'user', groupId: null } } })
      .mockResolvedValueOnce({
        data: {
          user: {
            username: 'alice',
            role: 'user',
            groupId: 'g0000000-0000-0000-0000-000000000001',
            groupName: 'Team A',
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

    await userEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(2);
    });
  });

  it('refreshUser clears auth on failure', async () => {
    localStorage.setItem('token', 'existing-token');
    axios.get
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
    axios.get.mockResolvedValue({ data: { user: { username: 'root', role: 'admin' } } });
    axios.post.mockRejectedValue(new Error('network error'));

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
  });
});

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestHarness />)).toThrow('useAuth must be used within an AuthProvider');
  });
});
