import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '@/utils/api';
import { useAuth } from '../context/AuthContext.jsx';
import Header from '../components/Header.jsx';
import IconBtn from '../components/IconBtn.jsx';
import TypedDeleteConfirmModal from '../components/TypedDeleteConfirmModal.jsx';
import SubjectMembersSection from '../components/SubjectMembersSection.jsx';
import { Trash2 } from 'lucide-react';
import { parseBody, createAssignmentSchema } from '../utils/schemas.js';
import { API_BASE } from '../config.js';
import Modal from '../components/Modal.jsx';

function SubjectDetail() {
  const { subjectId } = useParams();
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [subject, setSubject] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create assignment modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAssignmentName, setNewAssignmentName] = useState('');
  const [createFormError, setCreateFormError] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete confirmation modal — holds the assignment to delete
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const successTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);

  const fetchSubject = useCallback(async () => {
    try {
      const response = await api.get(`${API_BASE}/subjects/${subjectId}`);
      setSubject(response.data.subject || null);
      setAssignments(response.data.assignments || []);
      setLoadError(false);
    } catch (_err) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  // Re-fetch whenever this page is navigated to (location.key changes on each navigation).
  useEffect(() => {
    fetchSubject();
  }, [location.key, fetchSubject]);

  // Re-fetch when the browser tab becomes visible again (multi-tab scenario).
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) {
        fetchSubject();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchSubject]);

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

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    setCreateFormError('');
    const { data: body, error: validationError } = parseBody(createAssignmentSchema, {
      subjectId,
      name: newAssignmentName,
    });
    if (validationError) {
      setCreateFormError(validationError);
      return;
    }
    setCreating(true);
    try {
      await api.post(`${API_BASE}/assignments`, { subjectId: body.subjectId, name: body.name });
      showSuccess('Assignment created successfully');
      setNewAssignmentName('');
      setShowCreateModal(false);
      fetchSubject();
    } catch (err) {
      setCreateFormError(err.response?.data?.error || 'Failed to create assignment');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    try {
      await api.delete(`${API_BASE}/assignments/${deleteModal.id}`);
      showSuccess('Assignment deleted successfully');
      setDeleteModal(null);
      fetchSubject();
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete assignment');
      setDeleteModal(null);
    } finally {
      setDeleting(false);
    }
  };

  // Admins manage every subject; assignment managers only manage subjects where
  // they manage at least one assignment (managedAssignments rows carry subject_id).
  const canManage = isAdmin || (user?.managedAssignments || []).some((a) => a.subject_id === subject?.id);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 bg-gray-50">
        <Header pageName="Subject" />
        <main className="w-[85%] mx-auto py-6">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
              Failed to load subject
            </div>
            <Link to="/subjects" className="text-primary-600 hover:text-primary-700 font-medium">
              Back to Subjects
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50">
      <Header pageName="Subject" />

      <main className="w-[85%] mx-auto py-6">
        <div className="px-4 py-6 sm:px-0">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500">
            <Link to="/subjects" className="text-primary-600 hover:text-primary-700">
              Subjects
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900 font-medium">{subject?.name}</span>
          </nav>

          {/* Toolbar */}
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{subject?.name}</h2>
              <p className="text-gray-600 mt-1">Assignments in this subject</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
              >
                + Create Assignment
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

          {assignments.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No assignments yet</p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-x-auto rounded-lg">
              <table className="w-full min-w-[680px] divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-[40%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="w-[16%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Groups
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
                  {assignments.map((assignment) => (
                    <tr
                      key={assignment.id}
                      onClick={() => navigate(`/subjects/${subjectId}/assignments/${assignment.id}`)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                          e.preventDefault();
                          navigate(`/subjects/${subjectId}/assignments/${assignment.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-gray-900">{assignment.name}</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{assignment.group_count}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(assignment.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        {isAdmin && (
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <IconBtn
                              label="Delete Assignment"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModal(assignment);
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

          {/* Members section — visible only to admins and managers of this subject */}
          {subject && canManage && <SubjectMembersSection subject={subject} isAdmin={isAdmin} canManage={canManage} />}
        </div>
      </main>

      {/* Create Assignment Modal */}
      {showCreateModal && (
        <Modal title="Create New Assignment" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateAssignment}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Name</label>
              <input
                type="text"
                value={newAssignmentName}
                onChange={(e) => setNewAssignmentName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Enter assignment name"
                autoFocus
              />
            </div>
            {createFormError && <p className="mb-3 text-sm text-red-600">{createFormError}</p>}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewAssignmentName('');
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
        </Modal>
      )}

      {/* Delete Assignment Modal (two-step typed confirmation) */}
      {deleteModal && (
        <TypedDeleteConfirmModal
          entityLabel="assignment"
          entityName={deleteModal.name}
          warning={`${deleteModal.group_count} groups and their memberships will be permanently deleted`}
          deleting={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}

export default SubjectDetail;
