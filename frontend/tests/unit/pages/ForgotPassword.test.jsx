import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import ForgotPassword from '../../../src/pages/ForgotPassword.jsx';

jest.mock('axios');

describe('ForgotPassword page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the forgot password form', () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument();
  });

  it('shows error when email is whitespace-only and submit attempted', async () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    // Use fireEvent to bypass HTML5 constraint validation and test our JS guard
    const emailInput = screen.getByPlaceholderText('Enter your email address');
    fireEvent.change(emailInput, { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }).closest('form'));

    await waitFor(() => {
      expect(screen.getByText('Email is required.')).toBeInTheDocument();
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('submits email and shows success message', async () => {
    const user = userEvent.setup();

    axios.post.mockResolvedValue({
      data: { message: 'If that email is registered, a reset link has been sent.' },
    });

    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email address'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/forgot-password$/), {
        email: 'test@example.com',
      });
      expect(screen.getByText('If that email is registered, a reset link has been sent.')).toBeInTheDocument();
    });
  });

  it('disables button after successful submission', async () => {
    const user = userEvent.setup();

    axios.post.mockResolvedValue({
      data: { message: 'Reset link sent.' },
    });

    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email address'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Reset link sent.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDisabled();
  });

  it('shows error message on API failure', async () => {
    const user = userEvent.setup();

    axios.post.mockRejectedValue({
      response: { data: { error: 'Too many requests. Please try again later.' } },
    });

    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email address'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Too many requests. Please try again later.')).toBeInTheDocument();
    });
  });

  it('shows generic error when no response body on failure', async () => {
    const user = userEvent.setup();

    axios.post.mockRejectedValue(new Error('Network Error'));

    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email address'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('trims whitespace from email before submitting', async () => {
    const user = userEvent.setup();

    axios.post.mockResolvedValue({ data: { message: 'Sent.' } });

    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('Enter your email address'), '  user@example.com  ');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.any(String), { email: 'user@example.com' });
    });
  });
});
