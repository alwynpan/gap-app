import { useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';
import Header from '../components/Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../config.js';

/**
 * Per-assignment group-join locks. Admins see every assignment; a manager sees
 * only the ones they actually manage, since the lock endpoint requires exact
 * management and /assignments also returns subjects they merely belong to.
 */
function Settings() {
  const { isAdmin, managedAssignmentIds } = useAuth();
  // AuthContext rebuilds this array every render, so depend on a stable key
  // rather than the array identity or the fetch effect would loop.
  const managedKey = managedAssignmentIds.join(',');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await api.get(`${API_BASE}/assignments`);
      const all = res.data.assignments || [];
      // /assignments also returns assignments from subjects the manager merely
      // belongs to; the lock endpoint requires managing them, so showing those
      // rows would offer a toggle that always 403s.
      const managed = new Set(managedKey ? managedKey.split(',') : []);
      setAssignments(isAdmin ? all : all.filter((a) => managed.has(a.id)));
      setError('');
    } catch (_err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, managedKey]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleToggleLock = async (assignment) => {
    const nextValue = !assignment.join_locked;
    setUpdatingId(assignment.id);
    setError('');
    setSuccess('');
    try {
      await api.put(`${API_BASE}/assignments/${assignment.id}/join-lock`, { joinLocked: nextValue });
      setAssignments((prev) => prev.map((a) => (a.id === assignment.id ? { ...a, join_locked: nextValue } : a)));
      setSuccess(nextValue ? 'Group joining locked' : 'Group joining unlocked');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update settings');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="flex-1 bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">Group joining</h3>
              <p className="mt-1 mb-4 text-sm text-gray-500">
                Lock an assignment to stop students joining or leaving its groups on their own. Staff can still place
                members while it is locked.
              </p>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-3 py-2 rounded-md text-sm">
                  {success}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                </div>
              ) : assignments.length === 0 ? (
                <p className="py-3 text-sm text-gray-500">No assignments available.</p>
              ) : (
                <ul>
                  {assignments.map((assignment) => (
                    <li
                      key={assignment.id}
                      className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{assignment.name}</p>
                        <p className="text-sm text-gray-500">{assignment.subject_name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm ${assignment.join_locked ? 'text-yellow-700' : 'text-gray-500'}`}>
                          {assignment.join_locked ? 'Locked' : 'Open'}
                        </span>
                        <button
                          onClick={() => handleToggleLock(assignment)}
                          disabled={updatingId === assignment.id}
                          aria-label={
                            assignment.join_locked
                              ? `Unlock group joining for ${assignment.name}`
                              : `Lock group joining for ${assignment.name}`
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                            assignment.join_locked ? 'bg-primary-600' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              assignment.join_locked ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Settings;
