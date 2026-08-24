import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@/utils/api';
import { Pencil, UserPlus, BookOpen, Download, Trash2, Upload, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Header from '../components/Header.jsx';
import { formatRoleName } from '../utils/formatting.js';
import IndeterminateCheckbox from '../components/IndeterminateCheckbox.jsx';
import AssignGroupModal from '../components/AssignGroupModal.jsx';
import SubjectMembershipModal from '../components/SubjectMembershipModal.jsx';
import CascadingAssignmentSelect from '../components/CascadingAssignmentSelect.jsx';
import { parseBody, createUserSchema, updateUserSchema } from '../utils/schemas.js';
import { API_BASE } from '../config.js';
import { csvEscape } from '../utils/csv.js';
import Modal from '../components/Modal.jsx';

const emptyNewUser = {
  username: '',
  firstName: '',
  lastName: '',
  email: '',
  studentId: '',
  role: 'user',
  sendSetupEmail: false,
};

const emptySelection = { subjectId: '', assignmentId: '', groupId: '' };

/** Format a user's group memberships as "Subject › Assignment › Group" lines. */
const membershipLines = (u) =>
  (u.memberships || []).map((m) => `${m.subject_name} › ${m.assignment_name} › ${m.group_name}`);

/**
 * Render a user's subject names for the Subjects column. Subjects whose
 * membership is suspended (membership_enabled === false; undefined counts as
 * enabled) get a " (suspended)" suffix and line-through styling.
 */
const renderSubjectNames = (u) => {
  const subjectList = u.subjects || [];
  if (subjectList.length === 0) {
    return '—';
  }
  if (subjectList.every((s) => s.membership_enabled !== false)) {
    return subjectList.map((s) => s.name).join(', ');
  }
  return subjectList.map((s, index) => (
    <span key={s.id}>
      {index > 0 && ', '}
      {s.membership_enabled === false ? (
        <span className="line-through text-gray-400">{s.name} (suspended)</span>
      ) : (
        s.name
      )}
    </span>
  ));
};

function Users() {
  const { user, isAdmin, isAssignmentManager } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const [assignModalUser, setAssignModalUser] = useState(null);
  const [membershipModalUser, setMembershipModalUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ ...emptyNewUser });
  const [createSelection, setCreateSelection] = useState({ ...emptySelection });
  const [editingUser, setEditingUser] = useState(null);
  const [formError, setFormError] = useState('');
  const [sendingEmails, setSendingEmails] = useState(false);
  const [sendEmailsModal, setSendEmailsModal] = useState(null); // null | number (pending count)
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Row selection & delete
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteModal, setDeleteModal] = useState(null); // User[] | null

  // Filters
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const successTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);

  const location = useLocation();

  // Re-fetch whenever this page is navigated to (location.key changes on each navigation).
  // Both effects are intentionally placed before fetchData to use a forward reference,
  // keeping exhaustive-deps clean without suppression comments.
  useEffect(() => {
    fetchData();
  }, [location.key]);

  // Re-fetch when the browser tab becomes visible again (multi-tab scenario).
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, subjectsRes] = await Promise.all([
        api.get(`${API_BASE}/users`),
        api.get(`${API_BASE}/subjects`),
      ]);
      setUsers(usersRes.data.users || []);
      setSubjects(subjectsRes.data.subjects || []);
    } catch (_err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');

    if (newUser.role === 'user' && !createSelection.subjectId) {
      setFormError('Subject is required');
      return;
    }

    const candidate = {
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      studentId: newUser.studentId,
      role: newUser.role,
      sendSetupEmail: newUser.sendSetupEmail,
      ...(newUser.role === 'user' && {
        subjectIds: [createSelection.subjectId],
        assignmentId: createSelection.assignmentId,
        groupId: createSelection.groupId,
      }),
      ...(newUser.role === 'assignment_manager' &&
        createSelection.assignmentId && { assignmentIds: [createSelection.assignmentId] }),
    };

    const { data: body, error: validationError } = parseBody(createUserSchema, candidate);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setCreating(true);
    try {
      const res = await api.post(`${API_BASE}/users`, {
        username: body.username,
        email: body.email,
        firstName: body.firstName || undefined,
        lastName: body.lastName || undefined,
        studentId: body.studentId || undefined,
        role: body.role,
        sendSetupEmail: body.sendSetupEmail,
        ...(body.subjectIds && { subjectIds: body.subjectIds }),
        ...(body.assignmentId && { assignmentId: body.assignmentId }),
        ...(body.groupId && { groupId: body.groupId }),
        ...(body.assignmentIds && { assignmentIds: body.assignmentIds }),
      });
      showSuccess('User created successfully');
      if (res.data?.warning) {
        showWarning(res.data.warning);
      }
      setNewUser({ ...emptyNewUser });
      setCreateSelection({ ...emptySelection });
      setShowCreateModal(false);
      fetchData();
    } catch (err) {
      // Show generic error message for security (don't reveal if email/username exists)
      const errorCode = err.response?.status;
      if (errorCode === 409) {
        setFormError('Username or email already in use. Please use a different one.');
      } else if (errorCode === 400) {
        setFormError('Invalid input. Please check all required fields.');
      } else {
        setFormError('Failed to create user. Please try again.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!editingUser) {
      return;
    }

    const { data: body, error: validationError } = parseBody(updateUserSchema, {
      email: editingUser.email,
      firstName: editingUser.firstName || null,
      lastName: editingUser.lastName || null,
      studentId: editingUser.studentId || null,
      enabled: editingUser.enabled,
      role: editingUser.roleName !== editingUser.originalRoleName ? editingUser.roleName : undefined,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        email: body.email,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
      };

      // Only include studentId for regular users
      if (editingUser.roleName === 'user') {
        payload.studentId = body.studentId || null;
      }

      if (isAdmin) {
        // Only include role if it's different from the original
        if (body.role !== undefined) {
          payload.role = body.role;
        }
      }

      // Admins and assignment managers can enable/disable users
      if ((isAdmin || isAssignmentManager) && editingUser.roleName !== 'admin') {
        payload.enabled = body.enabled;
      }

      await api.put(`${API_BASE}/users/${editingUser.id}`, payload);
      showSuccess('User updated successfully');
      setEditingUser(null);
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (u) => {
    setFormError('');
    setEditingUser({
      id: u.id,
      username: u.username,
      email: u.email,
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      studentId: u.student_id || '',
      roleName: u.role_name || 'user',
      originalRoleName: u.role_name || 'user',
      enabled: u.enabled !== false,
      memberships: u.memberships || [],
    });
  };

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

  const showWarning = (msg) => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    setWarning(msg);
    warningTimeoutRef.current = setTimeout(() => setWarning(''), 6000);
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
    if (!toDelete || toDelete.length === 0) {
      setDeleteModal(null);
      return;
    }
    setDeleting(true);
    try {
      if (toDelete.length === 1) {
        await api.delete(`${API_BASE}/users/${toDelete[0].id}`);
        showSuccess('User deleted successfully');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(toDelete[0].id);
          return next;
        });
      } else {
        const ids = toDelete.map((u) => u.id);
        const BULK_DELETE_BATCH_SIZE = 2000;
        for (let i = 0; i < ids.length; i += BULK_DELETE_BATCH_SIZE) {
          const batch = ids.slice(i, i + BULK_DELETE_BATCH_SIZE);
          await api.delete(`${API_BASE}/users/bulk`, { data: { ids: batch } });
        }
        showSuccess(`Deleted ${toDelete.length} users`);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          toDelete.forEach((u) => next.delete(u.id));
          return next;
        });
      }
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      showError(err?.response?.data?.error || 'Failed to delete user(s)');
      setDeleteModal(null);
      fetchData();
    } finally {
      setDeleting(false);
    }
  };

  const handleSendSetupEmails = async () => {
    const pendingUsers = users.filter((u) => u.status === 'pending');
    const targets =
      selectedIds.size > 0 ? users.filter((u) => selectedIds.has(u.id) && u.status === 'pending') : pendingUsers;
    if (targets.length === 0) {
      showError('No pending users to send setup emails to.');
      return;
    }
    setSendingEmails(true);
    try {
      const body = selectedIds.size > 0 ? { userIds: targets.map((u) => u.id) } : {};
      const res = await api.post(`${API_BASE}/users/send-setup-emails`, body);
      const { sent = 0, errors: emailErrors = [] } = res.data || {};
      const failedCount = emailErrors.length;
      if (sent > 0 && failedCount === 0) {
        showSuccess(`Setup email sent to ${sent} user${sent !== 1 ? 's' : ''}.`);
      } else if (sent > 0 && failedCount > 0) {
        showSuccess(`Setup emails sent to ${sent} user${sent !== 1 ? 's' : ''}, but failed for ${failedCount}.`);
      } else if (failedCount > 0) {
        showError(`Failed to send setup emails for ${failedCount} user${failedCount !== 1 ? 's' : ''}.`);
      } else {
        showError('No setup emails were sent.');
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to send setup emails.');
    } finally {
      setSendingEmails(false);
    }
  };

  const exportToCsv = (exportUsers, filename) => {
    // Uses the shared escaper: the local copy this replaced did not neutralise
    // spreadsheet formulas, so a user-controlled name could execute on open.
    const headers = ['Username', 'First Name', 'Last Name', 'Email', 'Role', 'Subjects', 'Groups', 'Student ID'];
    const rows = exportUsers.map((u) => [
      csvEscape(u.username),
      csvEscape(u.first_name),
      csvEscape(u.last_name),
      csvEscape(u.email),
      csvEscape(formatRoleName(u.role_name)),
      csvEscape((u.subjects || []).map((s) => s.name).join(', ')),
      csvEscape((u.memberships || []).map((m) => `${m.assignment_name}:${m.group_name}`).join(', ')),
      csvEscape(u.student_id),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 0);
  };

  // Apply filters and search
  const filteredUsers = users.filter((u) => {
    if (filterRole && u.role_name !== filterRole) {
      return false;
    }
    if (filterStatus && u.status !== filterStatus) {
      return false;
    }
    if (filterSubject && !(u.subjects || []).some((s) => s.id === filterSubject)) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const searchable = [u.username, u.email, u.student_id, u.first_name, u.last_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(term)) {
        return false;
      }
    }
    return true;
  });

  const adminUsers = filteredUsers.filter((u) => u.role_name === 'admin' || u.role_name === 'assignment_manager');
  const noSubjectUsers = filteredUsers.filter((u) => u.role_name === 'user' && (u.subjects || []).length === 0);
  const subjectUsers = filteredUsers.filter((u) => u.role_name === 'user' && (u.subjects || []).length > 0);

  const selectedUsers = users.filter((u) => selectedIds.has(u.id));
  const deleteModalWithMemberships = (deleteModal ?? []).filter((u) => (u.memberships || []).length > 0);

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
              Subjects
            </th>
            <th className="w-[10%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="w-[14%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                {u.role_name === 'admin' || u.role_name === 'assignment_manager' ? (
                  <div className="text-sm">&nbsp;</div>
                ) : (
                  <div className="text-sm text-gray-900 truncate" title={membershipLines(u).join('\n')}>
                    {renderSubjectNames(u)}
                  </div>
                )}
              </td>
              <td className="px-4 py-4">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap ${
                    u.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : u.enabled === false
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-green-100 text-green-800'
                  }`}
                >
                  {u.status === 'pending' ? 'Pending' : u.enabled === false ? 'Inactive' : 'Active'}
                </span>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-1">
                  {/* Edit User Profile button for admins, assignment managers (non-admins), and users editing their own profile */}
                  {(isAdmin || (isAssignmentManager && u.role_name !== 'admin') || u.id === user?.id) && (
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
                  )}
                  {/* Assign Group opens the modal; admins and assignment managers only (backend enforces AM scope) */}
                  {(isAdmin || isAssignmentManager) && u.role_name === 'user' && (
                    <div className="relative group">
                      <button
                        onClick={() => setAssignModalUser(u)}
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
                  {/* Manage Subjects is admin only */}
                  {isAdmin && u.role_name === 'user' && (
                    <div className="relative group">
                      <button
                        onClick={() => setMembershipModalUser(u)}
                        aria-label="Manage Subjects"
                        className="p-1.5 rounded text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        <BookOpen className="h-4 w-4" />
                      </button>
                      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        Manage Subjects
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
              </td>
            </tr>
          ))}
          {sectionUsers.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-6 text-center text-sm text-gray-500">
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
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50">
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
                  onClick={() => navigate('/users/import')}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
                >
                  <Upload className="h-4 w-4" />
                  Import Users
                </button>
              )}
              {isAssignmentManager &&
                (() => {
                  const pendingCount =
                    selectedIds.size > 0
                      ? users.filter((u) => selectedIds.has(u.id) && u.status === 'pending').length
                      : users.filter((u) => u.status === 'pending').length;
                  if (pendingCount === 0) {
                    return null;
                  }
                  return (
                    <button
                      onClick={() => setSendEmailsModal(pendingCount)}
                      disabled={sendingEmails}
                      className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
                    >
                      <Mail className="h-4 w-4" />
                      {sendingEmails
                        ? 'Sending…'
                        : `Send Setup Email${pendingCount !== 1 ? 's' : ''} (${pendingCount})`}
                    </button>
                  );
                })()}
              {isAdmin && (
                <button
                  onClick={() => {
                    setFormError('');
                    setShowCreateModal(true);
                  }}
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

          {warning && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm">
              {warning}
            </div>
          )}

          {/* Filters */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or student ID..."
              aria-label="Search users"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-72"
            />
            <span className="text-sm font-medium text-gray-600">Filter:</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              aria-label="Filter by role"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="assignment_manager">Assignment Manager</option>
              <option value="user">User</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter by status"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              aria-label="Filter by subject"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {(filterRole || filterStatus || filterSubject || searchTerm) && (
              <button
                onClick={() => {
                  setFilterRole('');
                  setFilterStatus('');
                  setFilterSubject('');
                  setSearchTerm('');
                }}
                className="text-sm text-gray-500 hover:text-primary-600 underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Section 1: Administrators */}
          {renderSection(
            'Administrators',
            adminUsers,
            'No admin or manager accounts',
            () => exportToCsv(adminUsers, 'administrators.csv'),
            'Export Administrators'
          )}

          {/* Section 2: Users not enrolled in any subject */}
          {renderSection(
            'Users without a subject',
            noSubjectUsers,
            'All users belong to a subject',
            () => exportToCsv(noSubjectUsers, 'users-without-subject.csv'),
            'Export Users without a subject'
          )}

          {/* Section 3: Users enrolled in at least one subject */}
          {renderSection(
            'Users in subjects',
            subjectUsers,
            'No users belong to a subject yet',
            () => exportToCsv(subjectUsers, 'users-in-subjects.csv'),
            'Export Users in subjects'
          )}
        </div>
      </main>

      {/* Create User Modal */}
      {showCreateModal && (
        <Modal title="Create New User" onClose={() => setShowCreateModal(false)}>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={newUser.role}
                onChange={(e) => {
                  setNewUser({ ...newUser, role: e.target.value });
                  setCreateSelection({ ...emptySelection });
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="user">User</option>
                <option value="assignment_manager">Assignment Manager</option>
                {isAdmin && <option value="admin">Admin</option>}
              </select>
            </div>
            {newUser.role === 'user' && (
              <>
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
                <p className="mb-2 text-xs text-gray-500">
                  Subject is required. Assignment and group allow immediate placement (optional).
                </p>
                <CascadingAssignmentSelect
                  subjects={subjects}
                  value={createSelection}
                  onChange={setCreateSelection}
                  showGroup
                  disabled={creating}
                />
              </>
            )}
            {newUser.role === 'assignment_manager' && (
              <>
                <p className="mb-2 text-xs text-gray-500">
                  Optionally scope the manager to an assignment (pick a subject to narrow the list).
                </p>
                <CascadingAssignmentSelect
                  subjects={subjects}
                  value={createSelection}
                  onChange={setCreateSelection}
                  showGroup={false}
                  disabled={creating}
                />
              </>
            )}
            <div className="mb-3 text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              The user will need to set a password via email before they can log in.
            </div>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="sendSetupEmail"
                checked={newUser.sendSetupEmail}
                onChange={(e) => setNewUser({ ...newUser, sendSetupEmail: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="sendSetupEmail" className="text-sm text-gray-700">
                Send &lsquo;Set Password&rsquo; email now
              </label>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewUser({ ...emptyNewUser });
                  setCreateSelection({ ...emptySelection });
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
        </Modal>
      )}
      {/* Edit User Modal */}
      {editingUser && (
        <Modal title="Edit User" onClose={() => setEditingUser(null)}>
          <form onSubmit={handleEditUser}>
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
                value={editingUser.username}
                disabled
                className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-500 cursor-not-allowed"
                placeholder="Enter username"
              />
              <p className="mt-1 text-xs text-gray-500">Username cannot be changed</p>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
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
            {editingUser.roleName === 'user' && (
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
            )}
            {editingUser.roleName === 'user' && (
              <div className="mb-3">
                <span className="block text-sm font-medium text-gray-700 mb-1">Memberships</span>
                {editingUser.memberships.length > 0 ? (
                  <ul className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 space-y-0.5">
                    {membershipLines({ memberships: editingUser.memberships }).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">None</p>
                )}
              </div>
            )}
            {isAdmin && editingUser.username !== 'admin' && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editingUser.roleName}
                  onChange={(e) => setEditingUser({ ...editingUser, roleName: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="user">User</option>
                  <option value="assignment_manager">Assignment Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            )}
            {/* Show Enabled checkbox for admins and assignment managers editing non-built-in-admin users */}
            {((isAdmin && editingUser.username !== 'admin') ||
              (isAssignmentManager && editingUser.roleName !== 'admin')) && (
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
            )}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {/* Send Setup Emails Confirmation Modal */}
      {sendEmailsModal !== null && (
        <Modal title={`Send setup email${sendEmailsModal !== 1 ? 's' : ''}?`} onClose={() => setSendEmailsModal(null)}>
          <p className="text-sm text-gray-600 mb-4">
            This will send a &lsquo;Set Password&rsquo; email to {sendEmailsModal} pending user
            {sendEmailsModal !== 1 ? 's' : ''}. Each user will receive a link to activate their account.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setSendEmailsModal(null)}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setSendEmailsModal(null);
                handleSendSetupEmails();
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Send
            </button>
          </div>
        </Modal>
      )}
      {/* Delete Confirmation Modal (single or bulk) */}
      {deleteModal && (
        <Modal
          title="Confirm deletion"
          onClose={() => setDeleteModal(null)}
          closeOnBackdrop={false}
          panelClassName="max-h-[90vh] flex flex-col"
          header={null}
        >
          <div className="p-6 pb-0 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Delete {deleteModal.length} user{deleteModal.length > 1 ? 's' : ''}?
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-3">
            {deleteModalWithMemberships.length > 0 && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-sm text-yellow-800">
                <p className="font-medium mb-1">
                  {deleteModalWithMemberships.length} user{deleteModalWithMemberships.length > 1 ? 's have' : ' has'}{' '}
                  group memberships that will be removed:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {deleteModalWithMemberships.map((u) => (
                    <li key={u.id}>
                      {u.username} <span className="text-yellow-600">({membershipLines(u).join('; ')})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-gray-600">This action cannot be undone.</p>
          </div>
          <div className="p-6 pt-4 flex-shrink-0 flex justify-end space-x-3">
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
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting...' : `Delete ${deleteModal.length} user${deleteModal.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}
      {/* Assign Group Modal */}
      {assignModalUser && (
        <AssignGroupModal
          user={assignModalUser}
          subjects={subjects}
          onClose={() => setAssignModalUser(null)}
          onAssigned={() => {
            showSuccess('User group updated successfully');
            fetchData();
          }}
        />
      )}
      {/* Manage Subjects Modal */}
      {membershipModalUser && (
        <SubjectMembershipModal
          user={membershipModalUser}
          subjects={subjects}
          onClose={() => setMembershipModalUser(null)}
          onChanged={() => {
            showSuccess('Subjects updated successfully');
            fetchData();
          }}
        />
      )}
    </div>
  );
}

export default Users;
