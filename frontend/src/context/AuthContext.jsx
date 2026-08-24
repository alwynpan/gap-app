import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { registerSessionExpiryHandler } from '@/utils/api';
import { API_BASE } from '../config.js';

const AuthContext = createContext(null);

const CURRENT_SUBJECT_KEY = 'gap.currentSubject';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  // Tracked separately so a deep link to /register is not redirected away before
  // the flag arrives.
  const [registrationConfigLoading, setRegistrationConfigLoading] = useState(true);
  const [currentSubjectId, setCurrentSubjectId] = useState(() => sessionStorage.getItem(CURRENT_SUBJECT_KEY));

  // Drop all auth state. Used by logout and by the session-expiry interceptor.
  const clearAuthState = useCallback(() => {
    localStorage.removeItem('token');
    sessionStorage.removeItem(CURRENT_SUBJECT_KEY);
    setToken(null);
    setUser(null);
    setCurrentSubjectId(null);
  }, []);

  // Clear the session as soon as any authenticated request reports 401, so an
  // expired or revoked token cannot leave protected pages mounted.
  useEffect(() => registerSessionExpiryHandler(clearAuthState), [clearAuthState]);

  // Fetch server config on mount
  useEffect(() => {
    api
      .get(`${API_BASE}/auth/config`)
      .then((res) => setRegistrationEnabled(res.data.registrationEnabled))
      .catch(() => setRegistrationEnabled(false))
      .finally(() => setRegistrationConfigLoading(false));
  }, []);

  // Check if user is logged in on mount
  useEffect(() => {
    async function checkAuth() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`${API_BASE}/auth/me`);
        setUser(response.data.user);
      } catch (_error) {
        // Token invalid, clear it
        clearAuthState();
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [token, clearAuthState]);

  // Validate the current subject selection whenever the user changes:
  // auto-select the only subject, and drop a stored id that no longer exists.
  useEffect(() => {
    if (!user) {
      return;
    }
    const subjects = user.subjects ?? [];
    if (subjects.length === 1) {
      if (currentSubjectId !== subjects[0].id) {
        setCurrentSubjectId(subjects[0].id);
        sessionStorage.setItem(CURRENT_SUBJECT_KEY, subjects[0].id);
      }
      return;
    }
    if (currentSubjectId !== null && !subjects.some((subject) => subject.id === currentSubjectId)) {
      setCurrentSubjectId(null);
      sessionStorage.removeItem(CURRENT_SUBJECT_KEY);
    }
  }, [user, currentSubjectId]);

  const setCurrentSubject = (id) => {
    setCurrentSubjectId(id);
    if (id === null || id === undefined) {
      sessionStorage.removeItem(CURRENT_SUBJECT_KEY);
    } else {
      sessionStorage.setItem(CURRENT_SUBJECT_KEY, id);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await api.post(`${API_BASE}/auth/login`, {
        username,
        password,
      });

      const { token: newToken, user: userData } = response.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(userData);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed',
        status: error.response?.status,
      };
    }
  };

  const register = async (username, email, password, { firstName, lastName, studentId } = {}) => {
    try {
      const response = await api.post(`${API_BASE}/auth/register`, {
        username,
        email,
        password,
        firstName,
        lastName,
        studentId,
      });

      return { success: true, message: response.data.message };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed',
        status: error.response?.status,
      };
    }
  };

  const logout = async () => {
    try {
      await api.post(`${API_BASE}/auth/logout`);
    } catch (_error) {
      // Ignore errors on logout
    } finally {
      // Also clears the remembered subject so it can't leak to the next user in this tab
      clearAuthState();
    }
  };

  const refreshUser = async () => {
    try {
      const response = await api.get(`${API_BASE}/auth/me`);
      setUser(response.data.user);
    } catch (_error) {
      // If refresh fails, clear auth state
      clearAuthState();
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    token,
    login,
    register,
    logout,
    refreshUser,
    isAdmin: user?.role === 'admin',
    isAssignmentManager: user?.role === 'assignment_manager' || user?.role === 'admin',
    registrationEnabled,
    registrationConfigLoading,
    memberships: user?.memberships ?? [],
    managedAssignmentIds: (user?.managedAssignments ?? []).map((a) => a.id),
    currentSubjectId,
    setCurrentSubject,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
