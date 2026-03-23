const axios = require('axios');
const { API_BASE, waitForAPI } = require('./api');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_this_in_production';

describe('Groups API E2E Tests', () => {
  let adminToken = null;
  let userToken = null;
  let testGroupId = null;
  let testUserId = null;

  beforeAll(async () => {
    await waitForAPI();

    // Login as admin
    const adminResponse = await axios.post(`${API_BASE}/auth/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });
    adminToken = adminResponse.data.token;

    // Create a test group
    const groupResponse = await axios.post(
      `${API_BASE}/groups`,
      {
        name: `Test Group ${Date.now()}`,
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    testGroupId = groupResponse.data.group.id;

    // Create and login as regular user
    const userUsername = `groupuser_${Date.now()}`;
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

  describe('GET /groups', () => {
    it('should allow authenticated users to list all groups', async () => {
      const response = await axios.get(`${API_BASE}/groups`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.groups)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await expect(axios.get(`${API_BASE}/groups`)).rejects.toThrow('401');
    });

    it('should include member_count for each group', async () => {
      const response = await axios.get(`${API_BASE}/groups`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.status).toBe(200);
      response.data.groups.forEach((group) => {
        expect(group).toHaveProperty('member_count');
      });
    });
  });

  describe('GET /groups/enabled', () => {
    it('should allow authenticated users to list enabled groups', async () => {
      const response = await axios.get(`${API_BASE}/groups/enabled`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.groups)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await expect(axios.get(`${API_BASE}/groups/enabled`)).rejects.toThrow('401');
    });
  });

  describe('GET /groups/:id', () => {
    it('should allow authenticated users to get group by ID', async () => {
      const response = await axios.get(`${API_BASE}/groups/${testGroupId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.data.group.id).toBe(testGroupId);
      expect(response.data.group).toHaveProperty('name');
      expect(response.data.group).toHaveProperty('enabled');
      expect(response.data.group).toHaveProperty('maxMembers');
      expect(response.data.group).toHaveProperty('memberCount');
      expect(Array.isArray(response.data.members)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await expect(axios.get(`${API_BASE}/groups/${testGroupId}`)).rejects.toThrow('401');
    });

    it('should return 404 for non-existent group', async () => {
      await expect(
        axios.get(`${API_BASE}/groups/00000000-0000-0000-0000-000000000001`, {
          headers: { Authorization: `Bearer ${userToken}` },
        })
      ).rejects.toThrow('404');
    });
  });

  describe('POST /groups (Admin Only)', () => {
    it('should allow admin to create a group', async () => {
      const response = await axios.post(
        `${API_BASE}/groups`,
        {
          name: `Created Group ${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.message).toBe('Group created successfully');
      expect(response.data.group.name).toContain('Created Group');
    });

    it('should allow admin to create group with maxMembers', async () => {
      const response = await axios.post(
        `${API_BASE}/groups`,
        {
          name: `Limited Group ${Date.now()}`,
          maxMembers: 5,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.group.maxMembers).toBe(5);
    });

    it('should allow admin to create disabled group', async () => {
      const response = await axios.post(
        `${API_BASE}/groups`,
        {
          name: `Disabled Group ${Date.now()}`,
          enabled: false,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.group.enabled).toBe(false);
    });

    it('should reject creation without name', async () => {
      await expect(
        axios.post(
          `${API_BASE}/groups`,
          {},
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject creation with invalid maxMembers', async () => {
      await expect(
        axios.post(
          `${API_BASE}/groups`,
          {
            name: `Bad Group ${Date.now()}`,
            maxMembers: -1,
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject non-admin users from creating groups', async () => {
      await expect(
        axios.post(
          `${API_BASE}/groups`,
          {
            name: 'Unauthorized Group',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });

    it('should reject unauthenticated requests', async () => {
      await expect(
        axios.post(`${API_BASE}/groups`, {
          name: 'Unauthorized Group',
        })
      ).rejects.toThrow('401');
    });

    it('should reject duplicate group name (case-insensitive)', async () => {
      const uniqueName = `Unique Group ${Date.now()}`;
      await axios.post(
        `${API_BASE}/groups`,
        { name: uniqueName },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      await expect(
        axios.post(
          `${API_BASE}/groups`,
          { name: uniqueName.toUpperCase() },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('409');
    });
  });

  describe('PUT /groups/:id (Admin Only)', () => {
    let newGroupId = null;

    beforeEach(async () => {
      const response = await axios.post(
        `${API_BASE}/groups`,
        {
          name: `To Update ${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      newGroupId = response.data.group.id;
    });

    afterEach(async () => {
      // Cleanup: delete the test group after each test
      try {
        await axios.delete(`${API_BASE}/groups/${newGroupId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch (_error) {
        // Ignore if already deleted
      }
    });

    it('should allow admin to update group name', async () => {
      const response = await axios.put(
        `${API_BASE}/groups/${newGroupId}`,
        {
          name: `Updated Group Name ${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.group.name).toContain('Updated Group Name');
    });

    it('should allow admin to enable/disable group', async () => {
      // First disable
      let response = await axios.put(
        `${API_BASE}/groups/${newGroupId}`,
        {
          enabled: false,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.group.enabled).toBe(false);

      // Then re-enable
      response = await axios.put(
        `${API_BASE}/groups/${newGroupId}`,
        {
          enabled: true,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.group.enabled).toBe(true);
    });

    it('should allow admin to update maxMembers', async () => {
      const response = await axios.put(
        `${API_BASE}/groups/${newGroupId}`,
        {
          maxMembers: 10,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.group.max_members).toBe(10);
    });

    it('should reject updating maxMembers below current member count', async () => {
      // First add a member to the group
      const userUsername = `member_${Date.now()}`;
      await axios.post(`${API_BASE}/auth/register`, {
        username: userUsername,
        email: `${userUsername}@example.com`,
        password: 'password123',
      });

      const userResponse = await axios.post(`${API_BASE}/auth/login`, {
        username: userUsername,
        password: 'password123',
      });

      const userId = userResponse.data.user.id;

      // Assign user to group
      await axios.put(
        `${API_BASE}/users/${userId}/group`,
        { groupId: newGroupId },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      // Try to set maxMembers to 0 (below current count of 1)
      await expect(
        axios.put(
          `${API_BASE}/groups/${newGroupId}`,
          {
            maxMembers: 0,
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject non-admin users from updating groups', async () => {
      await expect(
        axios.put(
          `${API_BASE}/groups/${newGroupId}`,
          {
            name: 'Hacked Name',
          },
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('403');
    });

    it('should return 404 for non-existent group', async () => {
      await expect(
        axios.put(
          `${API_BASE}/groups/00000000-0000-0000-0000-000000000001`,
          {
            name: 'Test',
          },
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      ).rejects.toThrow('404');
    });
  });

  describe('DELETE /groups/:id (Admin Only)', () => {
    it('should allow admin to delete groups', async () => {
      const createResponse = await axios.post(
        `${API_BASE}/groups`,
        {
          name: `To Delete ${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const groupIdToDelete = createResponse.data.group.id;

      const response = await axios.delete(`${API_BASE}/groups/${groupIdToDelete}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('Group deleted successfully');
    });

    it('should reject non-admin users from deleting groups', async () => {
      await expect(
        axios.delete(`${API_BASE}/groups/${testGroupId}`, {
          headers: { Authorization: `Bearer ${userToken}` },
        })
      ).rejects.toThrow('403');
    });

    it('should return 404 for non-existent group', async () => {
      await expect(
        axios.delete(`${API_BASE}/groups/00000000-0000-0000-0000-000000000001`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).rejects.toThrow('404');
    });
  });

  describe('POST /groups/:id/join', () => {
    it('should allow user to join an enabled group', async () => {
      const response = await axios.post(
        `${API_BASE}/groups/${testGroupId}/join`,
        {},
        {
          headers: { Authorization: `Bearer ${userToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.message).toContain('Successfully joined');
    });

    it('should reject joining when already in a group', async () => {
      // User is already in testGroupId from previous test
      await expect(
        axios.post(
          `${API_BASE}/groups/${testGroupId}/join`,
          {},
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject joining a disabled group', async () => {
      // First leave current group
      await axios.post(
        `${API_BASE}/groups/${testGroupId}/leave`,
        {},
        {
          headers: { Authorization: `Bearer ${userToken}` },
        }
      );

      // Create a disabled group
      const disabledResponse = await axios.post(
        `${API_BASE}/groups`,
        {
          name: `Disabled Join Test ${Date.now()}`,
          enabled: false,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      const disabledGroupId = disabledResponse.data.group.id;

      await expect(
        axios.post(
          `${API_BASE}/groups/${disabledGroupId}/join`,
          {},
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('400');
    });

    it('should reject unauthenticated requests', async () => {
      await expect(
        axios.post(`${API_BASE}/groups/${testGroupId}/join`, {})
      ).rejects.toThrow('401');
    });

    it('should return 404 for non-existent group', async () => {
      await expect(
        axios.post(
          `${API_BASE}/groups/00000000-0000-0000-0000-000000000001/join`,
          {},
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('404');
    });
  });

  describe('POST /groups/:id/leave', () => {
    beforeEach(async () => {
      // Ensure user is in the group before each test
      await axios.put(
        `${API_BASE}/users/${testUserId}/group`,
        { groupId: testGroupId },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
    });

    it('should allow user to leave their group', async () => {
      const response = await axios.post(
        `${API_BASE}/groups/${testGroupId}/leave`,
        {},
        {
          headers: { Authorization: `Bearer ${userToken}` },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('Successfully left group');
    });

    it('should return 400 when leaving a group not in', async () => {
      // beforeEach puts user in the group; first leave succeeds, second should fail
      await axios.post(
        `${API_BASE}/groups/${testGroupId}/leave`,
        {},
        { headers: { Authorization: `Bearer ${userToken}` } }
      );

      await expect(
        axios.post(
          `${API_BASE}/groups/${testGroupId}/leave`,
          {},
          { headers: { Authorization: `Bearer ${userToken}` } }
        )
      ).rejects.toThrow('400');
    });

    it('should reject unauthenticated requests', async () => {
      await expect(
        axios.post(`${API_BASE}/groups/${testGroupId}/leave`, {})
      ).rejects.toThrow('401');
    });

    it('should return 404 for non-existent group', async () => {
      await expect(
        axios.post(
          `${API_BASE}/groups/00000000-0000-0000-0000-000000000001/leave`,
          {},
          {
            headers: { Authorization: `Bearer ${userToken}` },
          }
        )
      ).rejects.toThrow('404');
    });
  });
});
