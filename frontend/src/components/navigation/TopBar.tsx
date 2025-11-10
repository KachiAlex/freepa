import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function TopBar() {
  const { user, signOut, isPlatformAdmin } = useAuth()
  const location = useLocation()

  const onAdminArea = location.pathname.startsWith('/admin')

  return (
    <header className="topbar">
      <div className="topbar__context">
        <h1 className="topbar__title">Overview</h1>
        <p className="topbar__subtitle">Stay on top of invoices, payments, and clients.</p>
      </div>
      <div className="topbar__actions">
        {isPlatformAdmin ? (
          onAdminArea ? (
            <Link to="/app" className="button button--ghost">
              Exit admin
            </Link>
          ) : (
            <Link to="/admin" className="button button--ghost">
              Admin
            </Link>
          )
        ) : null}
        <span className="topbar__user">{user?.email}</span>
        <button type="button" className="button button--ghost" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </header>
  )
}

export default TopBar

