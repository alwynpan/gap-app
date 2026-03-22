import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Dashboard from '../../../src/pages/Dashboard.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Dashboard page', () => {
  const mockLogout = jest.fn();

  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { username: 'testuser', email: 'test@example.com', role: 'normal_user' },
      logout: mockLogout,
      isAdmin: false,
      isAssignmentManager: false,
    });
  });

  it('renders user profile data', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/welcome back, testuser!/i)).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Normal User')).toBeInTheDocument();
  });

  it('calls logout handler', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows admin links for admin users', () => {
    useAuth.mockReturnValue({
      user: { username: 'admin', email: 'admin@example.com', role: 'admin' },
      logout: mockLogout,
      isAdmin: true,
      isAssignmentManager: true,
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /manage users/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage groups/i })).toBeInTheDocument();
  });

  it('hides administration block for normal users', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  describe('Change Password', () => {
    it('opens and closes password modal', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      expect(screen.getByText('Change Password', { selector: 'h3' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText('Change Password', { selector: 'h3' })).not.toBeInTheDocument();
    });

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'different');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });

    it('shows error when new password is too short', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), '12345');
      await user.type(screen.getByPlaceholderText('Confirm new password'), '12345');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      expect(screen.getByText('New password must be at least 6 characters')).toBeInTheDocument();
    });

    it('successfully changes password', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: { id: 1, username: 'testuser', email: 'test@example.com', role: 'normal_user' },
        logout: mockLogout,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.put.mockResolvedValue({});

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/users\/1\/password$/), {
          currentPassword: 'oldpass',
          newPassword: 'newpass123',
        });
        expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
      });

      // Modal should close
      expect(screen.queryByPlaceholderText('Enter current password')).not.toBeInTheDocument();

      jest.advanceTimersByTime(3000);
      await waitFor(() => {
        expect(screen.queryByText('Password changed successfully')).not.toBeInTheDocument();
      });
    });

    it('shows API error when password change fails', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      useAuth.mockReturnValue({
        user: { id: 1, username: 'testuser', email: 'test@example.com', role: 'normal_user' },
        logout: mockLogout,
        isAdmin: false,
        isAssignmentManager: false,
      });

      axios.put.mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } });

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'wrong');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });
    });
  });
});
