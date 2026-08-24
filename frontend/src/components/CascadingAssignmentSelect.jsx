import { useState, useEffect, useRef, useId } from 'react';
import api from '@/utils/api';
import { API_BASE } from '../config.js';

const SELECT_CLASS =
  'w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500';

/**
 * Cascading Subject -> Assignment -> Group selects.
 * Fetches assignments for the selected subject and groups for the selected
 * assignment, caching responses per id so re-selecting doesn't refetch.
 */
function CascadingAssignmentSelect({ subjects, value, onChange, showGroup = true, disabled = false, labels = {} }) {
  const [assignments, setAssignments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const assignmentsCacheRef = useRef(new Map());
  const groupsCacheRef = useRef(new Map());
  const idPrefix = useId();

  const subjectLabel = labels.subject || 'Subject';
  const assignmentLabel = labels.assignment || 'Assignment';
  const groupLabel = labels.group || 'Group';

  useEffect(() => {
    if (!value.subjectId) {
      setAssignments([]);
      return undefined;
    }
    const cached = assignmentsCacheRef.current.get(value.subjectId);
    if (cached) {
      setAssignments(cached);
      return undefined;
    }
    let cancelled = false;
    setError('');
    api
      .get(`${API_BASE}/subjects/${value.subjectId}`)
      .then((res) => {
        const fetched = res.data.assignments || [];
        assignmentsCacheRef.current.set(value.subjectId, fetched);
        if (!cancelled) {
          setAssignments(fetched);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssignments([]);
          setError('Failed to load options');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [value.subjectId]);

  useEffect(() => {
    if (!value.assignmentId || !showGroup) {
      setGroups([]);
      return undefined;
    }
    const cached = groupsCacheRef.current.get(value.assignmentId);
    if (cached) {
      setGroups(cached);
      return undefined;
    }
    let cancelled = false;
    setError('');
    api
      .get(`${API_BASE}/assignments/${value.assignmentId}/groups`)
      .then((res) => {
        const fetched = res.data.groups || [];
        groupsCacheRef.current.set(value.assignmentId, fetched);
        if (!cancelled) {
          setGroups(fetched);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
          setError('Failed to load options');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [value.assignmentId, showGroup]);

  const groupOptionLabel = (group) =>
    group.max_members ? `${group.name} (${group.member_count}/${group.max_members})` : group.name;

  return (
    <div>
      <div className="mb-3">
        <label htmlFor={`${idPrefix}-subject`} className="block text-sm font-medium text-gray-700 mb-1">
          {subjectLabel}
        </label>
        <select
          id={`${idPrefix}-subject`}
          value={value.subjectId}
          onChange={(e) => onChange({ subjectId: e.target.value, assignmentId: '', groupId: '' })}
          disabled={disabled}
          className={SELECT_CLASS}
        >
          <option value="">Select subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3">
        <label htmlFor={`${idPrefix}-assignment`} className="block text-sm font-medium text-gray-700 mb-1">
          {assignmentLabel}
        </label>
        <select
          id={`${idPrefix}-assignment`}
          value={value.assignmentId}
          onChange={(e) => onChange({ ...value, assignmentId: e.target.value, groupId: '' })}
          disabled={disabled || !value.subjectId}
          className={SELECT_CLASS}
        >
          <option value="">Select assignment</option>
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.name}
            </option>
          ))}
        </select>
      </div>
      {showGroup && (
        <div className="mb-3">
          <label htmlFor={`${idPrefix}-group`} className="block text-sm font-medium text-gray-700 mb-1">
            {groupLabel}
          </label>
          <select
            id={`${idPrefix}-group`}
            value={value.groupId}
            onChange={(e) => onChange({ ...value, groupId: e.target.value })}
            disabled={disabled || !value.assignmentId}
            className={SELECT_CLASS}
          >
            <option value="">Select group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {groupOptionLabel(group)}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default CascadingAssignmentSelect;
