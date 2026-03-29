import { useState, useRef, useEffect } from 'react';
import { ChevronDown, UserCircle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import { formatRoleName } from '../utils/formatting.js';
import { parseBody, updateUserSchema, newPasswordSchema } from '../utils/schemas.js';
import { API_BASE } from '../config.js';

function UserMenu() {
  const { user, logout, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null); // null | 'editProfile' | 'changePassword'

  // Edit Profile state
  const [profileForm, setProfileForm] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Change Password state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openEditProfile = () => {
    setOpen(false);
    setProfileError('');
    setProfileForm({
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      studentId: user.studentId || '',
    });
    setModal('editProfile');
  };

  const openChangePassword = () => {
    setOpen(false);
    setPasswordError('');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setModal('changePassword');
  };

  const closeModal = () => {
    setModal(null);
    setProfileError('');
    setProfileSuccess('');
    setPasswordError('');
    setPasswordSuccess('');
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');

    const payload = {
      email: profileForm.email,
      firstName: profileForm.firstName || null,
      lastName: profileForm.lastName || null,
    };
    if (user.role === 'user') {
      payload.studentId = profileForm.studentId || null;
    }

    const { data: body, error: validationError } = parseBody(updateUserSchema, payload);
    if (validationError) {
      setProfileError(validationError);
      return;
    }

    setProfileSaving(true);
    try {
      await axios.put(`${API_BASE}/users/${user.id}`, body);
      await refreshUser();
      setProfileSuccess('Profile updated successfully');
      setTimeout(() => {
        setModal(null);
        setProfileSuccess('');
      }, 1500);
    } catch (err) {
      setProfileError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    const pwResult = newPasswordSchema.safeParse(passwordForm.newPassword);
    if (!pwResult.success) {
      setPasswordError(pwResult.error.issues[0]?.message || 'Invalid password');
      return;
    }

    setPasswordSaving(true);
    try {
      await axios.put(`${API_BASE}/users/${user.id}/password`, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess('Password changed successfully');
      setTimeout(() => {
        setModal(null);
        setPasswordSuccess('');
      }, 1500);
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Dropdown trigger */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 focus:outline-none"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <UserCircle className="h-5 w-5 text-gray-400" />
          {user.username} ({formatRoleName(user.role)})
          <ChevronDown className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-44 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
            <button
              onClick={openEditProfile}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit Profile
            </button>
            <button
              onClick={openChangePassword}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Change Password
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={logout} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {modal === 'editProfile' && profileForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Profile</h3>
            {profileSuccess && (
              <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md text-sm">
                {profileSuccess}
              </div>
            )}
            {profileError && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm">
                {profileError}
              </div>
            )}
            <form onSubmit={handleSaveProfile}>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={user.username}
                  disabled
                  className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">Username cannot be changed</p>
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
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
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
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
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter last name"
                />
              </div>
              {user.role === 'user' && (
                <div className="mb-4">
                  <label htmlFor="profileStudentId" className="block text-sm font-medium text-gray-700 mb-1">
                    Student ID
                  </label>
                  <input
                    id="profileStudentId"
                    type="text"
                    value={profileForm.studentId}
                    onChange={(e) => setProfileForm({ ...profileForm, studentId: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Enter student ID"
                  />
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 hover:text-gray-900">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {profileSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {modal === 'changePassword' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
            {passwordSuccess && (
              <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md text-sm">
                {passwordSuccess}
              </div>
            )}
            {passwordError && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-sm">
                {passwordError}
              </div>
            )}
            <form onSubmit={handleChangePassword}>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter current password"
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter new password"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Confirm new password"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 hover:text-gray-900">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {passwordSaving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default UserMenu;
