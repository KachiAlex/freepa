import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const adminRoutes = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/organizations', label: 'Organizations' },
  { to: '/admin/invoices', label: 'Invoices' },
  { to: '/admin/payments', label: 'Payments' },
];

function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__logo" aria-hidden>
            🛠️
          </span>
          <div>
            <p className="admin-sidebar__title">FREEPA Admin</p>
            <small className="admin-sidebar__subtitle">Platform control center</small>
          </div>
        </div>
        <nav className="admin-sidebar__nav" aria-label="Admin navigation">
          {adminRoutes.map((route) => (
            <NavLink
              key={route.to}
              to={route.to}
              end={route.end}
              className={({ isActive }) =>
                isActive ? 'admin-sidebar__link admin-sidebar__link--active' : 'admin-sidebar__link'
              }
            >
              {route.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <p>{user?.email}</p>
        </div>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;

