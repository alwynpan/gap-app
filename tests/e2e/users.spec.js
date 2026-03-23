const axios = require('axios');
const { API_BASE, waitForAPI } = require('./api');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_this_in_production';

describe('Users API E2E Tests', () => {
  let adminToken = null;
  let userToken = null;
  let testUserId = null;

  beforeAll(async () => {
    await waitForAPI();

    // Login as admin
    const adminResponse = await axios.post(`${API_BASE}/auth/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });
    adminToken = adminResponse.data.token;

    // Create a test user for group operations
    const userUsername = `testuser_${Date.now()}`;
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
    testUserId = userResponse.data.user.id;
  });

  describe('GET /users (Admin/Assignment Manager Only)', () => {
    it('should allow admin to list all users', async () => {
      const response = await axios.get(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.users)).toBe(true);
      expect(response.data.users.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated requests', async () => {
      await expect(axios.get(`${API_BASE}/users`)).rejects.toThrow('401');
    });

    it('should reject regular users from listing users', async () => {
      await expect(
        axios.get(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${userToken}` },
        })
      ).rejects.toThrow('403');
    });
  });

  describe('GET /users/:id', () => {
    let newUserId = null;

    beforeEach(async () => {
      const uniqueUsername = `getuser_${Date.now()}`;
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
      newUserId = response.data.user.id;
    });

    it('should allow admin to get user by ID', async () => {
      const response = await axios.get(`${API_BASE}/users/${newUserId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.data.user.id).toBe(newUserId);
      expect(response.data.user).not.toHaveProperty('password_hash');
    });

    it('should allow users to view their own profile', async () => {
      const response = await axios.get(`${API_BASE}/users/${testUserId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.data.user.id).toBe(testUserId);
    });

    it('should reject users from viewing other users profiles', async () => {
      await expect(
        axios.get(`${API_BASE}/users/${newUserId}`, {
          headers: { Authorization: `Bearer ${userToken}` },
        })
      ).rejects.toThrow('403');
    });

    it('should reject unauthenticated requests', async () => {
      await expect(axios.get(`${API_BASE}/users/${newUserId}`)).rejects.toThrow('401');
    });

    it('should return 404 for non-existent user', async () => {
      await expect(
        axios.get(`${API_BASE}/users/00000000-0000-0000-0000-000000000001`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).rejects.toThrow('404');
    });
  });

  describe('POST /users (Admin/Assignment Manager Only)', () => {
    it('should allow admin to create a new user', async () => {
      const uniqueUsername = `created_${Date.now()}`;
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
      expect(response.data.message).toBe('User created successfully');
      expect(response.data.user.username).toBe(uniqueUsername);
    });

    it('should allow admin to create user with optional fields', async () => {
      const uniqueUsername = `fulluser_${Date.now()}`;
      const response = await axios.post(
        `${API_BASE}/users`,
        {
          username: uniqueUsername,
          email: `${uniqueUsername}@example.com`,
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          studentId: `STU${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(201);
    });

    it('should reject creation with existing username', async () => {
      const uniqueUsername = `dup_${Date.now()}`;
      await axios.post(
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

      await expect(
        axios.post(
          `${API_BASE}/users`,
          {
            username: uniqueUsername,
            email: `different_${Date.now()}@example.com`,
            password: 'password123',
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('409');
    });

    it('should reject creation with existing email', async () => {
      const uniqueUsername = `dupemail_${Date.now()}`;
      await axios.post(
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

      await expect(
        axios.post(
          `${API_BASE}/users`,
          {
            username: `different_${Date.now()}`,
            email: `${uniqueUsername}@example.com`,
            password: 'password123',
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('409');
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

    it('should reject unauthenticated requests', async () => {
      await expect(
        axios.post(`${API_BASE}/users`, {
          username: 'unauth',
          email: 'unauth@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('401');
    });

    it('should reject creation without required fields', async () => {
      await expect(
        axios.post(
          `${API_BASE}/users`,
          {
            username: 'missing_fields',
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject non-admin from creating admin users', async () => {
      // First create a regular user (done above), then try to create admin
      // Actually we need a non-admin user to try this - use userToken
      await expect(
        axios.post(
          `${API_BASE}/users`,
          {
            username: 'admin_attempt',
            email: 'admin_attempt@example.com',
            password: 'password123',
            role: 'admin',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });
  });

  describe('PUT /users/:id (Admin/User self-edit)', () => {
    let newUserId = null;

    beforeEach(async () => {
      const uniqueUsername = `edituser_${Date.now()}`;
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
      newUserId = response.data.user.id;
    });

    it('should allow admin to update any user', async () => {
      const response = await axios.put(
        `${API_BASE}/users/${newUserId}`,
        {
          firstName: 'Updated',
          lastName: 'Name',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('User updated successfully');
    });

    it('should allow users to update their own profile', async () => {
      const response = await axios.put(
        `${API_BASE}/users/${testUserId}`,
        {
          firstName: 'SelfUpdated',
        },
        {
          headers: { Authorization: `Bearer ${userToken}` },
        }
      );

      expect(response.status).toBe(200);
    });

    it('should reject users from updating other users', async () => {
      await expect(
        axios.put(
          `${API_BASE}/users/${newUserId}`,
          {
            firstName: 'Hacked',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });

    it('should return 404 for non-existent user', async () => {
      await expect(
        axios.put(
          `${API_BASE}/users/00000000-0000-0000-0000-000000000001`,
          {
            firstName: 'Test',
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('404');
    });
  });

  describe('PUT /users/:id/password', () => {
    let newUserId = null;
    let newUsername = null;

    beforeEach(async () => {
      newUsername = `passuser_${Date.now()}`;
      const response = await axios.post(
        `${API_BASE}/users`,
        {
          username: newUsername,
          email: `${newUsername}@example.com`,
          password: 'password123',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      newUserId = response.data.user.id;
    });

    it('should allow admin to change any user password', async () => {
      const response = await axios.put(
        `${API_BASE}/users/${newUserId}/password`,
        {
          newPassword: 'newpassword456',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('Password updated successfully');

      // Verify new password works
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: newUsername,
        password: 'newpassword456',
      });
      expect(loginResponse.status).toBe(200);
    });

    it('should allow users to change their own password', async () => {
      // First login with current password
      const currentUserResponse = await axios.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const currentUserId = currentUserResponse.data.user.id;

      const response = await axios.put(
        `${API_BASE}/users/${currentUserId}/password`,
        {
          currentPassword: 'password123',
          newPassword: 'mynewpassword',
        },
        {
          headers: { Authorization: `Bearer ${userToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('Password updated successfully');
    });

    it('should reject users from changing other users passwords', async () => {
      await expect(
        axios.put(
          `${API_BASE}/users/${newUserId}/password`,
          {
            newPassword: 'hacked',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });

    it('should reject password change with weak password', async () => {
      await expect(
        axios.put(
          `${API_BASE}/users/${testUserId}/password`,
          {
            currentPassword: 'password123',
            newPassword: '123',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject non-admin password change without current password', async () => {
      await expect(
        axios.put(
          `${API_BASE}/users/${testUserId}/password`,
          {
            newPassword: 'newpass123',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('400');
    });
  });

  describe('DELETE /users/:id (Admin Only)', () => {
    it('should allow admin to delete users', async () => {
      const uniqueUsername = `todelete_${Date.now()}`;
      const createResponse = await axios.post(
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
      const userIdToDelete = createResponse.data.user.id;

      const response = await axios.delete(`${API_BASE}/users/${userIdToDelete}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('User deleted successfully');
    });

    it('should return 404 when deleting non-existent user', async () => {
      await expect(
        axios.delete(`${API_BASE}/users/00000000-0000-0000-0000-000000000001`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).rejects.toThrow('404');
    });
  });
});
