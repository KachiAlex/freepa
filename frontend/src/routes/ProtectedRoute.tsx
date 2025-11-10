import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="route-loading">
        <span aria-busy="true">Checking access...</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location }} />
  }

  return <Outlet />
}

export default ProtectedRoute

