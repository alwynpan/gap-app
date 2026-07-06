import { useState } from 'react';
import api from '@/utils/api';
import CascadingAssignmentSelect from './CascadingAssignmentSelect.jsx';
import { API_BASE } from '../config.js';

/**
 * Modal for assigning a user to a group within a subject/assignment, or
 * removing them from their current group for the selected assignment.
 * A user may only be placed in groups of subjects they belong to, so the
 * cascade offers only the target user's subjects.
 */
function AssignGroupModal({ user, subjects, onClose, onAssigned }) {
  const [selection, setSelection] = useState({ subjectId: '', assignmentId: '', groupId: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const membershipSubjectIds = new Set((user.memberships || []).map((m) => m.subject_id).filter(Boolean));
  const availableSubjects = user.subjects || (subjects || []).filter((s) => membershipSubjectIds.has(s.id));

  const hasMembershipForAssignment =
    selection.assignmentId && (user.memberships || []).some((m) => m.assignment_id === selection.assignmentId);

  const submitGroupChange = async (groupId) => {
    setError('');
    setSaving(true);
    try {
      await api.put(`${API_BASE}/users/${user.id}/group`, {
        assignmentId: selection.assignmentId,
        groupId,
      });
      onAssigned();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update group');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = () => submitGroupChange(selection.groupId);
  const handleRemove = () => submitGroupChange(null);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Group — {user.username}</h3>
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">{error}</div>
        )}
        <CascadingAssignmentSelect
          subjects={availableSubjects}
          value={selection}
          onChange={setSelection}
          disabled={saving}
        />
        {hasMembershipForAssignment && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="mb-3 px-4 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Remove from group
          </button>
        )}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={saving || !selection.subjectId || !selection.assignmentId || !selection.groupId}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssignGroupModal;
