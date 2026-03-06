import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Groups from '../../../src/pages/Groups.jsx';
import { useAuth } from '../../../src/context/AuthContext.jsx';

jest.mock('axios');
jest.mock('../../../src/context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

describe('Groups page', () => {
  const groupsData = [{ id: 1, name: 'Group A', enabled: true, created_at: '2025-01-01T00:00:00.000Z' }];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { username: 'admin', role: 'admin' } });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading spinner before data resolves', () => {
    axios.get.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText(/manage groups/i)).not.toBeInTheDocument();
  });

  it('renders groups after successful fetch', async () => {
    axios.get.mockResolvedValue({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/manage groups/i)).toBeInTheDocument();
      expect(screen.getByText('Group A')).toBeInTheDocument();
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });
  });

  it('shows fetch error state', async () => {
    axios.get.mockRejectedValue(new Error('boom'));

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load groups')).toBeInTheDocument();
    });
  });

  it('shows empty-state text when there are no groups', async () => {
    axios.get.mockResolvedValue({ data: { groups: [] } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No groups created yet')).toBeInTheDocument();
    });
  });

  it('opens create-group modal', async () => {
    axios.get.mockResolvedValue({ data: { groups: [] } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /create group/i }));

    expect(screen.getByText('Create New Group')).toBeInTheDocument();
  });

  it('creates a group and shows success feedback', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    jest.useFakeTimers();

    axios.get
      .mockResolvedValueOnce({ data: { groups: [] } })
      .mockResolvedValueOnce({ data: { groups: [...groupsData, { ...groupsData[0], id: 2, name: 'New Team' }] } });
    axios.post.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), ' New Team ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/groups$/), { name: 'New Team' });
      expect(screen.getByText('Group created successfully')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('Group created successfully')).not.toBeInTheDocument();
    });
  });

  it('does not create a group when name is blank', async () => {
    const user = userEvent.setup();
    axios.get.mockResolvedValue({ data: { groups: [] } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), '   ');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('shows fallback error when create group fails without API message', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    jest.useFakeTimers();

    axios.get.mockResolvedValue({ data: { groups: [] } });
    axios.post.mockRejectedValue(new Error('network'));

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^\+ create group$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^\+ create group$/i }));
    await user.type(screen.getByPlaceholderText(/enter group name/i), 'Team X');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to create group')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('Failed to create group')).not.toBeInTheDocument();
    });
  });

  it('toggles group state and deletes group after confirmation', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    jest.useFakeTimers();

    axios.get
      .mockResolvedValueOnce({ data: { groups: groupsData } })
      .mockResolvedValueOnce({ data: { groups: [{ ...groupsData[0], enabled: false }] } })
      .mockResolvedValueOnce({ data: { groups: [] } });
    axios.put.mockResolvedValue({});
    axios.delete.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/1$/), { enabled: false });
      expect(screen.getByText('Group updated successfully')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this group?');
      expect(axios.delete).toHaveBeenCalledWith(expect.stringMatching(/\/groups\/1$/));
      expect(screen.getByText('Group deleted successfully')).toBeInTheDocument();
    });
  });

  it('does not delete when confirmation is canceled', async () => {
    const user = userEvent.setup();
    window.confirm.mockReturnValue(false);
    axios.get.mockResolvedValue({ data: { groups: groupsData } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('shows API error when toggle fails', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    jest.useFakeTimers();

    axios.get.mockResolvedValue({ data: { groups: groupsData } });
    axios.put.mockRejectedValue({ response: { data: { error: 'Cannot update group' } } });

    render(
      <MemoryRouter>
        <Groups />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => {
      expect(screen.getByText('Cannot update group')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(3000);
    await waitFor(() => {
      expect(screen.queryByText('Cannot update group')).not.toBeInTheDocument();
    });
  });
});
