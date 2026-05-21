import api from '@/utils/api';

describe('api request interceptor', () => {
  const mockAdapter = jest.fn().mockResolvedValue({ data: {}, status: 200, headers: {} });
  let originalAdapter;

  beforeEach(() => {
    localStorage.clear();
    mockAdapter.mockClear();
    originalAdapter = api.defaults.adapter;
    api.defaults.adapter = mockAdapter;
  });

  afterEach(() => {
    localStorage.clear();
    api.defaults.adapter = originalAdapter;
  });

  it('attaches Authorization header when localStorage has a token', async () => {
    localStorage.setItem('token', 'test-jwt-token');
    await api.get('/test');
    const config = mockAdapter.mock.calls[0][0];
    expect(config.headers.get('Authorization')).toBe('Bearer test-jwt-token');
  });

  it('does not attach Authorization header when no token in localStorage', async () => {
    await api.get('/test');
    const config = mockAdapter.mock.calls[0][0];
    expect(config.headers.has('Authorization')).toBe(false);
  });
});
