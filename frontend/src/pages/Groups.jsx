import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import Header from '../components/Header.jsx';
import { formatRoleName } from '../utils/formatting.js';
import { Power, Gauge, Trash2, UserMinus, ChevronDown, ChevronRight, Check, Pencil } from 'lucide-react';
import IndeterminateCheckbox from '../components/IndeterminateCheckbox.jsx';
import { parseBody, createGroupSchema, updateGroupSchema } from '../utils/schemas.js';
import { downloadCsv } from '../utils/csv.js';
import { API_BASE } from '../config.js';

function IconBtn({ onClick, label, className, children }) {
  return (
    <div className="relative group/tip">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`p-1.5 rounded transition-colors ${className}`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-20">
        {label}
      </span>
    </div>
  );
}

function Groups() {
  const { isAssignmentManager } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Row selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Create group modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMaxMembers, setNewGroupMaxMembers] = useState('');

  // Bulk create modal
  const [bulkCreateModal, setBulkCreateModal] = useState(null); // { prefix, count }

  // Set limit modal — single or bulk ({ groupIds: string[], value: string })
  const [limitModal, setLimitModal] = useState(null);

  // Delete confirmation modal — holds the array of groups to delete (single or bulk)
  const [deleteModal, setDeleteModal] = useState(null);

  // Edit group modal
  const [editingGroup, setEditingGroup] = useState(null); // { id, name, maxMembers }

  // Action loading states
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Form-level errors (shown inside modals, not on the main page)
  const [createFormError, setCreateFormError] = useState('');
  const [editFormError, setEditFormError] = useState('');

  // Expanded row state
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const expandedGroupRef = useRef(null);
  const successTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API_BASE}/groups`);
      setGroups(response.data.groups || []);
    } catch (_err) {
      setError('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleExportMappings = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API_BASE}/groups/export-mappings`);
      const { mappings } = response.data;
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(mappings, ['groupName', 'email'], `group-mappings-${today}.csv`);
    } catch (_err) {
      showError('Failed to export mappings');
    } finally {
      setExporting(false);
    }
  };

  const showError = (msg) => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setError(msg);
    errorTimeoutRef.current = setTimeout(() => setError(''), 3000);
  };

  const showSuccess = (msg) => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    setSuccess(msg);
    successTimeoutRef.current = setTimeout(() => setSuccess(''), 2000);
  };

  // ── Selection helpers ───────────────────────────────────────────────────

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

  const toggleSectionAll = (sectionGroups, allSelected) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        sectionGroups.forEach((g) => next.delete(g.id));
      } else {
        sectionGroups.forEach((g) => next.add(g.id));
      }
      return next;
    });
  };

  // ── Single group actions ────────────────────────────────────────────────

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setCreateFormError('');
    const { data: body, error: validationError } = parseBody(createGroupSchema, { name: newGroupName });
    if (validationError) {
      setCreateFormError(validationError);
      return;
    }
    const body_name = body.name;
    setCreating(true);
    try {
      const requestBody = { name: body_name };
      if (newGroupMaxMembers !== '') {
        requestBody.maxMembers = parseInt(newGroupMaxMembers, 10);
      }
      await axios.post(`${API_BASE}/groups`, requestBody);
      showSuccess('Group created successfully');
      setNewGroupName('');
      setNewGroupMaxMembers('');
      setShowCreateModal(false);
      fetchGroups();
    } catch (err) {
      setCreateFormError(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (e, group) => {
    e.stopPropagation();
    setEditingGroup({
      id: group.id,
      name: group.name,
      maxMembers: group.max_members !== null ? String(group.max_members) : '',
    });
  };

  const handleEditGroup = async (e) => {
    e.preventDefault();
    if (!editingGroup) {
      return;
    }

    setEditFormError('');
    const { data: body, error: validationError } = parseBody(updateGroupSchema, { name: editingGroup.name });
    if (validationError) {
      setEditFormError(validationError);
      return;
    }

    const maxMembersVal = editingGroup.maxMembers.trim();
    const maxMembers = maxMembersVal === '' ? null : parseInt(maxMembersVal, 10);
    if (maxMembers !== null && (isNaN(maxMembers) || maxMembers < 1)) {
      setEditFormError('Max members must be a positive number');
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API_BASE}/groups/${editingGroup.id}`, {
        name: body.name,
        maxMembers,
      });
      showSuccess('Group updated successfully');
      setEditingGroup(null);
      fetchGroups();
    } catch (err) {
      setEditFormError(err.response?.data?.error || 'Failed to update group');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (e, groupId, currentEnabled) => {
    e.stopPropagation();
    try {
      await axios.put(`${API_BASE}/groups/${groupId}`, { enabled: !currentEnabled });
      showSuccess(`Group ${currentEnabled ? 'disabled' : 'enabled'} successfully`);
      fetchGroups();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to update group');
    }
  };

  const handleDeleteGroup = (e, groupId) => {
    e.stopPropagation();
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setDeleteModal([group]);
    }
  };

  const openLimitModal = (e, group) => {
    e.stopPropagation();
    setLimitModal({ groupIds: [group.id], value: group.max_members !== null ? String(group.max_members) : '' });
  };

  const openBulkLimitModal = (groupIds) => {
    setLimitModal({ groupIds, value: '' });
  };

  const handleSaveLimit = async () => {
    const { groupIds, value } = limitModal;
    const maxMembers = value.trim() === '' ? null : parseInt(value, 10);
    if (maxMembers !== null && (isNaN(maxMembers) || maxMembers < 1)) {
      showError('Max members must be a positive number');
      return;
    }
    try {
      await Promise.all(groupIds.map((id) => axios.put(`${API_BASE}/groups/${id}`, { maxMembers })));
      showSuccess(groupIds.length === 1 ? 'Group limit updated' : `Updated limit for ${groupIds.length} groups`);
      setLimitModal(null);
      fetchGroups();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to update limit');
    }
  };

  // ── Bulk create ─────────────────────────────────────────────────────────

  const handleBulkCreate = async (e) => {
    e.preventDefault();
    const { prefix, count, maxMembers } = bulkCreateModal;
    if (!prefix.trim()) {
      return;
    }
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 1) {
      return;
    }
    const maxMembersRaw = parseInt(maxMembers, 10);
    const maxMembersVal = maxMembers.trim() === '' ? null : maxMembersRaw;
    if (maxMembersVal !== null && (Number.isNaN(maxMembersVal) || maxMembersVal < 1)) {
      showError('Member limit must be a positive number.');
      return;
    }
    const results = await Promise.allSettled(
      Array.from({ length: n }, (_, i) => {
        const body = { name: `${prefix.trim()}${String(i + 1).padStart(n < 10 ? 1 : 2, '0')}` };
        if (maxMembersVal !== null) {
          body.maxMembers = maxMembersVal;
        }
        return axios.post(`${API_BASE}/groups`, body);
      })
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected');
    if (succeeded > 0) {
      showSuccess(`Created ${succeeded} group${succeeded !== 1 ? 's' : ''}`);
    }
    if (failed.length > 0) {
      const err = failed[0].reason;
      showError(err?.response?.data?.error || `Failed to create ${failed.length} group(s)`);
    }
    setBulkCreateModal(null);
    fetchGroups();
  };

  const bulkCreatePreview = () => {
    if (!bulkCreateModal) {
      return [];
    }
    const { prefix, count } = bulkCreateModal;
    const n = parseInt(count, 10);
    if (!prefix.trim() || isNaN(n) || n < 1) {
      return [];
    }
    const pad = n < 10 ? 1 : 2;
    return Array.from({ length: n }, (_, i) => `${prefix.trim()}${String(i + 1).padStart(pad, '0')}`);
  };

  // ── Delete (single or bulk) ──────────────────────────────────────────────

  const selectedGroups = groups.filter((g) => selectedIds.has(g.id));
  const deleteModalWithMembers = (deleteModal ?? []).filter((g) => g.member_count > 0);

  const handleDeleteConfirmed = async () => {
    const toDelete = deleteModal;
    setDeleting(true);
    try {
      await Promise.all(toDelete.map((g) => axios.delete(`${API_BASE}/groups/${g.id}`)));
      showSuccess(toDelete.length === 1 ? 'Group deleted successfully' : `Deleted ${toDelete.length} groups`);
      if (toDelete.some((g) => g.id === expandedGroup)) {
        setExpandedGroup(null);
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        toDelete.forEach((g) => next.delete(g.id));
        return next;
      });
      setDeleteModal(null);
      fetchGroups();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete group');
    } finally {
      setDeleting(false);
    }
  };

  // ── Expand / members ────────────────────────────────────────────────────

  const fetchGroupMembers = async (groupId) => {
    expandedGroupRef.current = groupId;
    setMembersLoading(true);
    try {
      const [groupRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE}/groups/${groupId}`),
        isAssignmentManager ? axios.get(`${API_BASE}/users`) : Promise.resolve({ data: { users: [] } }),
      ]);
      if (expandedGroupRef.current !== groupId) {
        return;
      }
      setGroupMembers(groupRes.data.members || []);
      setAllUsers(usersRes.data.users || []);
    } catch (_err) {
      if (expandedGroupRef.current !== groupId) {
        return;
      }
      showError('Failed to load group members');
    } finally {
      if (expandedGroupRef.current === groupId) {
        setMembersLoading(false);
      }
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
    const groupId = expandedGroup;
    try {
      await axios.put(`${API_BASE}/users/${userId}/group`, { groupId: null });
      showSuccess('Member removed successfully');
      if (groupId) {
        fetchGroupMembers(groupId);
      }
      fetchGroups();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) {
      return;
    }
    const groupId = expandedGroup;
    try {
      await axios.put(`${API_BASE}/users/${selectedUserId}/group`, { groupId });
      showSuccess('Member added successfully');
      setSelectedUserId('');
      if (groupId) {
        fetchGroupMembers(groupId);
      }
      fetchGroups();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to add member');
    }
  };

  const availableForGroup = () =>
    allUsers.filter((u) => !groupMembers.some((m) => m.id === u.id) && u.role_name === 'user');

  // ── Search ──────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');

  // ── Derived section data ────────────────────────────────────────────────

  const isFull = (g) => g.max_members !== null && g.member_count >= g.max_members;
  const matchingGroups = searchTerm
    ? groups.filter((g) => g.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : groups;
  const openGroups = matchingGroups.filter((g) => g.enabled && !isFull(g));
  const fullGroups = matchingGroups.filter((g) => g.enabled && isFull(g));
  const disabledGroups = matchingGroups.filter((g) => !g.enabled);

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderTable = (sectionGroups) => (
    <div className="bg-white shadow overflow-x-auto rounded-lg">
      <table className="w-full min-w-[680px] divide-y divide-gray-200 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-8 px-3 py-3" />
            <th className="w-8 px-1 py-3" />
            <th className="w-[32%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="w-[18%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Members / Limit
            </th>
            <th className="w-[18%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="w-[14%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sectionGroups.map((group) => {
            const isExpanded = expandedGroup === group.id;
            const available = availableForGroup();
            const canAddMore = group.max_members === null || groupMembers.length < group.max_members;
            return [
              <tr
                key={group.id}
                onClick={() => handleExpandGroup(group.id)}
                className={`cursor-pointer hover:bg-gray-50 transition-colors ${!group.enabled ? 'opacity-60' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    handleExpandGroup(group.id);
                  }
                }}
              >
                <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(group.id)}
                    onChange={() => toggleSelect(group.id)}
                    aria-label={`Select ${group.name}`}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
                <td className="px-1 py-4 text-gray-400">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm font-medium text-gray-900">{group.name}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-gray-700">
                    {group.member_count}
                    {group.max_members !== null ? ` / ${group.max_members}` : ' / ∞'}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-gray-500">{new Date(group.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <IconBtn
                      label="Edit Group"
                      onClick={(e) => openEditModal(e, group)}
                      className="text-gray-500 hover:text-primary-600 hover:bg-primary-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label={group.enabled ? 'Disable Group' : 'Enable Group'}
                      onClick={(e) => handleToggleEnabled(e, group.id, group.enabled)}
                      className={
                        group.enabled
                          ? 'text-yellow-500 hover:text-yellow-700 hover:bg-yellow-50'
                          : 'text-green-500 hover:text-green-700 hover:bg-green-50'
                      }
                    >
                      <Power className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label="Set Member Limit"
                      onClick={(e) => openLimitModal(e, group)}
                      className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Gauge className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label="Delete Group"
                      onClick={(e) => handleDeleteGroup(e, group.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </td>
              </tr>,

              isExpanded && (
                <tr key={`${group.id}-expanded`} className="bg-gray-50">
                  <td colSpan={6} className="px-6 py-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Members</p>
                    {membersLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                      </div>
                    ) : (
                      <>
                        {groupMembers.length === 0 ? (
                          <p className="text-sm text-gray-500 py-2">No members in this group</p>
                        ) : (
                          <ul className="divide-y divide-gray-200 mb-3 max-w-xl">
                            {groupMembers.map((member) => (
                              <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="text-sm font-medium text-gray-900 truncate"
                                      title={member.username}
                                    >
                                      {member.username}
                                    </span>
                                    <span
                                      className={`shrink-0 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        member.role_name === 'admin'
                                          ? 'bg-red-100 text-red-800'
                                          : member.role_name === 'assignment_manager'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-green-100 text-green-800'
                                      }`}
                                    >
                                      {formatRoleName(member.role_name)}
                                    </span>
                                  </div>
                                  {(member.first_name || member.last_name) && (
                                    <span className="text-xs text-gray-600 truncate">
                                      {[member.first_name, member.last_name].filter(Boolean).join(' ')}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500 truncate">{member.email}</span>
                                  {member.student_id && (
                                    <span className="text-xs text-gray-400 truncate">ID: {member.student_id}</span>
                                  )}
                                </div>
                                {isAssignmentManager && (
                                  <button
                                    onClick={() => handleRemoveMember(member.id)}
                                    aria-label={`Remove ${member.username}`}
                                    className="shrink-0 text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isAssignmentManager && available.length > 0 && canAddMore && (
                          <div className="flex items-center gap-2 max-w-sm">
                            <select
                              value={selectedUserId}
                              onChange={(e) => setSelectedUserId(e.target.value)}
                              className="min-w-0 flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                            >
                              <option value="">Select a user to add</option>
                              {available.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.username} ({u.email})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleAddMember}
                              className="shrink-0 flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                            >
                              <Check className="h-4 w-4" />
                              Add
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ),
            ];
          })}
          {sectionGroups.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-6 text-center text-sm text-gray-500">
                — none —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderSection = (title, sectionGroups, emptyMessage) => {
    const allSelected = sectionGroups.length > 0 && sectionGroups.every((g) => selectedIds.has(g.id));
    const someSelected = !allSelected && sectionGroups.some((g) => selectedIds.has(g.id));
    const sectionSelectedIds = sectionGroups.filter((g) => selectedIds.has(g.id)).map((g) => g.id);

    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IndeterminateCheckbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={() => toggleSectionAll(sectionGroups, allSelected)}
              aria-label={`Select all ${title}`}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <h3 className="text-base font-semibold text-gray-700">
              {title} <span className="text-sm font-normal text-gray-400">({sectionGroups.length})</span>
            </h3>
          </div>
          {sectionSelectedIds.length > 0 && (
            <button
              onClick={() => openBulkLimitModal(sectionSelectedIds)}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 transition-colors"
            >
              <Gauge className="h-3.5 w-3.5" />
              Set Limit ({sectionSelectedIds.length})
            </button>
          )}
        </div>
        {sectionGroups.length === 0 ? (
          <div className="bg-white shadow rounded-lg px-6 py-6 text-center text-sm text-gray-500">{emptyMessage}</div>
        ) : (
          renderTable(sectionGroups)
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  const preview = bulkCreatePreview();

  return (
    <div className="flex-1 bg-gray-50">
      <Header pageName="Group Management" />

      <main className="w-[85%] mx-auto py-6">
        <div className="px-4 py-6 sm:px-0">
          {/* Toolbar */}
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Manage Groups</h2>
              <p className="text-gray-600 mt-1">Create and manage team groups</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setDeleteModal(selectedGroups)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete ({selectedIds.size})
                </button>
              )}
              <button
                onClick={handleExportMappings}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Export Mappings'}
              </button>
              <Link
                to="/groups/import"
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
              >
                Import Mappings
              </Link>
              <button
                onClick={() => setBulkCreateModal({ prefix: '', count: '1', maxMembers: '' })}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
              >
                Bulk Create
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
              >
                + Create Group
              </button>
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

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search groups..."
              aria-label="Search groups"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-72"
            />
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No groups created yet</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
              >
                Create your first group
              </button>
            </div>
          ) : matchingGroups.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No groups match your search</p>
            </div>
          ) : (
            <>
              {renderSection('Groups with space', openGroups, 'No open groups')}
              {renderSection('Groups full', fullGroups, 'No full groups')}
              {renderSection('Disabled groups', disabledGroups, 'No disabled groups')}
            </>
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
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Members (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={newGroupMaxMembers}
                  onChange={(e) => setNewGroupMaxMembers(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Leave blank for unlimited"
                />
              </div>
              {createFormError && <p className="mb-3 text-sm text-red-600">{createFormError}</p>}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewGroupName('');
                    setNewGroupMaxMembers('');
                    setCreateFormError('');
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

      {/* Edit Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Group</h3>
            <form onSubmit={handleEditGroup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                <input
                  type="text"
                  required
                  value={editingGroup.name}
                  onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter group name"
                  autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Members (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={editingGroup.maxMembers}
                  onChange={(e) => setEditingGroup({ ...editingGroup, maxMembers: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Leave blank for unlimited"
                />
              </div>
              {editFormError && <p className="mb-3 text-sm text-red-600">{editFormError}</p>}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingGroup(null);
                    setEditFormError('');
                  }}
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
          </div>
        </div>
      )}

      {/* Bulk Create Modal */}
      {bulkCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Bulk Create Groups</h3>
            <form onSubmit={handleBulkCreate}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Prefix</label>
                <input
                  type="text"
                  value={bulkCreateModal.prefix}
                  onChange={(e) => setBulkCreateModal({ ...bulkCreateModal, prefix: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. Team"
                  autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Number of groups</label>
                <input
                  type="number"
                  min="1"
                  value={bulkCreateModal.count}
                  onChange={(e) => setBulkCreateModal({ ...bulkCreateModal, count: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. 10"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Member limit <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={bulkCreateModal.maxMembers}
                  onChange={(e) => setBulkCreateModal({ ...bulkCreateModal, maxMembers: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Unlimited"
                />
              </div>
              {preview.length > 0 && (
                <div className="mb-4 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
                  <p className="font-medium text-gray-700 mb-1">Preview:</p>
                  {preview.length <= 5 ? (
                    <p>{preview.join(', ')}</p>
                  ) : (
                    <p>
                      {preview.slice(0, 3).join(', ')}, &hellip;, {preview[preview.length - 1]}
                      <span className="ml-1 text-gray-400">({preview.length} groups)</span>
                    </p>
                  )}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setBulkCreateModal(null)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={preview.length === 0}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create {preview.length > 0 ? preview.length : ''} Groups
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Limit Modal (single or bulk) */}
      {limitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Set Member Limit</h3>
            {limitModal.groupIds.length > 1 && (
              <p className="text-sm text-gray-500 mb-3">
                Applies to <span className="font-medium">{limitModal.groupIds.length}</span> selected groups.
              </p>
            )}
            <p className="text-sm text-gray-500 mb-3">Leave blank to set unlimited members.</p>
            <input
              type="number"
              min="1"
              value={limitModal.value}
              onChange={(e) => setLimitModal({ ...limitModal, value: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
              placeholder="Unlimited"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setLimitModal(null)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLimit}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (single or bulk) */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Delete {deleteModal.length} group{deleteModal.length > 1 ? 's' : ''}?
            </h3>
            {deleteModalWithMembers.length > 0 && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-sm text-yellow-800">
                <p className="font-medium mb-1">
                  {deleteModalWithMembers.length} group{deleteModalWithMembers.length > 1 ? 's have' : ' has'} members
                  that will be unassigned:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {deleteModalWithMembers.map((g) => (
                    <li key={g.id}>
                      {g.name}{' '}
                      <span className="text-yellow-600">
                        ({g.member_count} member{g.member_count > 1 ? 's' : ''})
                      </span>
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
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : `Delete ${deleteModal.length} group${deleteModal.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Groups;
