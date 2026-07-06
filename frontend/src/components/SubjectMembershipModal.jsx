import { useState } from 'react';
import api from '@/utils/api';
import { API_BASE } from '../config.js';

/**
 * Modal for managing which subjects a user belongs to.
 * Shows a checkbox per subject (pre-checked for current subjects). On save it
 * diffs against the original enrolment and issues POST /subjects/:id/users for
 * additions and DELETE /subjects/:id/users/:userId for removals.
 */
function SubjectMembershipModal({ user, subjects, onClose, onChanged }) {
  const originalIds = new Set((user.subjects || []).map((s) => s.id));
  const [selectedIds, setSelectedIds] = useState(() => new Set(originalIds));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const additions = (subjects || []).map((s) => s.id).filter((id) => selectedIds.has(id) && !originalIds.has(id));
  const removals = [...originalIds].filter((id) => !selectedIds.has(id));

  const membershipSubjectIds = new Set((user.memberships || []).map((m) => m.subject_id).filter(Boolean));
  const removalAffectsMemberships = removals.some((id) => membershipSubjectIds.has(id));

  const toggle = (id) => {
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

  const handleSave = async () => {
    if (additions.length === 0 && removals.length === 0) {
      onClose();
      return;
    }
    setError('');
    setSaving(true);
    try {
      for (const id of additions) {
        await api.post(`${API_BASE}/subjects/${id}/users`, { userIds: [user.id] });
      }
      for (const id of removals) {
        await api.delete(`${API_BASE}/subjects/${id}/users/${user.id}`);
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update subjects');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Manage Subjects — {user.username}</h3>
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">{error}</div>
        )}
        <div className="mb-3 space-y-2">
          {(subjects || []).map((subject) => (
            <label key={subject.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(subject.id)}
                onChange={() => toggle(subject.id)}
                disabled={saving}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">{subject.name}</span>
            </label>
          ))}
          {(subjects || []).length === 0 && <p className="text-sm text-gray-500">No subjects available.</p>}
        </div>
        {removalAffectsMemberships && (
          <div className="mb-3 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm">
            {"Removing a subject also removes the user's group memberships in it."}
          </div>
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
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubjectMembershipModal;
