import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../../../src/pages/Dashboard.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

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
});
