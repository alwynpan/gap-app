const axios = require('axios');
const { API_BASE, waitForAPI } = require('./api');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_this_in_production';

describe('RBAC E2E Tests', () => {
  let adminToken = null;
  let userToken = null;
  let testGroupId = null;

  beforeAll(async () => {
    await waitForAPI();

    // Login as admin
    try {
      const adminResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      });
      adminToken = adminResponse.data.token;

      // Create a test group
      const groupResponse = await axios.post(`${API_BASE}/groups`, {
        name: `Test Group ${Date.now()}`,
      }, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      testGroupId = groupResponse.data.group.id;
    } catch (error) {
      console.warn('Admin setup failed - may need to run migrations first');
    }

    // Create and login as assignment manager
    try {
      const amUsername = `am_${Date.now()}`;
      await axios.post(`${API_BASE}/auth/register`, {
        username: amUsername,
        email: `${amUsername}@example.com`,
        password: 'password123',
      });

      // Admin updates role to assignment_manager (would need admin API for this)
      // For now, we'll skip assignment manager tests if setup fails
    } catch (error) {
      console.warn('Assignment manager setup failed');
    }

    // Create and login as regular user
    try {
      const userUsername = `user_${Date.now()}`;
      await axios.post(`${API_BASE}/auth/register`, {
        username: userUsername,
        email: `${userUsername}@example.com`,
        password: 'password123',
      });

      const userResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: userUsername,
        password: 'password123',
      });
      userToken = userResponse.data.token;
    } catch (error) {
      console.warn('User setup failed');
    }
  });

  describe('GET /groups', () => {
    it('should allow authenticated users to list groups', async () => {
      const response = await axios.get(`${API_BASE}/groups`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.groups)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await expect(
        axios.get(`${API_BASE}/groups`)
      ).rejects.toThrow('401');
    });
  });

  describe('POST /groups (Admin Only)', () => {
    it('should allow admin to create groups', async () => {
      const response = await axios.post(`${API_BASE}/groups`, {
        name: `Admin Created Group ${Date.now()}`,
      }, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(201);
      expect(response.data.group.name).toContain('Admin Created Group');
    });

    it('should reject non-admin users from creating groups', async () => {
      await expect(
        axios.post(`${API_BASE}/groups`, {
          name: 'Unauthorized Group',
        }, {
          headers: { Authorization: `Bearer ${userToken}` },
        })
      ).rejects.toThrow('403');
    });

    it('should reject unauthenticated requests', async () => {
      await expect(
        axios.post(`${API_BASE}/groups`, {
          name: 'Unauthorized Group',
        })
      ).rejects.toThrow('401');
    });
  });

  describe('GET /users (Admin/Assignment Manager Only)', () => {
    it('should allow admin to list users', async () => {
      const response = await axios.get(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.users)).toBe(true);
    });

    it('should reject regular users from listing users', async () => {
      await expect(
        axios.get(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${userToken}` },
        })
      ).rejects.toThrow('403');
    });
  });

  describe('PUT /users/:id/group (Admin/Assignment Manager Only)', () => {
    let testUserId = null;

    beforeEach(async () => {
      // Create a test user
      const uniqueUsername = `testuser_${Date.now()}`;
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: uniqueUsername,
        email: `${uniqueUsername}@example.com`,
        password: 'password123',
      });
      testUserId = response.data.user.id;
    });

    it('should allow admin to assign user to group', async () => {
      const response = await axios.put(
        `${API_BASE}/users/${testUserId}/group`,
        { groupId: testGroupId },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.user.groupId).toBe(testGroupId);
    });

    it('should allow admin to remove user from group', async () => {
      // First assign to group
      await axios.put(
        `${API_BASE}/users/${testUserId}/group`,
        { groupId: testGroupId },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      // Then remove from group
      const response = await axios.put(
        `${API_BASE}/users/${testUserId}/group`,
        { groupId: null },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.user.groupId).toBeNull();
    });

    it('should reject regular users from assigning groups', async () => {
      await expect(
        axios.put(
          `${API_BASE}/users/${testUserId}/group`,
          { groupId: testGroupId },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });

    it('should reject assignment to non-existent group', async () => {
      await expect(
        axios.put(
          `${API_BASE}/users/${testUserId}/group`,
          { groupId: '00000000-0000-0000-0000-000000000001' },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('404');
    });
  });

  describe('POST /users (Admin Only)', () => {
    it('should allow admin to create users', async () => {
      const uniqueUsername = `admincreated_${Date.now()}`;
      const response = await axios.post(
        `${API_BASE}/users`,
        {
          username: uniqueUsername,
          email: `${uniqueUsername}@example.com`,
          password: 'password123',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.user.username).toBe(uniqueUsername);
    });

    it('should reject non-admin users from creating users', async () => {
      await expect(
        axios.post(
          `${API_BASE}/users`,
          {
            username: 'unauthorized',
            email: 'unauthorized@example.com',
            password: 'password123',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });
  });

  describe('DELETE /users/:id (Admin Only)', () => {
    let testUserId = null;

    beforeEach(async () => {
      // Create a test user
      const uniqueUsername = `deletetest_${Date.now()}`;
      const response = await axios.post(`${API_BASE}/auth/register`, {
        username: uniqueUsername,
        email: `${uniqueUsername}@example.com`,
        password: 'password123',
      });
      testUserId = response.data.user.id;
    });

    it('should allow admin to delete users', async () => {
      const response = await axios.delete(
        `${API_BASE}/users/${testUserId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('User deleted successfully');
    });

    it('should prevent users from deleting their own account', async () => {
      // Get admin user ID
      const meResponse = await axios.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminId = meResponse.data.user.id;

      await expect(
        axios.delete(
          `${API_BASE}/users/${adminId}`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject non-admin users from deleting users', async () => {
      await expect(
        axios.delete(
          `${API_BASE}/users/${testUserId}`,
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });
  });

  describe('Role Hierarchy', () => {
    it('should enforce role-based access control', async () => {
      // Admin can access admin endpoints
      const adminGroupsResponse = await axios.get(`${API_BASE}/groups`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(adminGroupsResponse.status).toBe(200);

      // Regular user cannot access admin endpoints
      await expect(
        axios.post(`${API_BASE}/groups`, { name: 'Test' }, {
          headers: { Authorization: `Bearer ${userToken}` },
        })
      ).rejects.toThrow('403');
    });
  });

  afterAll(async () => {
    // Cleanup could be implemented here
  });
});
