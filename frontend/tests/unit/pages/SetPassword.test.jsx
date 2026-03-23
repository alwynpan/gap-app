import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import SetPassword from '../../../src/pages/SetPassword.jsx';

jest.mock('axios');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('SetPassword page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderWithToken = (token) => {
    const initialPath = token ? `/set-password?token=${token}` : '/set-password';
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('shows invalid link screen when no token provided', () => {
    renderWithToken(null);

    expect(screen.getByText('Invalid Link')).toBeInTheDocument();
    expect(screen.getByText(/this link is invalid or has already been used/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('At least 6 characters')).not.toBeInTheDocument();
  });

  it('renders the set password form when token is present', () => {
    renderWithToken('abc123token');

    expect(screen.getByText('Set your password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('At least 6 characters')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Repeat your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set password/i })).toBeInTheDocument();
  });

  it('shows error when password is too short', async () => {
    const user = userEvent.setup();
    renderWithToken('abc123token');

    await user.type(screen.getByPlaceholderText('At least 6 characters'), 'abc');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'abc');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters.')).toBeInTheDocument();
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    renderWithToken('abc123token');

    await user.type(screen.getByPlaceholderText('At least 6 characters'), 'password123');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'different123');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('submits token and password on success, then navigates to login', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithToken('validtoken123');

    axios.post.mockResolvedValue({ data: { message: 'Password set successfully. You can now log in.' } });

    await user.type(screen.getByPlaceholderText('At least 6 characters'), 'newpass1');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'newpass1');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/set-password$/), {
        token: 'validtoken123',
        password: 'newpass1',
      });
      expect(screen.getByText('Password set successfully. You can now log in.')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(2500);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    jest.useRealTimers();
  });

  it('disables submit button after successful submission', async () => {
    const user = userEvent.setup();
    renderWithToken('validtoken123');

    axios.post.mockResolvedValue({ data: { message: 'Password updated.' } });

    await user.type(screen.getByPlaceholderText('At least 6 characters'), 'newpass1');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'newpass1');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(screen.getByText('Password updated.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /set password/i })).toBeDisabled();
  });

  it('shows error on API failure', async () => {
    const user = userEvent.setup();
    renderWithToken('expiredtoken');

    axios.post.mockRejectedValue({
      response: { data: { error: 'Token has expired or already been used.' } },
    });

    await user.type(screen.getByPlaceholderText('At least 6 characters'), 'newpass1');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'newpass1');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(screen.getByText('Token has expired or already been used.')).toBeInTheDocument();
    });
  });

  it('shows generic error when no response body on failure', async () => {
    const user = userEvent.setup();
    renderWithToken('sometoken');

    axios.post.mockRejectedValue(new Error('Network Error'));

    await user.type(screen.getByPlaceholderText('At least 6 characters'), 'newpass1');
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'newpass1');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to set password. The link may have expired.')).toBeInTheDocument();
    });
  });
});
