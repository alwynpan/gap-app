const axios = require('axios');
const { API_BASE, waitForAPI } = require('./api');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_this_in_production';

describe('Authentication E2E Tests', () => {
  let authToken = null;
  let adminToken = null;
  let testUserId = null;
  let fullUserId = null;
  let registrationEnabled = false;

  const testUserUsername = `testuser_${Date.now()}`;
  const testUserPassword = 'testpass123';

  beforeAll(async () => {
    await waitForAPI();

    // Login as admin
    try {
      const adminResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      });
      adminToken = adminResponse.data.token;
    } catch (error) {
      console.warn('Admin login failed - may need to run migrations first');
      return;
    }

    // Check if registration is enabled on this server
    try {
      const configResp = await axios.get(`${API_BASE}/auth/config`);
      registrationEnabled = configResp.data.registrationEnabled;
    } catch (_error) {
      registrationEnabled = false;
    }

    // Create testUser via admin API so login/logout/me tests always work
    const createResp = await axios.post(
      `${API_BASE}/users`,
      {
        username: testUserUsername,
        email: `${testUserUsername}@example.com`,
        password: testUserPassword,
        firstName: 'Test',
        lastName: 'User',
        studentId: `STU_${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    testUserId = createResp.data.user.id;
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      if (!registrationEnabled) return;
      const uniqueId = Date.now();
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: `regtest_${uniqueId}`,
        email: `regtest_${uniqueId}@example.com`,
        password: 'testpass123',
        firstName: 'Reg',
        lastName: 'Test',
        studentId: `RSTU_${uniqueId}`,
      });

      expect(response.status).toBe(201);
      expect(response.data.message).toBe('User registered successfully');
      // Clean up immediately
      if (response.data.user?.id) {
        try {
          await axios.delete(`${API_BASE}/users/${response.data.user.id}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        } catch (_error) { /* ignore */ }
      }
    });

    it('should reject registration with existing username', async () => {
      if (!registrationEnabled) return;
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: testUserUsername,
          email: `different_${Date.now()}@example.com`,
          password: 'testpass123',
          firstName: 'Test',
          lastName: 'User',
        })
      ).rejects.toThrow('409');
    });

    it('should reject registration with existing email', async () => {
      if (!registrationEnabled) return;
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `different_${Date.now()}`,
          email: `${testUserUsername}@example.com`,
          password: 'testpass123',
          firstName: 'Test',
          lastName: 'User',
        })
      ).rejects.toThrow('409');
    });

    it('should reject registration with weak password', async () => {
      if (!registrationEnabled) return;
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `weakpass_${Date.now()}`,
          email: `weak_${Date.now()}@example.com`,
          password: '123',
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration without username', async () => {
      if (!registrationEnabled) return;
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          email: `noun_${Date.now()}@example.com`,
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration without email', async () => {
      if (!registrationEnabled) return;
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `noemail_${Date.now()}`,
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration without password', async () => {
      if (!registrationEnabled) return;
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `nopass_${Date.now()}`,
          email: `nopass_${Date.now()}@example.com`,
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration with invalid email format', async () => {
      if (!registrationEnabled) return;
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `bademail_${Date.now()}`,
          email: 'invalid-email',
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should register with optional fields (firstName, lastName, studentId)', async () => {
      if (!registrationEnabled) return;
      const uniqueId = Date.now();
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: `fulluser_${uniqueId}`,
        email: `fulluser_${uniqueId}@example.com`,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        studentId: `STU${uniqueId}`,
      });

      expect(response.status).toBe(201);
      expect(response.data.user.studentId).toBe(`STU${uniqueId}`);
      fullUserId = response.data.user.id;
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        username: testUserUsername,
        password: testUserPassword,
      });

      expect(response.status).toBe(200);
      expect(response.data.token).toBeDefined();
      expect(response.data.user.username).toBe(testUserUsername);
      expect(response.data.user.role).toBe('user');

      authToken = response.data.token;
    });

    it('should reject login with invalid password', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/login`, {
          username: testUserUsername,
          password: 'wrongpassword',
        })
      ).rejects.toThrow('401');
    });

    it('should reject login with non-existent user', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/login`, {
          username: 'nonexistent',
          password: 'password',
        })
      ).rejects.toThrow('401');
    });

    it('should reject login without credentials', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/login`, {})
      ).rejects.toThrow('400');
    });

    it('should reject login with only username', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/login`, {
          username: testUserUsername,
        })
      ).rejects.toThrow('400');
    });

    it('should reject login with only password', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/login`, {
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should return user details on login (firstName, lastName, groupId, groupName)', async () => {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        username: testUserUsername,
        password: testUserPassword,
      });

      expect(response.status).toBe(200);
      expect(response.data.user).toHaveProperty('id');
      expect(response.data.user).toHaveProperty('username');
      expect(response.data.user).toHaveProperty('email');
      expect(response.data.user).toHaveProperty('role');
      expect(response.data.user).toHaveProperty('groupId');
      expect(response.data.user).toHaveProperty('groupName');
      expect(response.data.user).toHaveProperty('studentId');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await axios.post(`${API_BASE}/auth/logout`, {}, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('Logout successful');
    });
  });

  describe('GET /auth/config', () => {
    it('should return registrationEnabled flag', async () => {
      const response = await axios.get(`${API_BASE}/auth/config`);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('registrationEnabled');
      expect(typeof response.data.registrationEnabled).toBe('boolean');
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user info with valid token', async () => {
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: testUserUsername,
        password: testUserPassword,
      });

      const token = loginResponse.data.token;

      const response = await axios.get(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.user.username).toBe(testUserUsername);
    });

    it('should reject request without token', async () => {
      await expect(
        axios.get(`${API_BASE}/auth/me`)
      ).rejects.toThrow('401');
    });

    it('should reject request with invalid token', async () => {
      await expect(
        axios.get(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        })
      ).rejects.toThrow('401');
    });

    it('should return full user profile (firstName, lastName, role, groupId, studentId)', async () => {
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: testUserUsername,
        password: testUserPassword,
      });

      const token = loginResponse.data.token;

      const response = await axios.get(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.user).toHaveProperty('id');
      expect(response.data.user).toHaveProperty('username');
      expect(response.data.user).toHaveProperty('email');
      expect(response.data.user).toHaveProperty('firstName');
      expect(response.data.user).toHaveProperty('lastName');
      expect(response.data.user).toHaveProperty('role');
      expect(response.data.user).toHaveProperty('groupId');
      expect(response.data.user).toHaveProperty('groupName');
      expect(response.data.user).toHaveProperty('studentId');
    });
  });

  afterAll(async () => {
    for (const userId of [testUserId, fullUserId]) {
      if (userId) {
        try {
          await axios.delete(`${API_BASE}/users/${userId}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        } catch (_error) {
          // Ignore if already deleted
        }
      }
    }
  });
});
