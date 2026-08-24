import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Footer from './components/Footer.jsx';

// Pages
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import SetPassword from './pages/SetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import ImportUsers from './pages/ImportUsers.jsx';
import Groups from './pages/Groups.jsx';
import ImportGroupMappings from './pages/ImportGroupMappings.jsx';
import Settings from './pages/Settings.jsx';
import Subjects from './pages/Subjects.jsx';
import SubjectDetail from './pages/SubjectDetail.jsx';

function PublicRoute({ children }) {
  const { user } = useAuth();
  return user ? <Navigate to="/dashboard" replace /> : children;
}

/** Keeps /register mounted while the feature flag is still loading, so a deep
 *  link is not swallowed by the catch-all before the flag arrives. */
function RegisterRoute() {
  const { registrationEnabled, registrationConfigLoading } = useAuth();

  if (registrationConfigLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  if (!registrationEnabled) {
    return <Navigate to="/login" replace />;
  }
  return (
    <PublicRoute>
      <Register />
    </PublicRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route path="/register" element={<RegisterRoute />} />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/set-password"
        element={
          <PublicRoute>
            <SetPassword />
          </PublicRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Admin-only Routes */}
      <Route
        path="/users"
        element={
          <ProtectedRoute requireAdmin>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/import"
        element={
          <ProtectedRoute requireAdmin>
            <ImportUsers />
          </ProtectedRoute>
        }
      />

      {/* Subject / Assignment hierarchy */}
      <Route
        path="/subjects"
        element={
          <ProtectedRoute requireAssignmentManager>
            <Subjects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subjects/:subjectId"
        element={
          <ProtectedRoute requireAssignmentManager>
            <SubjectDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subjects/:subjectId/assignments/:assignmentId"
        element={
          <ProtectedRoute requireAssignmentManager>
            <Groups />
          </ProtectedRoute>
        }
      />

      {/* Legacy groups routes — keep bookmark compatibility */}
      <Route path="/groups" element={<Navigate to="/subjects" replace />} />
      <Route
        path="/groups/import"
        element={
          <ProtectedRoute requireAssignmentManager>
            <ImportGroupMappings />
          </ProtectedRoute>
        }
      />

      {/* Admin/Assignment Manager Settings */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute requireAssignmentManager>
            <Settings />
          </ProtectedRoute>
        }
      />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* 404 - Redirect to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen flex flex-col">
          <div className="flex-1 flex flex-col">
            <AppRoutes />
          </div>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
