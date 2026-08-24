import api, { registerSessionExpiryHandler } from '@/utils/api';

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

describe('session-expiry interceptor', () => {
  let originalAdapter;
  let detach;

  const respondWith = (status, url) => {
    api.defaults.adapter = jest.fn().mockRejectedValue({
      response: { status },
      config: { url },
    });
    return api.get(url).catch(() => {});
  };

  beforeEach(() => {
    originalAdapter = api.defaults.adapter;
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    if (detach) {
      detach();
      detach = undefined;
    }
  });

  it('clears the session on a 401 from an authenticated request', async () => {
    const onExpired = jest.fn();
    detach = registerSessionExpiryHandler(onExpired);

    await respondWith(401, 'http://localhost:3001/api/subjects');

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('ignores non-401 failures', async () => {
    const onExpired = jest.fn();
    detach = registerSessionExpiryHandler(onExpired);

    await respondWith(403, 'http://localhost:3001/api/subjects');
    await respondWith(500, 'http://localhost:3001/api/subjects');

    expect(onExpired).not.toHaveBeenCalled();
  });

  // These endpoints answer 401 as a normal outcome; the session is still valid.
  it.each([
    ['/auth/login', 'http://localhost:3001/api/auth/login'],
    ['/auth/register', 'http://localhost:3001/api/auth/register'],
    ['/auth/forgot-password', 'http://localhost:3001/api/auth/forgot-password'],
    ['/auth/set-password', 'http://localhost:3001/api/auth/set-password'],
  ])('does not clear the session on a 401 from %s', async (_label, url) => {
    const onExpired = jest.fn();
    detach = registerSessionExpiryHandler(onExpired);

    await respondWith(401, url);

    expect(onExpired).not.toHaveBeenCalled();
  });

  // Regression: a wrong *current* password answers 401 while the session is
  // perfectly valid. Treating it as expiry logged the user out mid-form.
  it('does not clear the session when the current password is wrong', async () => {
    const onExpired = jest.fn();
    detach = registerSessionExpiryHandler(onExpired);

    await respondWith(401, 'http://localhost:3001/api/users/2b8f0c1e-0000-4000-8000-000000000001/password');

    expect(onExpired).not.toHaveBeenCalled();
  });

  // The exclusion must not be so loose that a real expiry slips through.
  it('still clears the session for other /users paths', async () => {
    const onExpired = jest.fn();
    detach = registerSessionExpiryHandler(onExpired);

    await respondWith(401, 'http://localhost:3001/api/users/2b8f0c1e-0000-4000-8000-000000000001');

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('stops firing once detached', async () => {
    const onExpired = jest.fn();
    registerSessionExpiryHandler(onExpired)();

    await respondWith(401, 'http://localhost:3001/api/subjects');

    expect(onExpired).not.toHaveBeenCalled();
  });
});
