import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  // Fetch server config on mount
  useEffect(() => {
    axios
      .get(`${API_BASE}/auth/config`)
      .then((res) => setRegistrationEnabled(res.data.registrationEnabled))
      .catch(() => setRegistrationEnabled(false));
  }, []);

  // Configure axios defaults
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Check if user is logged in on mount
  useEffect(() => {
    async function checkAuth() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${API_BASE}/auth/me`);
        setUser(response.data.user);
      } catch (_error) {
        // Token invalid, clear it
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [token]);

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
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
      const response = await axios.post(`${API_BASE}/auth/register`, {
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
      await axios.post(`${API_BASE}/auth/logout`);
    } catch (_error) {
      // Ignore errors on logout
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await axios.get(`${API_BASE}/auth/me`);
      setUser(response.data.user);
    } catch (_error) {
      // If refresh fails, clear auth state
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
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
