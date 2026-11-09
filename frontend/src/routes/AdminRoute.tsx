import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function AdminRoute() {
  const { user, loading, isPlatformAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="route-loading">
        <span aria-busy="true">Verifying admin access…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/admin/login" replace state={{ from: location, reason: 'not-authorized' }} />;
  }

  return <Outlet />;
}

export default AdminRoute;

