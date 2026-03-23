import { useAuth } from '../context/AuthContext.jsx';
import { Link } from 'react-router-dom';
import { formatRoleName } from '../utils/formatting.js';

function Header({ pageName }) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="text-xl font-bold text-primary-600 hover:text-primary-700">
              G.A.P. <span className="text-base font-semibold text-gray-500">Group Assignment Portal</span>
            </Link>
            {pageName && <span className="ml-4 text-sm text-gray-500">{pageName}</span>}
          </div>
          <div className="flex items-center space-x-4">
            {user && (
              <>
                <span className="text-sm text-gray-600">
                  {user.username} ({formatRoleName(user.role)})
                </span>
                <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-700">
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Header;
