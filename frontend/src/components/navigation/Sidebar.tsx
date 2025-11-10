import { NavLink } from 'react-router-dom';
import { useAuth, useTenant } from '../../context/AuthContext';

const routes = [
  { to: '/app', label: 'Dashboard' },
  { to: '/app/invoices', label: 'Invoices' },
  { to: '/app/payments', label: 'Payments' },
  { to: '/app/clients', label: 'Clients' },
  { to: '/app/settings', label: 'Settings' },
];

function Sidebar() {
  const { user } = useAuth();
  const { organizations, activeOrgId, setActiveOrgId, orgRoles } = useTenant();
  const activeRole = activeOrgId ? orgRoles[activeOrgId] : undefined;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden>
          💼
        </span>
        <div>
          <p className="sidebar__title">Firebase Invoicer</p>
          <small className="sidebar__subtitle">Cloud-native billing</small>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {routes.map((route) => (
          <NavLink
            key={route.to}
            to={route.to}
            end={route.to === '/app'}
            className={({ isActive }) => (isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link')}
          >
            {route.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__tenant">
          <label htmlFor="organization-select">Organization</label>
          <select
            id="organization-select"
            value={activeOrgId ?? ''}
            onChange={(event) => setActiveOrgId(event.target.value)}
            disabled={organizations.length === 0}
          >
            {organizations.length === 0 ? <option value="">No organizations</option> : null}
            {organizations.map((orgId) => (
              <option key={orgId} value={orgId}>
                {orgId}
              </option>
            ))}
          </select>
          <span className="sidebar__role">{activeRole ? `Role: ${activeRole}` : 'Role: —'}</span>
        </div>
        <p className="sidebar__user">{user?.email}</p>
        <small className="sidebar__env">{import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'project-id'}</small>
      </div>
    </aside>
  );
}

export default Sidebar;
