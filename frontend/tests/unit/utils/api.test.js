import api from '@/utils/api';

describe('api request interceptor', () => {
  it('attaches Authorization header when localStorage has a token', async () => {
    localStorage.setItem('token', 'test-jwt-token');

    // Run a request config through the interceptor chain
    const config = { headers: {} };
    // Axios interceptors are stored in api.interceptors.request.handlers
    const interceptor = api.interceptors.request.handlers[0];
    const result = interceptor.fulfilled(config);

    expect(result.headers.Authorization).toBe('Bearer test-jwt-token');
  });

  it('does not attach Authorization header when no token in localStorage', () => {
    localStorage.removeItem('token');

    const config = { headers: {} };
    const interceptor = api.interceptors.request.handlers[0];
    const result = interceptor.fulfilled(config);

    expect(result.headers.Authorization).toBeUndefined();
  });
});
