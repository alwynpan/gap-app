import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../../../src/pages/Login.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Login page', () => {
  const mockLogin = jest.fn();

  beforeEach(() => {
    useAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      loading: false,
      user: null,
      registrationEnabled: true,
    });
  });

  it('renders login form fields', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('calls login with submitted credentials', async () => {
    mockLogin.mockResolvedValue({ success: true });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows login error when auth fails', async () => {
    mockLogin.mockResolvedValue({ success: false, error: 'Invalid credentials' });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), 'wrong');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('renders link to register page when registration is enabled', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /register here/i })).toHaveAttribute('href', '/register');
  });

  it('hides register link when registration is disabled', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      loading: false,
      user: null,
      registrationEnabled: false,
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /register here/i })).not.toBeInTheDocument();
  });

  it('shows "Signing in..." and disables button during login API call', async () => {
    let resolveLogin;
    mockLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const button = screen.getByRole('button', { name: /signing in/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Signing in...');

    resolveLogin({ success: true });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
    });
  });

  it('shows validation error and does not call login when username is empty', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    // Only fill password, leave username empty
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    // Bypass HTML required by clearing the field and submitting programmatically
    // The native required attr may block submit, so we need to use the schema path.
    // Instead, type a space (DOMPurify trims to empty) to trigger schema validation.
    await userEvent.type(screen.getByLabelText(/username/i), '   ');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows validation error and does not call login when password is empty', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    // Type a single space in password — schema trims/validates to empty → "Password is required"
    // However the password field is not sanitized. A space is a valid single char
    // which is min(1) so it passes. Instead, remove the required attribute to allow
    // empty submission, then let the Zod schema reject it.
    const passwordInput = screen.getByLabelText(/password/i);
    passwordInput.removeAttribute('required');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
