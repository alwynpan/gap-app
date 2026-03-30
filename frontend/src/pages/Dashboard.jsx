import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import Header from '../components/Header.jsx';
import { Link } from 'react-router-dom';
import { formatRoleName } from '../utils/formatting.js';
import { API_BASE } from '../config.js';

function Dashboard() {
  const { user, isAdmin, isAssignmentManager, refreshUser } = useAuth();
  const [availableGroups, setAvailableGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [groupSuccess, setGroupSuccess] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [groupJoinLocked, setGroupJoinLocked] = useState(false);
  const isNormalUser = !isAdmin && !isAssignmentManager;

  useEffect(() => {
    if (isNormalUser && !user?.groupId) {
      fetchAvailableGroups();
      setGroupMembers([]);
    }
    if (isNormalUser && user?.groupId) {
      fetchGroupMembers(user.groupId);
    }
  }, [isNormalUser, user?.groupId]);

  useEffect(() => {
    if (isNormalUser) {
      (async () => {
        try {
          const res = await axios.get(`${API_BASE}/config/group-join-locked`);
          setGroupJoinLocked(res.data.locked === true);
        } catch (_err) {
          // silently ignore — lock defaults to off
        }
      })();
    }
  }, [isNormalUser]);

  const fetchGroupMembers = async (groupId) => {
    setMembersLoading(true);
    setGroupMembers([]);
    try {
      const response = await axios.get(`${API_BASE}/groups/${groupId}`);
      setGroupMembers(response.data.members || []);
    } catch (_err) {
      // silently ignore — members list is supplementary info
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchAvailableGroups = async () => {
    setGroupsLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/groups/enabled`);
      const groups = response.data.groups || [];
      setAvailableGroups(groups.filter((g) => g.max_members === null || g.member_count < g.max_members));
    } catch (_err) {
      setGroupError('Failed to load available groups');
      setTimeout(() => setGroupError(''), 3000);
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleJoinGroup = async (groupId) => {
    setJoiningGroup(true);
    try {
      await axios.post(`${API_BASE}/groups/${groupId}/join`);
      setGroupSuccess('Successfully joined group');
      await refreshUser();
      setTimeout(() => setGroupSuccess(''), 2000);
    } catch (err) {
      setGroupError(err.response?.data?.error || 'Failed to join group');
      setTimeout(() => setGroupError(''), 3000);
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleFeelingLucky = async () => {
    if (availableGroups.length === 0) {
      setGroupError('No available group to join');
      setTimeout(() => setGroupError(''), 3000);
      return;
    }
    const nonEmpty = availableGroups.filter((g) => g.member_count > 0);
    const pool = nonEmpty.length > 0 ? nonEmpty : availableGroups;
    const randomGroup = pool[Math.floor(Math.random() * pool.length)];
    await handleJoinGroup(randomGroup.id);
  };

  const handleLeaveGroup = async () => {
    if (!user?.groupId) {
      return;
    }
    setLeavingGroup(true);
    try {
      await axios.post(`${API_BASE}/groups/${user.groupId}/leave`);
      setGroupSuccess('Successfully left group');
      await refreshUser();
      setTimeout(() => setGroupSuccess(''), 2000);
    } catch (err) {
      setGroupError(err.response?.data?.error || 'Failed to leave group');
      setTimeout(() => setGroupError(''), 3000);
    } finally {
      setLeavingGroup(false);
    }
  };

  return (
    <div className="flex-1 bg-gray-50">
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
            <p className="text-gray-600 mt-1">Welcome back, {user?.username}!</p>
          </div>

          {/* User Info Card */}
          <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Your Profile</h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Username</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user?.username}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {user?.firstName} {user?.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user?.email}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Role</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatRoleName(user?.role)}</dd>
                </div>
                {isNormalUser && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Group</dt>
                    <dd className="mt-1 text-sm text-gray-900">{user?.groupName || 'Not assigned'}</dd>
                  </div>
                )}
                {user?.studentId && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Student ID</dt>
                    <dd className="mt-1 text-sm text-gray-900">{user.studentId}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Admin/Assignment Manager Links */}
          {(isAdmin || isAssignmentManager) && (
            <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Administration</h3>
                <div className="space-y-3">
                  {isAssignmentManager && (
                    <Link
                      to="/users"
                      className="block w-full text-left px-4 py-2 bg-primary-50 text-primary-700 rounded-md hover:bg-primary-100 transition-colors"
                    >
                      👥 Manage Users
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      to="/groups"
                      className="block w-full text-left px-4 py-2 bg-primary-50 text-primary-700 rounded-md hover:bg-primary-100 transition-colors"
                    >
                      📁 Manage Groups
                    </Link>
                  )}
                  <Link
                    to="/settings"
                    className="block w-full text-left px-4 py-2 bg-primary-50 text-primary-700 rounded-md hover:bg-primary-100 transition-colors"
                  >
                    ⚙️ Settings
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Normal User Group Section */}
          {isNormalUser && (
            <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">My Group</h3>

                {groupError && (
                  <div className="mb-3 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm">
                    {groupError}
                  </div>
                )}

                {groupSuccess && (
                  <div className="mb-3 bg-green-50 border border-green-200 text-green-600 px-3 py-2 rounded-md text-sm">
                    {groupSuccess}
                  </div>
                )}

                {user?.groupId ? (
                  <div>
                    <div className="flex items-center justify-between bg-primary-50 rounded-md px-4 py-3 mb-4">
                      <p className="text-sm font-medium text-gray-900">
                        You are in: <span className="text-primary-700">{user.groupName}</span>
                      </p>
                      {!groupJoinLocked && (
                        <button
                          onClick={handleLeaveGroup}
                          disabled={leavingGroup}
                          className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {leavingGroup ? 'Leaving...' : 'Leave Group'}
                        </button>
                      )}
                    </div>
                    {groupJoinLocked && (
                      <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-md text-sm">
                        Group joining is locked. Please contact the teaching staff to join or leave a group.
                      </div>
                    )}

                    <h4 className="text-sm font-medium text-gray-700 mb-2">Group Members</h4>
                    {membersLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                      </div>
                    ) : groupMembers.length === 0 ? (
                      <p className="text-sm text-gray-500 py-2">No members yet</p>
                    ) : (
                      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
                        {groupMembers.map((member) => (
                          <li key={member.id} className="flex items-center gap-3 px-4 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-gray-900">
                                {member.first_name && member.last_name
                                  ? `${member.first_name.charAt(0)}. ${member.last_name}`
                                  : member.username}
                              </span>
                              {member.id === user.id && (
                                <span className="ml-2 text-xs text-primary-600 font-medium">(you)</span>
                              )}
                            </div>
                            <span className="text-sm text-gray-500 truncate">{member.email}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div>
                    {groupJoinLocked ? (
                      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-md text-sm">
                        Group joining is locked. Please contact the teaching staff to join or leave a group.
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 mb-3">
                          You are not assigned to any group. Join an available group below:
                        </p>
                        <button
                          onClick={handleFeelingLucky}
                          disabled={joiningGroup || groupsLoading}
                          className="mb-4 w-full px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {joiningGroup ? 'Joining...' : "🍀 I'm Feeling Lucky"}
                        </button>
                        {groupsLoading ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                          </div>
                        ) : availableGroups.length === 0 ? (
                          <p className="text-sm text-gray-500 py-2">No available groups to join</p>
                        ) : (
                          <ul className="divide-y divide-gray-200">
                            {availableGroups.map((group) => (
                              <li key={group.id} className="flex items-center justify-between py-3">
                                <div>
                                  <span className="text-sm font-medium text-gray-900">{group.name}</span>
                                  <span className="ml-2 text-sm text-gray-500">
                                    ({group.member_count}
                                    {group.max_members !== null && group.max_members !== undefined
                                      ? ` / ${group.max_members}`
                                      : ''}{' '}
                                    members)
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleJoinGroup(group.id)}
                                  disabled={joiningGroup}
                                  className="text-sm bg-primary-600 text-white px-3 py-1 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {joiningGroup ? 'Joining...' : 'Join'}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
