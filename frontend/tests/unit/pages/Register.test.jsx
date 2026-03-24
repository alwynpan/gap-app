import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from '../../../src/pages/Register.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Register page', () => {
  const mockRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      register: mockRegister,
      isAuthenticated: false,
      loading: false,
      user: null,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders registration form', () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/student id/i)).toBeInTheDocument();
    expect(screen.getByText(/you will receive an email with a link to set your password/i)).toBeInTheDocument();
  });

  it('calls register without password', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({ success: true, message: 'Registration successful' });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'User');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('newuser', 'new@example.com', null, {
        firstName: 'New',
        lastName: 'User',
        studentId: undefined,
      });
    });
  });

  it('passes studentId when provided', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({ success: true, message: 'Registration successful' });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'User');
    await user.type(screen.getByLabelText(/student id/i), 's001');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('newuser', 'new@example.com', null, {
        firstName: 'New',
        lastName: 'User',
        studentId: 's001',
      });
    });
  });

  it('passes undefined when optional student id is empty', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({ success: true, message: 'Registration successful' });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/username/i), 'nostudent');
    await user.type(screen.getByLabelText(/email/i), 'nostudent@example.com');
    await user.type(screen.getByLabelText(/first name/i), 'No');
    await user.type(screen.getByLabelText(/last name/i), 'Student');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('nostudent', 'nostudent@example.com', null, {
        firstName: 'No',
        lastName: 'Student',
        studentId: undefined,
      });
    });
  });

  it('shows generic API error message when registration fails', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({ success: false, error: 'Email already exists', status: 409 });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/username/i), 'existing');
    await user.type(screen.getByLabelText(/email/i), 'existing@example.com');
    await user.type(screen.getByLabelText(/first name/i), 'Existing');
    await user.type(screen.getByLabelText(/last name/i), 'User');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Username or email already in use. Please use a different one.')).toBeInTheDocument();
    });
  });

  it('navigates to login after successful registration', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockRegister.mockResolvedValue({ success: true, message: 'Registration successful' });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/username/i), 'newuser');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'User');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/registration successful/i)).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login');

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows generic error for 400 status', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({ success: false, error: 'Validation failed', status: 400 });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/username/i), 'baduser');
    await user.type(screen.getByLabelText(/email/i), 'bad@example.com');
    await user.type(screen.getByLabelText(/first name/i), 'Bad');
    await user.type(screen.getByLabelText(/last name/i), 'User');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid input. Please check all required fields.')).toBeInTheDocument();
    });
  });

  it('shows generic error for unknown status', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({ success: false, error: 'Server error', status: 500 });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/username/i), 'baduser');
    await user.type(screen.getByLabelText(/email/i), 'bad@example.com');
    await user.type(screen.getByLabelText(/first name/i), 'Bad');
    await user.type(screen.getByLabelText(/last name/i), 'User');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Registration failed. Please try again.')).toBeInTheDocument();
    });
  });
});
