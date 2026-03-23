const axios = require('axios');
const { API_BASE, waitForAPI } = require('./api');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_this_in_production';

describe('Registration E2E Tests', () => {
  let adminToken = null;

  beforeAll(async () => {
    await waitForAPI();
    
    // Login as admin for cleanup operations
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      });
      adminToken = response.data.token;
    } catch (error) {
      console.warn('Admin login failed - may need to run migrations first');
    }
  });

  describe('Registration Validation', () => {
    it('should require username field', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          email: 'test@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should require email field', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: 'testuser',
          password: 'password123',
        })
      ).rejects.toThrow('400');
    });

    it('should require password field', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: 'testuser',
          email: 'test@example.com',
        })
      ).rejects.toThrow('400');
    });

    it('should validate email format', async () => {
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: `testuser_${Date.now()}`,
        email: 'invalid-email',
        password: 'password123',
      }).catch(err => err.response);

      // Should fail validation (either 400 or database constraint)
      expect(response.status).not.toBe(201);
    });

    it('should accept optional studentId field', async () => {
      const uniqueId = Date.now();
      const studentId = `STU${uniqueId}`;
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: `student_${uniqueId}`,
        email: `student_${uniqueId}@example.com`,
        password: 'password123',
        studentId,
      });

      expect(response.status).toBe(201);
      expect(response.data.user.studentId).toBe(studentId);
    });

    it('should assign default role (user) to new registrations', async () => {
      const uniqueId = Date.now();
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: `roleuser_${uniqueId}`,
        email: `roleuser_${uniqueId}@example.com`,
        password: 'password123',
      });

      expect(response.status).toBe(201);
      
      // Login to check role
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: `roleuser_${uniqueId}`,
        password: 'password123',
      });

      expect(loginResponse.data.user.role).toBe('user');
    });
  });

  describe('Registration Enabled/Disabled Toggle', () => {
    it('should respect REGISTRATION_ENABLED environment variable', async () => {
      // This test assumes REGISTRATION_ENABLED=true (default)
      // To test disabled state, you'd need to restart the server with REGISTRATION_ENABLED=false
      
      const uniqueId = Date.now();
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: `toggle_${uniqueId}`,
        email: `toggle_${uniqueId}@example.com`,
        password: 'password123',
      });

      // Should succeed with registration enabled
      expect(response.status).toBe(201);
    });
  });

  describe('User Uniqueness Constraints', () => {
    let uniqueUser = null;

    beforeEach(async () => {
      const uniqueId = Date.now();
      uniqueUser = {
        username: `unique_${uniqueId}`,
        email: `unique_${uniqueId}@example.com`,
        password: 'password123',
      };
    });

    it('should enforce unique username (exact match)', async () => {
      await axios.post(`${API_BASE}/auth/register`, uniqueUser);

      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          ...uniqueUser,
          email: `different_${Date.now()}@example.com`,
        })
      ).rejects.toThrow('409');
    });

    it('should enforce unique email', async () => {
      // Create first user
      await axios.post(`${API_BASE}/auth/register`, uniqueUser);

      // Try to create with different username but same email
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `different_${Date.now()}`,
          email: uniqueUser.email,
          password: 'password123',
        })
      ).rejects.toThrow('409');
    });
  });

  describe('Password Security', () => {
    it('should require minimum password length', async () => {
      await expect(
        axios.post(`${API_BASE}/auth/register`, {
          username: `shortpass_${Date.now()}`,
          email: `shortpass_${Date.now()}@example.com`,
          password: '12345', // 5 chars, need 6
        })
      ).rejects.toThrow('400');
    });

    it('should accept password with exactly 6 characters', async () => {
      const uniqueId = Date.now();
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: `minpass_${uniqueId}`,
        email: `minpass_${uniqueId}@example.com`,
        password: '123456',
      });

      expect(response.status).toBe(201);
    });
  });

  afterAll(async () => {
    // Cleanup could be implemented here if needed
  });
});
