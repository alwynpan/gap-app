import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from '../components/Header.jsx';
import IconBtn from '../components/IconBtn.jsx';
import TypedDeleteConfirmModal from '../components/TypedDeleteConfirmModal.jsx';
import { Trash2 } from 'lucide-react';
import { parseBody, createSubjectSchema } from '../utils/schemas.js';
import { API_BASE } from '../config.js';

function Subjects() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Create subject modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [createFormError, setCreateFormError] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete confirmation modal — holds the subject to delete
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const successTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);

  // Re-fetch whenever this page is navigated to (location.key changes on each navigation).
  useEffect(() => {
    fetchSubjects();
  }, [location.key]);

  // Re-fetch when the browser tab becomes visible again (multi-tab scenario).
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) {
        fetchSubjects();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const fetchSubjects = async () => {
    try {
      const response = await api.get(`${API_BASE}/subjects`);
      setSubjects(response.data.subjects || []);
    } catch (_err) {
      setError('Failed to load subjects');
    } finally {
      setLoading(false);
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

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    setCreateFormError('');
    const { data: body, error: validationError } = parseBody(createSubjectSchema, { name: newSubjectName });
    if (validationError) {
      setCreateFormError(validationError);
      return;
    }
    setCreating(true);
    try {
      await api.post(`${API_BASE}/subjects`, { name: body.name });
      showSuccess('Subject created successfully');
      setNewSubjectName('');
      setShowCreateModal(false);
      fetchSubjects();
    } catch (err) {
      setCreateFormError(err.response?.data?.error || 'Failed to create subject');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    try {
      await api.delete(`${API_BASE}/subjects/${deleteModal.id}`);
      showSuccess('Subject deleted successfully');
      setDeleteModal(null);
      fetchSubjects();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete subject');
      setDeleteModal(null);
    } finally {
      setDeleting(false);
    }
  };

  const matchingSubjects = searchTerm
    ? subjects.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : subjects;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50">
      <Header pageName="Subjects" />

      <main className="w-[85%] mx-auto py-6">
        <div className="px-4 py-6 sm:px-0">
          {/* Toolbar */}
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Manage Subjects</h2>
              <p className="text-gray-600 mt-1">Browse subjects and drill into their assignments</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
              >
                + Create Subject
              </button>
            )}
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
              placeholder="Search subjects..."
              aria-label="Search subjects"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-72"
            />
          </div>

          {matchingSubjects.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No subjects found</p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-x-auto rounded-lg">
              <table className="w-full min-w-[680px] divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-[36%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="w-[16%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assignments
                    </th>
                    <th className="w-[16%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Members
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
                  {matchingSubjects.map((subject) => (
                    <tr
                      key={subject.id}
                      onClick={() => navigate(`/subjects/${subject.id}`)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                          e.preventDefault();
                          navigate(`/subjects/${subject.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-gray-900">{subject.name}</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{subject.assignment_count}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{subject.member_count}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(subject.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        {isAdmin && (
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <IconBtn
                              label="Delete Subject"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModal(subject);
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconBtn>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create Subject Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Subject</h3>
            <form onSubmit={handleCreateSubject}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject Name</label>
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter subject name"
                  autoFocus
                />
              </div>
              {createFormError && <p className="mb-3 text-sm text-red-600">{createFormError}</p>}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewSubjectName('');
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

      {/* Delete Subject Modal (two-step typed confirmation) */}
      {deleteModal && (
        <TypedDeleteConfirmModal
          entityLabel="subject"
          entityName={deleteModal.name}
          warning={`${deleteModal.assignment_count} assignments and ${deleteModal.member_count} members will be permanently deleted`}
          deleting={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}

export default Subjects;
