import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function Groups() {
  const { user, isTeamManager } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API_BASE}/groups`);
      setGroups(response.data.groups || []);
    } catch (err) {
      setError('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      await axios.post(`${API_BASE}/groups`, { name: newGroupName.trim() });
      setSuccess('Group created successfully');
      setNewGroupName('');
      setShowCreateModal(false);
      fetchGroups();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleToggleEnabled = async (groupId, currentEnabled) => {
    try {
      await axios.put(`${API_BASE}/groups/${groupId}`, { enabled: !currentEnabled });
      setSuccess('Group updated successfully');
      fetchGroups();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update group');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      await axios.delete(`${API_BASE}/groups/${groupId}`);
      setSuccess('Group deleted successfully');
      fetchGroups();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete group');
      setTimeout(() => setError(''), 3000);
    }
  };

  const fetchGroupMembers = async (groupId) => {
    setMembersLoading(true);
    try {
      const [groupRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE}/groups/${groupId}`),
        isTeamManager ? axios.get(`${API_BASE}/users`) : Promise.resolve({ data: { users: [] } }),
      ]);
      setGroupMembers(groupRes.data.members || []);
      setAllUsers(usersRes.data.users || []);
    } catch (err) {
      setError('Failed to load group members');
      setTimeout(() => setError(''), 3000);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleExpandGroup = (groupId) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      setGroupMembers([]);
      setAllUsers([]);
      setSelectedUserId('');
      return;
    }
    setExpandedGroup(groupId);
    setSelectedUserId('');
    fetchGroupMembers(groupId);
  };

  const handleRemoveMember = async (userId) => {
    try {
      await axios.put(`${API_BASE}/users/${userId}/group`, { groupId: null });
      setSuccess('Member removed successfully');
      setTimeout(() => setSuccess(''), 3000);
      fetchGroupMembers(expandedGroup);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove member');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    try {
      await axios.put(`${API_BASE}/users/${parseInt(selectedUserId)}/group`, { groupId: expandedGroup });
      setSuccess('Member added successfully');
      setSelectedUserId('');
      setTimeout(() => setSuccess(''), 3000);
      fetchGroupMembers(expandedGroup);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add member');
      setTimeout(() => setError(''), 3000);
    }
  };

  const availableUsers = allUsers.filter(
    (u) => !groupMembers.some((m) => m.id === u.id)
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-primary-600">G.A.P. Portal</h1>
              <span className="ml-4 text-sm text-gray-500">Group Management</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user?.username}</span>
              <a href="/dashboard" className="text-sm text-primary-600 hover:text-primary-700">
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Manage Groups</h2>
              <p className="text-gray-600 mt-1">Create and manage team groups</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
            >
              + Create Group
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
              {success}
            </div>
          )}

          {/* Groups Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <div
                key={group.id}
                className={`bg-white shadow rounded-lg overflow-hidden ${!group.enabled ? 'opacity-60' : ''}`}
              >
                <div
                  className="px-6 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleExpandGroup(group.id)}
                >
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        group.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {group.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Created: {new Date(group.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Members Section */}
                {expandedGroup === group.id && (
                  <div className="px-6 py-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Members</h4>
                    {membersLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                      </div>
                    ) : (
                      <>
                        {groupMembers.length === 0 ? (
                          <p className="text-sm text-gray-500 py-2">No members in this group</p>
                        ) : (
                          <ul className="divide-y divide-gray-100">
                            {groupMembers.map((member) => (
                              <li key={member.id} className="flex items-center justify-between py-2">
                                <div>
                                  <span className="text-sm font-medium text-gray-900">{member.username}</span>
                                  <span className="text-sm text-gray-500 ml-2">{member.email}</span>
                                  <span
                                    className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                      member.role_name === 'admin'
                                        ? 'bg-red-100 text-red-800'
                                        : member.role_name === 'team_manager'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-green-100 text-green-800'
                                    }`}
                                  >
                                    {member.role_name}
                                  </span>
                                </div>
                                {isTeamManager && (
                                  <button
                                    onClick={() => handleRemoveMember(member.id)}
                                    className="text-sm text-red-600 hover:text-red-800"
                                  >
                                    Remove
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isTeamManager && availableUsers.length > 0 && (
                          <div className="mt-3 flex items-center space-x-2">
                            <select
                              value={selectedUserId}
                              onChange={(e) => setSelectedUserId(e.target.value)}
                              className="border border-gray-300 rounded-md px-2 py-1 text-sm flex-1"
                            >
                              <option value="">Select a user to add</option>
                              {availableUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.username} ({u.email})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleAddMember}
                              className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="bg-gray-50 px-6 py-3 flex justify-between items-center">
                  <button
                    onClick={() => handleToggleEnabled(group.id, group.enabled)}
                    className={`text-sm ${
                      group.enabled ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'
                    }`}
                  >
                    {group.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {groups.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No groups created yet</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
              >
                Create your first group
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter group name"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewGroupName('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Groups;
