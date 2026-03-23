const axios = require('axios');
const { API_BASE, waitForAPI } = require('./api');

describe('Authentication E2E Tests', () => {
  let authToken = null;
  let testUserId = null;

  const testUser = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'testpass123',
    studentId: `STU_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  beforeAll(async () => {
    await waitForAPI();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await axios.post(`${API_BASE}/auth/register`, testUser);
      
      expect(response.status).toBe(201);
      expect(response.data.message).toBe('User registered successfully');
      expect(response.data.user.username).toBe(testUser.username);
      expect(response.data.user.email).toBe(testUser.email);
      
      testUserId = response.data.user.id;
    });

    it('should reject registration with existing username', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          ...testUser,
          email: `different_${Date.now()}@example.com`,
        })
      ).rejects.toThrow('409');
    });

    it('should reject registration with existing email', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          ...testUser,
          username: `different_${Date.now()}`,
        })
      ).rejects.toThrow('409');
    });

    it('should reject registration with weak password', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `weakpass_${Date.now()}`,
          email: `weak_${Date.now()}@example.com`,
          password: '123',
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration without username', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          email: `noun_${Date.now()}@example.com`,
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration without email', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `noemail_${Date.now()}`,
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration without password', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `nopass_${Date.now()}`,
          email: `nopass_${Date.now()}@example.com`,
        })
      ).rejects.toThrow('400');
    });

    it('should reject registration with invalid email format', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `bademail_${Date.now()}`,
          email: 'invalid-email',
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should register with optional fields (firstName, lastName, studentId)', async () => {
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
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        username: testUser.username,
        password: testUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.data.token).toBeDefined();
      expect(response.data.user.username).toBe(testUser.username);
      expect(response.data.user.role).toBe('user');

      authToken = response.data.token;
    });

    it('should reject login with invalid password', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/login`, {
          username: testUser.username,
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
          username: testUser.username,
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
        username: testUser.username,
        password: testUser.password,
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

  describe('GET /auth/me', () => {
    it('should return current user info with valid token', async () => {
      // Login again to get fresh token
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: testUser.username,
        password: testUser.password,
      });
      
      const token = loginResponse.data.token;

      const response = await axios.get(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.user.username).toBe(testUser.username);
      expect(response.data.user.email).toBe(testUser.email);
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
        username: testUser.username,
        password: testUser.password,
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
    // Cleanup: In a real scenario, you might want to delete the test user
    // For now, we'll leave it as the database is ephemeral in tests
  });
});
