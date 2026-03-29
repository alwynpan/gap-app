import { useAuth } from '../context/AuthContext.jsx';
import { Link } from 'react-router-dom';
import UserMenu from './UserMenu.jsx';

function Header({ pageName }) {
  const { user } = useAuth();

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
          <div className="flex items-center space-x-4">{user && <UserMenu />}</div>
        </div>
      </div>
    </nav>
  );
}

export default Header;
