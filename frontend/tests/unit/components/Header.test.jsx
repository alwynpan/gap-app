import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../../src/components/Header.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../src/components/UserMenu.jsx', () => ({
  __esModule: true,
  default: () => <div data-testid="user-menu" />,
}));

const baseUser = {
  id: 'u0000000-0000-0000-0000-000000000001',
  username: 'testuser',
  role: 'user',
};

function renderHeader(props = {}) {
  return render(
    <MemoryRouter>
      <Header {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Header', () => {
  it('does not render UserMenu when user is null', () => {
    useAuth.mockReturnValue({ user: null });
    renderHeader();
    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });

  it('renders UserMenu when a user is authenticated', () => {
    useAuth.mockReturnValue({ user: { ...baseUser } });
    renderHeader();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('renders the pageName when provided', () => {
    useAuth.mockReturnValue({ user: { ...baseUser } });
    renderHeader({ pageName: 'User Management' });
    expect(screen.getByText('User Management')).toBeInTheDocument();
  });

  it('does not render a pageName element when the prop is omitted', () => {
    useAuth.mockReturnValue({ user: { ...baseUser } });
    renderHeader();
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
  });

  it('points the brand link to /dashboard', () => {
    useAuth.mockReturnValue({ user: { ...baseUser } });
    renderHeader();
    const link = screen.getByRole('link', { name: /g\.a\.p\./i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
