import axios from 'axios';

const api = axios.create();

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints where a 401 is an expected answer rather than an expired session —
// those must not clear auth state. Besides the public auth endpoints (bad
// credentials, invalid reset token), changing your own password answers 401 when
// the *current* password is wrong: the session is still perfectly valid, so
// treating that as expiry would log the user out mid-form.
const EXPECTED_401_PATHS = [
  /\/auth\/login$/,
  /\/auth\/register$/,
  /\/auth\/forgot-password$/,
  /\/auth\/set-password$/,
  /\/users\/[^/]+\/password$/,
];

function isSessionExpiry(error) {
  if (error.response?.status !== 401) {
    return false;
  }
  const url = error.config?.url || '';
  return !EXPECTED_401_PATHS.some((pattern) => pattern.test(url));
}

/**
 * Register the session-expiry handler. AuthProvider calls this once so a 401 on
 * any authenticated request clears auth state instead of leaving the app mounted
 * behind repeated failing requests.
 *
 * @param {() => void} onSessionExpired
 * @returns {() => void} Detach function.
 */
export function registerSessionExpiryHandler(onSessionExpired) {
  const id = api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (isSessionExpiry(error)) {
        onSessionExpired();
      }
      return Promise.reject(error);
    }
  );
  return () => api.interceptors.response.eject(id);
}

export default api;
