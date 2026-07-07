import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/utils/api';
import { UserPlus, Mail, Ban, RotateCcw } from 'lucide-react';
import IconBtn from './IconBtn.jsx';
import AssignGroupModal from './AssignGroupModal.jsx';
import { parseBody, createUserSchema } from '../utils/schemas.js';
import { API_BASE } from '../config.js';

const emptyNewUser = { username: '', email: '', firstName: '', lastName: '', studentId: '' };

const SUSPEND_WARNING =
  'Suspending removes their group memberships in this subject. Re-enabling will NOT restore groups.';

/**
 * "Members" section for the subject detail page.
 * Lists the subject's members with per-subject suspension controls, group
 * assignment, setup emails, and (for managers) user creation. Admins can also
 * enrol existing users. All actions are gated by `canManage` (admin or an
 * assignment manager managing an assignment in this subject).
 */
function SubjectMembersSection({ subject, isAdmin, canManage }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Suspend confirmation modal — holds the member to suspend
  const [suspendModal, setSuspendModal] = useState(null);
  const [suspending, setSuspending] = useState(false);

  // Assign group modal — holds the member to assign
  const [assignModalUser, setAssignModalUser] = useState(null);

  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ ...emptyNewUser });
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  // Add existing user modal (admin only)
  const [showAddModal, setShowAddModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const successTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);

  const fetchMembers = useCallback(async () => {
    try {
      const response = await api.get(`${API_BASE}/subjects/${subject.id}/users`);
      setMembers(response.data.users || []);
      setLoadError('');
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [subject.id]);

  useEffect(() => {
    setLoading(true);
    fetchMembers();
  }, [fetchMembers]);

  const showSuccess = (msg) => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    setSuccess(msg);
    successTimeoutRef.current = setTimeout(() => setSuccess(''), 2000);
  };

  const showError = (msg) => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setError(msg);
    errorTimeoutRef.current = setTimeout(() => setError(''), 3000);
  };

  const setMembershipEnabled = async (memberId, enabled) => {
    await api.put(`${API_BASE}/subjects/${subject.id}/users/${memberId}`, { enabled });
  };

  const handleSuspendConfirmed = async () => {
    setSuspending(true);
    try {
      await setMembershipEnabled(suspendModal.id, false);
      showSuccess('Member suspended');
      fetchMembers();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to suspend member');
    } finally {
      setSuspending(false);
      setSuspendModal(null);
    }
  };

  const handleEnable = async (member) => {
    try {
      await setMembershipEnabled(member.id, true);
      showSuccess('Member enabled');
      fetchMembers();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to enable member');
    }
  };

  const handleSendSetupEmail = async (member) => {
    try {
      await api.post(`${API_BASE}/users/send-setup-emails`, { userIds: [member.id] });
      showSuccess('Setup email sent');
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to send setup email');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');
    const { data: body, error: validationError } = parseBody(createUserSchema, {
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      studentId: newUser.studentId,
      role: 'user',
      subjectIds: [subject.id],
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setCreating(true);
    try {
      await api.post(`${API_BASE}/users`, {
        username: body.username,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        studentId: body.studentId || undefined,
        role: 'user',
        subjectIds: [subject.id],
      });
      showSuccess('User created successfully');
      setNewUser({ ...emptyNewUser });
      setShowCreateModal(false);
      fetchMembers();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const openAddModal = async () => {
    setAddError('');
    setSelectedUserId('');
    setAllUsers([]);
    setShowAddModal(true);
    try {
      const response = await api.get(`${API_BASE}/users`);
      setAllUsers(response.data.users || []);
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to load users');
    }
  };

  const handleAddExisting = async (e) => {
    e.preventDefault();
    setAddError('');
    setAdding(true);
    try {
      await api.post(`${API_BASE}/subjects/${subject.id}/users`, { userIds: [selectedUserId] });
      showSuccess('User added to subject');
      setShowAddModal(false);
      fetchMembers();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add user');
    } finally {
      setAdding(false);
    }
  };

  const memberIds = new Set(members.map((m) => m.id));
  const addCandidates = allUsers.filter((u) => u.role_name === 'user' && !memberIds.has(u.id));

  const renderStatusBadges = (member) => (
    <div className="flex items-center gap-1">
      <span
        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap ${
          member.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
        }`}
      >
        {member.status === 'pending' ? 'Pending' : 'Active'}
      </span>
      {member.membership_enabled === false && (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap bg-gray-100 text-gray-800">
          Suspended
        </span>
      )}
    </div>
  );

  const renderRowActions = (member) => {
    if (!canManage || member.role_name !== 'user') {
      return null;
    }
    return (
      <div className="flex items-center gap-0.5">
        {member.membership_enabled === false ? (
          <IconBtn
            label="Enable Member"
            onClick={() => handleEnable(member)}
            className="text-gray-500 hover:text-green-600 hover:bg-green-50"
          >
            <RotateCcw className="h-4 w-4" />
          </IconBtn>
        ) : (
          <IconBtn
            label="Suspend Member"
            onClick={() => setSuspendModal(member)}
            className="text-gray-500 hover:text-red-600 hover:bg-red-50"
          >
            <Ban className="h-4 w-4" />
          </IconBtn>
        )}
        <IconBtn
          label="Assign Group"
          onClick={() => setAssignModalUser({ ...member, subjects: [subject], memberships: member.memberships || [] })}
          className="text-gray-500 hover:text-primary-600 hover:bg-primary-50"
        >
          <UserPlus className="h-4 w-4" />
        </IconBtn>
        {member.status === 'pending' && (
          <IconBtn
            label="Send Setup Email"
            onClick={() => handleSendSetupEmail(member)}
            className="text-gray-500 hover:text-primary-600 hover:bg-primary-50"
          >
            <Mail className="h-4 w-4" />
          </IconBtn>
        )}
      </div>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">{loadError}</div>
      );
    }
    if (members.length === 0) {
      return (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No members yet</p>
        </div>
      );
    }
    return (
      <div className="bg-white shadow overflow-x-auto rounded-lg">
        <table className="w-full min-w-[680px] divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-[22%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="w-[20%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Username
              </th>
              <th className="w-[26%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="w-[16%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="w-[16%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-4 py-4 overflow-hidden">
                  <div
                    className="text-sm text-gray-900 truncate"
                    title={`${member.first_name || ''} ${member.last_name || ''}`.trim()}
                  >
                    {`${member.first_name || ''} ${member.last_name || ''}`.trim()}
                  </div>
                </td>
                <td className="px-4 py-4 overflow-hidden">
                  <div className="text-sm font-medium text-gray-900 truncate" title={member.username}>
                    {member.username}
                  </div>
                  {member.student_id && (
                    <div className="text-sm text-gray-500 truncate" title={member.student_id}>
                      {member.student_id}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 overflow-hidden">
                  <div className="text-sm text-gray-900 truncate" title={member.email}>
                    {member.email}
                  </div>
                </td>
                <td className="px-4 py-4">{renderStatusBadges(member)}</td>
                <td className="px-4 py-4">{renderRowActions(member)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="mt-10">
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Members</h3>
          <p className="text-gray-600 mt-1">Users enrolled in this subject</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={openAddModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                + Add Existing User
              </button>
            )}
            <button
              onClick={() => {
                setFormError('');
                setNewUser({ ...emptyNewUser });
                setShowCreateModal(true);
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
            >
              + Create User
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
          {success}
        </div>
      )}

      {renderBody()}

      {/* Suspend Confirmation Modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Suspend {suspendModal.username}?</h3>
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-sm text-yellow-800">
              {SUSPEND_WARNING}
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setSuspendModal(null)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSuspendConfirmed}
                disabled={suspending}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suspending ? 'Suspending...' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Group Modal */}
      {assignModalUser && (
        <AssignGroupModal
          user={assignModalUser}
          subjects={[subject]}
          onClose={() => setAssignModalUser(null)}
          onAssigned={() => {
            showSuccess('User group updated successfully');
            fetchMembers();
          }}
        />
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New User</h3>
            <form onSubmit={handleCreateUser}>
              {formError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                  {formError}
                </div>
              )}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter username"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter email"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newUser.firstName}
                  onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter first name"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newUser.lastName}
                  onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter last name"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Student ID (Optional)</label>
                <input
                  type="text"
                  value={newUser.studentId}
                  onChange={(e) => setNewUser({ ...newUser, studentId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter student ID"
                />
              </div>
              <div className="mb-3 text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                The user will be enrolled in {subject.name}. Use Assign Group afterwards to place them in a group.
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewUser({ ...emptyNewUser });
                  }}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Existing User Modal (admin only) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Existing User</h3>
            <form onSubmit={handleAddExisting}>
              {addError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                  {addError}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                <select
                  aria-label="Select user"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select user</option>
                  {addCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || !selectedUserId}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubjectMembersSection;
