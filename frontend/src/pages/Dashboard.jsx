import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/utils/api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from '../components/Header.jsx';
import { Link } from 'react-router-dom';
import { formatRoleName } from '../utils/formatting.js';
import { API_BASE } from '../config.js';

const LOCKED_MESSAGE = 'Group joining is locked. Please contact the teaching staff to join or leave a group.';

function Spinner() {
  return (
    <div className="flex justify-center py-4">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>
  );
}

function MemberList({ loading, members, currentUserId }) {
  if (loading) {
    return <Spinner />;
  }
  if (members.length === 0) {
    return <p className="text-sm text-gray-500 py-2">No members yet</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
      {members.map((member) => (
        <li key={member.id} className="flex items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-gray-900">
              {member.first_name && member.last_name
                ? `${member.first_name.charAt(0)}. ${member.last_name}`
                : member.username}
            </span>
            {member.id === currentUserId && <span className="ml-2 text-xs text-primary-600 font-medium">(you)</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Dashboard() {
  const {
    user,
    isAdmin,
    isAssignmentManager,
    refreshUser,
    memberships = [],
    currentSubjectId,
    setCurrentSubject,
  } = useAuth();
  const [subjectData, setSubjectData] = useState(new Map()); // subjectId -> { loading, error, assignments }
  const [assignmentGroups, setAssignmentGroups] = useState(new Map()); // assignmentId -> { loading, error, groups }
  const [expandedAssignments, setExpandedAssignments] = useState(new Map()); // assignmentId -> boolean
  const [groupMembers, setGroupMembers] = useState(new Map()); // groupId -> { loading, members }
  const [groupError, setGroupError] = useState('');
  const [groupSuccess, setGroupSuccess] = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [groupJoinLocked, setGroupJoinLocked] = useState(false);
  const isNormalUser = !isAdmin && !isAssignmentManager;
  const subjects = useMemo(() => user?.subjects ?? [], [user]);
  // The one subject whose card is shown; single-subject users land straight on theirs.
  const selectedSubject = useMemo(() => {
    const match = subjects.find((subject) => subject.id === currentSubjectId);
    if (match) {
      return match;
    }
    return subjects.length === 1 ? subjects[0] : null;
  }, [subjects, currentSubjectId]);

  useEffect(() => {
    if (isNormalUser) {
      (async () => {
        try {
          const res = await api.get(`${API_BASE}/config/group-join-locked`);
          setGroupJoinLocked(res.data.locked === true);
        } catch (_err) {
          // silently ignore — lock defaults to off
        }
      })();
    }
  }, [isNormalUser]);

  const fetchSubject = useCallback(async (subjectId) => {
    setSubjectData((prev) => new Map(prev).set(subjectId, { loading: true, error: '', assignments: [] }));
    try {
      const response = await api.get(`${API_BASE}/subjects/${subjectId}`);
      setSubjectData((prev) =>
        new Map(prev).set(subjectId, {
          loading: false,
          error: '',
          assignments: response.data.assignments || [],
        })
      );
    } catch (_err) {
      setSubjectData((prev) =>
        new Map(prev).set(subjectId, {
          loading: false,
          error: 'Failed to load subject details',
          assignments: [],
        })
      );
    }
  }, []);

  const fetchAssignmentGroups = useCallback(async (assignmentId) => {
    setAssignmentGroups((prev) => new Map(prev).set(assignmentId, { loading: true, error: '', groups: [] }));
    try {
      const response = await api.get(`${API_BASE}/assignments/${assignmentId}/groups?enabled=true`);
      const groups = (response.data.groups || []).filter(
        (g) => g.max_members === null || g.max_members === undefined || g.member_count < g.max_members
      );
      setAssignmentGroups((prev) => new Map(prev).set(assignmentId, { loading: false, error: '', groups }));
    } catch (_err) {
      setAssignmentGroups((prev) =>
        new Map(prev).set(assignmentId, {
          loading: false,
          error: 'Failed to load available groups',
          groups: [],
        })
      );
    }
  }, []);

  const fetchGroupMembers = useCallback(async (groupId) => {
    setGroupMembers((prev) => new Map(prev).set(groupId, { loading: true, members: [] }));
    try {
      const response = await api.get(`${API_BASE}/groups/${groupId}`);
      setGroupMembers((prev) => new Map(prev).set(groupId, { loading: false, members: response.data.members || [] }));
    } catch (_err) {
      // silently ignore — members list is supplementary info
      setGroupMembers((prev) => new Map(prev).set(groupId, { loading: false, members: [] }));
    }
  }, []);

  // Fetch each subject's assignments once
  useEffect(() => {
    if (!isNormalUser) {
      return;
    }
    subjects.forEach((subject) => {
      if (!subjectData.has(subject.id)) {
        fetchSubject(subject.id);
      }
    });
  }, [isNormalUser, subjects, subjectData, fetchSubject]);

  // Fetch joinable groups for assignments the user has no membership in
  useEffect(() => {
    if (!isNormalUser) {
      return;
    }
    subjectData.forEach((data) => {
      data.assignments.forEach((assignment) => {
        const hasMembership = memberships.some((m) => m.assignment_id === assignment.id);
        if (!hasMembership && !assignmentGroups.has(assignment.id)) {
          fetchAssignmentGroups(assignment.id);
        }
      });
    });
  }, [isNormalUser, subjectData, memberships, assignmentGroups, fetchAssignmentGroups]);

  const handleJoinGroup = async (groupId) => {
    setJoiningGroup(true);
    try {
      await api.post(`${API_BASE}/groups/${groupId}/join`);
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

  const handleFeelingLucky = async (assignmentId) => {
    const availableGroups = assignmentGroups.get(assignmentId)?.groups ?? [];
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

  const handleLeaveGroup = async (assignmentId, groupId) => {
    setLeavingGroup(true);
    try {
      await api.post(`${API_BASE}/groups/${groupId}/leave`);
      setGroupSuccess('Successfully left group');
      await refreshUser();
      setExpandedAssignments((prev) => new Map(prev).set(assignmentId, false));
      setGroupMembers((prev) => {
        const next = new Map(prev);
        next.delete(groupId);
        return next;
      });
      await fetchAssignmentGroups(assignmentId);
      setTimeout(() => setGroupSuccess(''), 2000);
    } catch (err) {
      setGroupError(err.response?.data?.error || 'Failed to leave group');
      setTimeout(() => setGroupError(''), 3000);
    } finally {
      setLeavingGroup(false);
    }
  };

  const toggleMembers = (assignmentId, groupId) => {
    const expanded = !expandedAssignments.get(assignmentId);
    setExpandedAssignments((prev) => new Map(prev).set(assignmentId, expanded));
    if (expanded && !groupMembers.has(groupId)) {
      fetchGroupMembers(groupId);
    }
  };

  const renderMembershipAssignment = (assignment, membership) => {
    const expanded = expandedAssignments.get(assignment.id) === true;
    const membersState = groupMembers.get(membership.group_id);
    return (
      <div>
        <div className="flex items-center justify-between bg-primary-50 rounded-md px-4 py-3 mb-2">
          <p className="text-sm font-medium text-gray-900">
            Your group: <span className="text-primary-700">{membership.group_name}</span>
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => toggleMembers(assignment.id, membership.group_id)}
              className="text-sm text-primary-600 hover:text-primary-800 font-medium"
            >
              {expanded ? 'Hide Members' : 'Show Members'}
            </button>
            {!groupJoinLocked && (
              <button
                onClick={() => handleLeaveGroup(assignment.id, membership.group_id)}
                disabled={leavingGroup}
                className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {leavingGroup ? 'Leaving...' : 'Leave Group'}
              </button>
            )}
          </div>
        </div>
        {groupJoinLocked && (
          <div className="mb-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-md text-sm">
            {LOCKED_MESSAGE}
          </div>
        )}
        {expanded && (
          <MemberList
            loading={membersState?.loading !== false}
            members={membersState?.members ?? []}
            currentUserId={user?.id}
          />
        )}
      </div>
    );
  };

  const renderJoinableAssignment = (assignment) => {
    if (groupJoinLocked) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-md text-sm">
          {LOCKED_MESSAGE}
        </div>
      );
    }
    const groupsState = assignmentGroups.get(assignment.id);
    if (!groupsState || groupsState.loading) {
      return <Spinner />;
    }
    if (groupsState.error) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm">
          {groupsState.error}
        </div>
      );
    }
    return (
      <>
        <button
          onClick={() => handleFeelingLucky(assignment.id)}
          disabled={joiningGroup}
          className="mb-3 w-full px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {joiningGroup ? 'Joining...' : "🍀 I'm Feeling Lucky"}
        </button>
        {groupsState.groups.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">No available groups to join</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {groupsState.groups.map((group) => (
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
    );
  };

  const renderSubjectCard = (subject) => {
    const data = subjectData.get(subject.id);
    return (
      <div key={subject.id} className="bg-white overflow-hidden shadow rounded-lg mb-6">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">{subject.name}</h3>
          {!data || data.loading ? (
            <Spinner />
          ) : data.error ? (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm">
              {data.error}
            </div>
          ) : data.assignments.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">No assignments yet</p>
          ) : (
            data.assignments.map((assignment) => {
              const membership = memberships.find((m) => m.assignment_id === assignment.id);
              return (
                <div key={assignment.id} className="mb-5 last:mb-0">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">{assignment.name}</h4>
                  {membership
                    ? renderMembershipAssignment(assignment, membership)
                    : renderJoinableAssignment(assignment)}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
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
                <div>
                  <dt className="text-sm font-medium text-gray-500">Subjects</dt>
                  <dd className="mt-1 text-sm text-gray-900">{subjects.map((s) => s.name).join(', ') || '—'}</dd>
                </div>
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
                  {isAdmin && (
                    <Link
                      to="/users"
                      className="block w-full text-left px-4 py-2 bg-primary-50 text-primary-700 rounded-md hover:bg-primary-100 transition-colors"
                    >
                      👥 Manage Users
                    </Link>
                  )}
                  {isAssignmentManager && (
                    <Link
                      to="/subjects"
                      className="block w-full text-left px-4 py-2 bg-primary-50 text-primary-700 rounded-md hover:bg-primary-100 transition-colors"
                    >
                      📚 Subjects & Assignments
                      {!isAdmin && (
                        <span className="block text-xs text-primary-600 mt-1">Manage users within your subjects.</span>
                      )}
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

          {/* Normal User Subject/Assignment Group Section */}
          {isNormalUser && (
            <>
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

              {subjects.length === 0 ? (
                <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
                  <div className="px-4 py-5 sm:p-6">
                    <p className="text-sm text-gray-500">
                      You are not enrolled in any subject yet. Contact your administrator.
                    </p>
                  </div>
                </div>
              ) : selectedSubject ? (
                <>
                  {subjects.length > 1 && (
                    <div className="flex items-center justify-between bg-white shadow rounded-lg px-4 py-3 mb-4">
                      <span className="text-sm font-medium text-gray-700">{selectedSubject.name}</span>
                      <button
                        onClick={() => setCurrentSubject(null)}
                        className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                      >
                        Switch subject
                      </button>
                    </div>
                  )}
                  {renderSubjectCard(selectedSubject)}
                </>
              ) : (
                <div className="bg-white overflow-hidden shadow rounded-lg mb-6">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Select your subject</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {subjects.map((subject) => {
                        const data = subjectData.get(subject.id);
                        const assignmentCount = data && !data.loading && !data.error ? data.assignments.length : null;
                        return (
                          <button
                            key={subject.id}
                            onClick={() => setCurrentSubject(subject.id)}
                            className="text-left px-4 py-4 border border-gray-200 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors"
                          >
                            <span className="block text-sm font-medium text-gray-900">{subject.name}</span>
                            {assignmentCount !== null && (
                              <span className="block text-xs text-gray-500 mt-1">
                                {assignmentCount} assignment{assignmentCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
