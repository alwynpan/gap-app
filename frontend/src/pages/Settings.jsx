import { useState, useEffect } from 'react';
import axios from 'axios';
import Header from '../components/Header.jsx';
import { API_BASE } from '../config.js';

function Settings() {
  const [groupJoinLocked, setGroupJoinLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    axios
      .get(`${API_BASE}/config`)
      .then((res) => {
        const rows = res.data.config || [];
        const lockRow = rows.find((r) => r.key === 'group_join_locked');
        setGroupJoinLocked(lockRow?.value === 'true');
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleToggleLock = async () => {
    setUpdating(true);
    setError('');
    setSuccess('');
    const newValue = !groupJoinLocked;
    try {
      await axios.put(`${API_BASE}/config/group_join_locked`, { value: String(newValue) });
      setGroupJoinLocked(newValue);
      setSuccess('Settings updated successfully');
      setTimeout(() => setSuccess(''), 2000);
    } catch (_err) {
      setError('Failed to update settings');
    } finally {
      setUpdating(false);
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
              <h3 className="text-lg font-medium text-gray-900 mb-4">Group Settings</h3>

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
              ) : (
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Lock group joining</p>
                    <p className="text-sm text-gray-500">
                      When enabled, students cannot join or leave groups on their own.
                    </p>
                  </div>
                  <button
                    onClick={handleToggleLock}
                    disabled={updating}
                    aria-label={groupJoinLocked ? 'Disable group join lock' : 'Enable group join lock'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      groupJoinLocked ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        groupJoinLocked ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Settings;
