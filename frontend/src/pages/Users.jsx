import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Pencil, KeyRound, UserPlus, Check, X, Download, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Header from '../components/Header.jsx';
import { formatRoleName } from '../utils/formatting.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const emptyNewUser = {
  username: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  studentId: '',
  groupId: '',
  role: 'user',
};

function IndeterminateCheckbox({ checked, indeterminate, onChange, className, 'aria-label': ariaLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate ?? false;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

function Users() {
  const { user, isAdmin, isAssignmentManager } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ ...emptyNewUser });
  const [editingUser, setEditingUser] = useState(null);
  const [passwordChange, setPasswordChange] = useState(null);

  // Row selection & delete
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteModal, setDeleteModal] = useState(null); // User[] | null

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, groupsRes] = await Promise.all([
        axios.get(`${API_BASE}/users`),
        axios.get(`${API_BASE}/groups/enabled`),
      ]);
      setUsers(usersRes.data.users || []);
      setGroups(groupsRes.data.groups || []);
    } catch (_err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleGroupChange = async (userId, groupId) => {
    try {
      await axios.put(`${API_BASE}/users/${userId}/group`, { groupId });
      setSuccess('User group updated successfully');
      setTimeout(() => setSuccess(''), 3000);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update group');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleAssignGroup = async () => {
    if (!selectedUser) {
      return;
    }

    const groupId = selectedGroup === '' ? null : selectedGroup;
    await handleGroupChange(selectedUser, groupId);
    setSelectedUser(null);
    setSelectedGroup('');
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.email.trim() || !newUser.password) {
      return;
    }

    try {
      await axios.post(`${API_BASE}/users`, {
        username: newUser.username.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        firstName: newUser.firstName.trim() || undefined,
        lastName: newUser.lastName.trim() || undefined,
        studentId: newUser.studentId.trim() || undefined,
        groupId: newUser.groupId || undefined,
        role: newUser.role,
      });
      setSuccess('User created successfully');
      setNewUser({ ...emptyNewUser });
      setShowCreateModal(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!editingUser || !editingUser.username.trim() || !editingUser.email.trim()) {
      return;
    }

    try {
      await axios.put(`${API_BASE}/users/${editingUser.id}`, {
        username: editingUser.username.trim(),
        email: editingUser.email.trim(),
        firstName: editingUser.firstName?.trim() || null,
        lastName: editingUser.lastName?.trim() || null,
        studentId: editingUser.studentId?.trim() || null,
        ...(isAdmin && {
          roleId: editingUser.roleId || undefined,
          enabled: editingUser.enabled,
        }),
      });
      setSuccess('User updated successfully');
      setEditingUser(null);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
      setTimeout(() => setError(''), 3000);
    }
  };

  const openEditModal = (u) => {
    setEditingUser({
      id: u.id,
      username: u.username,
      email: u.email,
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      studentId: u.student_id || '',
      roleId: u.role_id || '',
      roleName: u.role_name,
      enabled: u.enabled !== false,
    });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordChange) {
      return;
    }

    const { userId, currentPassword, newPassword, confirmPassword } = passwordChange;
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setTimeout(() => setError(''), 3000);
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      await axios.put(`${API_BASE}/users/${userId}/password`, {
        ...(currentPassword && { currentPassword }),
        newPassword,
      });
      setSuccess('Password changed successfully');
      setPasswordChange(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
      setTimeout(() => setError(''), 3000);
    }
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 3000);
  };

  // ── Selection helpers ──────────────────────────────────────────────────

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSectionAll = (sectionUsers, allSelected) => {
    const selectable = sectionUsers.filter((u) => u.id !== user?.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        selectable.forEach((u) => next.delete(u.id));
      } else {
        selectable.forEach((u) => next.add(u.id));
      }
      return next;
    });
  };

  // ── Delete ─────────────────────────────────────────────────────────────

  const handleDeleteUser = (userId) => {
    const u = users.find((u2) => u2.id === userId);
    if (u) {
      setDeleteModal([u]);
    }
  };

  const handleDeleteConfirmed = async () => {
    const toDelete = deleteModal;
    try {
      await Promise.all(toDelete.map((u) => axios.delete(`${API_BASE}/users/${u.id}`)));
      showSuccess(toDelete.length === 1 ? 'User deleted successfully' : `Deleted ${toDelete.length} users`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        toDelete.forEach((u) => next.delete(u.id));
        return next;
      });
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const exportToCsv = (exportUsers, filename) => {
    const csvEscape = (val) => {
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const headers = ['Username', 'First Name', 'Last Name', 'Email', 'Role', 'Group', 'Student ID'];
    const rows = exportUsers.map((u) => [
      csvEscape(u.username),
      csvEscape(u.first_name),
      csvEscape(u.last_name),
      csvEscape(u.email),
      csvEscape(formatRoleName(u.role_name)),
      csvEscape(u.group_name),
      csvEscape(u.student_id),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const adminUsers = users.filter((u) => u.role_name === 'admin' || u.role_name === 'assignment_manager');
  const ungroupedUsers = users.filter((u) => u.role_name === 'user' && !u.group_id);
  const groupedUsers = users.filter((u) => u.role_name === 'user' && !!u.group_id);

  const selectedUsers = users.filter((u) => selectedIds.has(u.id));
  const deleteModalWithGroup = (deleteModal ?? []).filter((u) => !!u.group_id);

  const renderTable = (sectionUsers, emptyMessage) => (
    <div className="bg-white shadow overflow-x-auto rounded-lg">
      <table className="w-full min-w-[700px] divide-y divide-gray-200 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-8 px-3 py-3" />
            <th className="w-[19%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Username
            </th>
            <th className="w-[12%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="w-[21%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="w-[12%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Role
            </th>
            <th className="w-[18%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Current Group
            </th>
            <th className="w-[14%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sectionUsers.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-4">
                {isAdmin && u.id !== user?.id && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    aria-label={`Select ${u.username}`}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                )}
              </td>
              <td className="px-6 py-4 overflow-hidden">
                <div className="text-sm font-medium text-gray-900 truncate" title={u.username}>
                  {u.username}
                </div>
                {u.student_id && (
                  <div className="text-sm text-gray-500 truncate" title={u.student_id}>
                    {u.student_id}
                  </div>
                )}
              </td>
              <td className="px-6 py-4 overflow-hidden">
                <div
                  className="text-sm text-gray-900 truncate"
                  title={`${u.first_name || ''} ${u.last_name || ''}`.trim()}
                >
                  {u.first_name} {u.last_name}
                </div>
              </td>
              <td className="px-6 py-4 overflow-hidden">
                <div className="text-sm text-gray-900 truncate" title={u.email}>
                  {u.email}
                </div>
              </td>
              <td className="px-6 py-4">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap ${
                    u.role_name === 'admin'
                      ? 'bg-red-100 text-red-800'
                      : u.role_name === 'assignment_manager'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                  }`}
                >
                  {formatRoleName(u.role_name)}
                </span>
              </td>
              <td className="px-6 py-4 overflow-hidden">
                <div className="text-sm text-gray-900 truncate" title={u.group_name || 'Not assigned'}>
                  {u.group_name || 'Not assigned'}
                </div>
              </td>
              <td className="px-4 py-4">
                {selectedUser === u.id ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="min-w-0 flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                    >
                      <option value="">No Group</option>
                      {groups
                        .filter((g) => g.max_members === null || g.member_count < g.max_members)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={handleAssignGroup}
                      aria-label="Save"
                      className="text-primary-600 hover:text-primary-800"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(null);
                        setSelectedGroup('');
                      }}
                      aria-label="Cancel"
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {(isAdmin || user?.id === u.id) && (
                      <>
                        <div className="relative group">
                          <button
                            onClick={() => openEditModal(u)}
                            aria-label="Edit User Profile"
                            className="p-1.5 rounded text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            Edit User Profile
                          </span>
                        </div>
                        <div className="relative group">
                          <button
                            onClick={() =>
                              setPasswordChange({
                                userId: u.id,
                                username: u.username,
                                currentPassword: '',
                                newPassword: '',
                                confirmPassword: '',
                              })
                            }
                            aria-label="Change Password"
                            className="p-1.5 rounded text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            Change Password
                          </span>
                        </div>
                      </>
                    )}
                    {/* Assign Group button only visible for users with role 'user' */}
                    {u.role_name === 'user' && (
                      <div className="relative group">
                        <button
                          onClick={() => setSelectedUser(u.id)}
                          aria-label="Assign Group"
                          className="p-1.5 rounded text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          Assign Group
                        </span>
                      </div>
                    )}
                    {isAdmin && u.id !== user?.id && (
                      <div className="relative group">
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          aria-label="Delete User"
                          className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          Delete User
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
          {sectionUsers.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-6 text-center text-sm text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderSection = (title, sectionUsers, emptyMessage, exportFn, exportLabel) => {
    const selectable = sectionUsers.filter((u) => u.id !== user?.id);
    const allSelected = selectable.length > 0 && selectable.every((u) => selectedIds.has(u.id));
    const someSelected = !allSelected && selectable.some((u) => selectedIds.has(u.id));
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isAdmin && selectable.length > 0 && (
              <IndeterminateCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={() => toggleSectionAll(sectionUsers, allSelected)}
                aria-label={`Select all ${title}`}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            )}
            <h3 className="text-base font-semibold text-gray-700">
              {title} <span className="text-sm font-normal text-gray-400">({sectionUsers.length})</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportFn}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 transition-colors"
              aria-label={exportLabel}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>
        {renderTable(sectionUsers, emptyMessage)}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header pageName="User Management" />

      {/* Main Content */}
      <main className="w-[85%] mx-auto py-6">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Manage Users</h2>
              <p className="text-gray-600 mt-1">Assign users to groups and manage team membership</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && selectedIds.size > 0 && (
                <button
                  onClick={() => setDeleteModal(selectedUsers)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete ({selectedIds.size})
                </button>
              )}
              <button
                onClick={() => exportToCsv(users, 'all-users.csv')}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
              >
                <Download className="h-4 w-4" />
                Export All
              </button>
              {isAssignmentManager && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                >
                  + Create User
                </button>
              )}
            </div>
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

          {/* Section 1: Administrators */}
          {renderSection(
            'Administrators',
            adminUsers,
            'No admin or manager accounts',
            () => exportToCsv(adminUsers, 'administrators.csv'),
            'Export Administrators'
          )}

          {/* Section 2: Unassigned users */}
          {renderSection(
            'Users without a group',
            ungroupedUsers,
            'All users are assigned to a group',
            () => exportToCsv(ungroupedUsers, 'users-without-group.csv'),
            'Export Users without a group'
          )}

          {/* Section 3: Assigned users */}
          {renderSection(
            'Users in a group',
            groupedUsers,
            'No users have been assigned to a group yet',
            () => exportToCsv(groupedUsers, 'users-in-group.csv'),
            'Export Users in a group'
          )}
        </div>
      </main>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New User</h3>
            <form onSubmit={handleCreateUser}>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter password"
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
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Group (Optional)</label>
                <select
                  value={newUser.groupId}
                  onChange={(e) => setNewUser({ ...newUser, groupId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">No Group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="user">User</option>
                  <option value="assignment_manager">Assignment Manager</option>
                  {isAdmin && <option value="admin">Admin</option>}
                </select>
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
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit User</h3>
            <form onSubmit={handleEditUser}>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={editingUser.username}
                  onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter username"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
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
                  value={editingUser.firstName}
                  onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
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
                  value={editingUser.lastName}
                  onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter last name"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                <input
                  type="text"
                  value={editingUser.studentId}
                  onChange={(e) => setEditingUser({ ...editingUser, studentId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter student ID"
                />
              </div>
              {isAdmin && (
                <>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={editingUser.roleId}
                      onChange={(e) => setEditingUser({ ...editingUser, roleId: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="3">User</option>
                      <option value="2">Assignment Manager</option>
                      <option value="1">Admin</option>
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={editingUser.enabled}
                        onChange={(e) => setEditingUser({ ...editingUser, enabled: e.target.checked })}
                        aria-label="Enabled"
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Enabled</span>
                    </label>
                  </div>
                </>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal (single or bulk) */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Delete {deleteModal.length} user{deleteModal.length > 1 ? 's' : ''}?
            </h3>
            {deleteModalWithGroup.length > 0 && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-sm text-yellow-800">
                <p className="font-medium mb-1">
                  {deleteModalWithGroup.length} user{deleteModalWithGroup.length > 1 ? 's are' : ' is'} in a group and
                  will be unassigned:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {deleteModalWithGroup.map((u) => (
                    <li key={u.id}>
                      {u.username} <span className="text-yellow-600">({u.group_name})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete {deleteModal.length} user{deleteModal.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password for {passwordChange.username}</h3>
            <form onSubmit={handleChangePassword}>
              {!isAdmin && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={passwordChange.currentPassword}
                    onChange={(e) => setPasswordChange({ ...passwordChange, currentPassword: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Enter current password"
                  />
                </div>
              )}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={passwordChange.newPassword}
                  onChange={(e) => setPasswordChange({ ...passwordChange, newPassword: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter new password"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={passwordChange.confirmPassword}
                  onChange={(e) => setPasswordChange({ ...passwordChange, confirmPassword: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Confirm new password"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setPasswordChange(null)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
