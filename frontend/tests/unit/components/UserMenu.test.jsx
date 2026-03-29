import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import UserMenu from '../../../src/components/UserMenu.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

const mockLogout = jest.fn();
const mockRefreshUser = jest.fn();

const baseUser = {
  id: 'u0000000-0000-0000-0000-000000000001',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'user',
  studentId: 'S12345',
};

function setup(overrides = {}) {
  useAuth.mockReturnValue({
    user: { ...baseUser },
    logout: mockLogout,
    refreshUser: mockRefreshUser,
    ...overrides,
  });
  return userEvent.setup();
}

function renderMenu() {
  return render(<UserMenu />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('UserMenu', () => {
  describe('Dropdown trigger', () => {
    it('renders username and formatted role', () => {
      setup();
      renderMenu();
      expect(screen.getByText(/testuser/)).toBeInTheDocument();
      expect(screen.getByText(/user/i)).toBeInTheDocument();
    });

    it('does not show menu items by default', () => {
      setup();
      renderMenu();
      expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument();
    });

    it('opens dropdown on click', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    it('closes dropdown on outside click', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
      await user.click(document.body);
      expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
    });

    it('calls logout when Logout is clicked', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /logout/i }));
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('Edit Profile modal', () => {
    it('opens Edit Profile modal', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));
      expect(screen.getByRole('heading', { name: /edit profile/i })).toBeInTheDocument();
    });

    it('pre-fills fields with current user data', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
      expect(screen.getByDisplayValue('User')).toBeInTheDocument();
    });

    it('shows Student ID field for role=user', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));
      expect(screen.getByLabelText(/student id/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('S12345')).toBeInTheDocument();
    });

    it('hides Student ID field for admin role', async () => {
      const user = setup({ user: { ...baseUser, role: 'admin' } });
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));
      expect(screen.queryByLabelText(/student id/i)).not.toBeInTheDocument();
    });

    it('username field is read-only', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));
      expect(screen.getByDisplayValue('testuser')).toBeDisabled();
    });

    it('closes modal on Cancel', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('heading', { name: /edit profile/i })).not.toBeInTheDocument();
    });

    it('submits updated profile, shows success message, and closes modal', async () => {
      jest.useFakeTimers();
      setup({ user: { ...baseUser } });
      const ue = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      axios.put.mockResolvedValue({ data: { user: { ...baseUser, email: 'new@example.com' } } });
      renderMenu();
      await ue.click(screen.getByRole('button', { name: /testuser/i }));
      await ue.click(screen.getByRole('button', { name: /edit profile/i }));

      const emailInput = screen.getByDisplayValue('test@example.com');
      await ue.clear(emailInput);
      await ue.type(emailInput, 'new@example.com');

      await ue.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001$/),
          expect.objectContaining({ email: 'new@example.com' })
        );
        expect(mockRefreshUser).toHaveBeenCalled();
        expect(screen.getByText('Profile updated successfully')).toBeInTheDocument();
      });

      // Modal closes after auto-dismiss delay
      jest.advanceTimersByTime(1500);
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /edit profile/i })).not.toBeInTheDocument();
      });
    });

    it('shows validation error on submit with invalid email format', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));

      // Replace email with invalid value — passes HTML required but fails Zod regex
      const emailInput = screen.getByDisplayValue('test@example.com');
      await user.clear(emailInput);
      await user.type(emailInput, 'not-an-email');
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
    });

    it('shows API error message on failed save', async () => {
      const user = setup();
      axios.put.mockRejectedValue({ response: { data: { error: 'Email already in use' } } });
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /edit profile/i }));

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(screen.getByText('Email already in use')).toBeInTheDocument();
      });
    });
  });

  describe('Change Password modal', () => {
    it('opens Change Password modal', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /change password/i }));
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    });

    it('closes modal on Cancel', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('heading', { name: /change password/i })).not.toBeInTheDocument();
    });

    it('shows error when passwords do not match', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'different');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));
      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });

    it('shows error when new password is too short', async () => {
      const user = setup();
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), '12345');
      await user.type(screen.getByPlaceholderText('Confirm new password'), '12345');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));
      expect(screen.getByText('New password must be at least 6 characters')).toBeInTheDocument();
    });

    it('successfully changes password, shows success message, and closes modal', async () => {
      jest.useFakeTimers();
      setup();
      const ue = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      axios.put.mockResolvedValue({});
      renderMenu();
      await ue.click(screen.getByRole('button', { name: /testuser/i }));
      await ue.click(screen.getByRole('button', { name: /change password/i }));
      await ue.type(screen.getByPlaceholderText('Enter current password'), 'oldpass');
      await ue.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await ue.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await ue.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(axios.put).toHaveBeenCalledWith(
          expect.stringMatching(/\/users\/u0000000-0000-0000-0000-000000000001\/password$/),
          { currentPassword: 'oldpass', newPassword: 'newpass123' }
        );
        expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
      });

      // Modal closes after auto-dismiss delay
      jest.advanceTimersByTime(1500);
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /change password/i })).not.toBeInTheDocument();
      });
    });

    it('shows API error on failed password change', async () => {
      const user = setup();
      axios.put.mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } });
      renderMenu();
      await user.click(screen.getByRole('button', { name: /testuser/i }));
      await user.click(screen.getByRole('button', { name: /change password/i }));
      await user.type(screen.getByPlaceholderText('Enter current password'), 'wrongpass');
      await user.type(screen.getByPlaceholderText('Enter new password'), 'newpass123');
      await user.type(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
      await user.click(screen.getByRole('button', { name: /^change password$/i }));

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });
    });
  });
});
