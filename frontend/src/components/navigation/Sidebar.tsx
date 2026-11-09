import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth, useTenant } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useOrganizationList } from '../../hooks/useOrganizationProfile';
import { useInvoices } from '../../hooks/useInvoices';
import { Drawer } from '../ui/Drawer';

const workspaceNav = [
  { to: '/app', label: 'Overview', icon: '▦', end: true },
  { to: '/app/invoices', label: 'Invoices', icon: '▤' },
  { to: '/app/payments', label: 'Payments', icon: '◈' },
  { to: '/app/clients', label: 'Clients', icon: '♙' },
  { to: '/app/reports', label: 'Reports', icon: '▥' },
];

const managementNav = [
  { to: '/admin', label: 'Platform overview', icon: '◉', end: true },
  { to: '/admin/organizations', label: 'Organizations', icon: '▣' },
  { to: '/admin/users', label: 'Users', icon: '♧' },
  { to: '/admin/invoices', label: 'All invoices', icon: '▤' },
  { to: '/admin/payments', label: 'All payments', icon: '◈' },
];

function initials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { user, signOut } = useAuth();
  const { organizations, activeOrgId, setActiveOrgId, orgRoles, isPlatformAdmin } = useTenant();
  const { notify } = useToast();
  const navigate = useNavigate();
  const organizationListQuery = useOrganizationList(organizations);
  const invoicesQuery = useInvoices(activeOrgId ?? undefined);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const orgName = (orgId: string) =>
    organizationListQuery.data?.find((org) => org.id === orgId)?.name ?? orgId;

  const activeOrgName = activeOrgId ? orgName(activeOrgId) : 'No workspace';
  const invoiceCount = invoicesQuery.data?.length;

  const handleSignOut = async () => {
    setAccountOpen(false);
    await signOut();
    navigate('/auth/sign-in', { replace: true });
  };

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-symbol">f.</span>
          <div className="brand-text">
            free<span>pa</span>
          </div>
        </div>

        <button type="button" className="workspace" onClick={() => setSwitcherOpen(true)}>
          <span className="avatar">{initials(activeOrgName).charAt(0)}</span>
          <div>
            <strong>{activeOrgName}</strong>
            <small>Business workspace</small>
          </div>
          <span className="chev">⌄</span>
        </button>

        <div className="section-label">WORKSPACE</div>
        <nav>
          {workspaceNav.map((route) => (
            <NavLink
              key={route.to}
              to={route.to}
              end={route.end}
              onClick={onNavigate}
              className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}
            >
              <span className="nav-ico">{route.icon}</span>
              {route.label}
              {route.to === '/app/invoices' && typeof invoiceCount === 'number' ? (
                <span className="counter">{invoiceCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        {isPlatformAdmin ? (
          <>
            <div className="section-label" style={{ marginTop: 25 }}>
              MANAGEMENT
            </div>
            <nav>
              {managementNav.map((route) => (
                <NavLink
                  key={route.to}
                  to={route.to}
                  end={route.end}
                  onClick={onNavigate}
                  className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-ico">{route.icon}</span>
                  {route.label}
                </NavLink>
              ))}
            </nav>
          </>
        ) : null}

        <div className="side-bottom">
          <div className="help">
            <b style={{ fontSize: 12 }}>Need a hand?</b>
            <p>Explore tips to make invoicing and payment collection easier.</p>
            <button type="button" onClick={() => notify('Help center is not configured yet.')}>
              Visit help center ↗
            </button>
          </div>
          <NavLink
            to="/app/settings"
            onClick={onNavigate}
            className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}
          >
            <span className="nav-ico">⚙</span> Settings
          </NavLink>
          <button type="button" className="nav" onClick={() => setAccountOpen(true)}>
            <span className="nav-ico">◉</span> Account
          </button>
        </div>
      </aside>

      <Drawer open={switcherOpen} onClose={() => setSwitcherOpen(false)}>
        <h2>Switch workspace</h2>
        <p>Choose the business whose invoices and payments you want to manage.</p>
        {organizations.length === 0 ? (
          <div className="info">No organizations yet — create your first company from Settings.</div>
        ) : (
          organizations.map((orgId) => (
            <button
              key={orgId}
              type="button"
              className="member"
              style={{ cursor: 'pointer', background: 'none', border: 0, width: '100%', textAlign: 'left', padding: '14px 0' }}
              onClick={() => {
                setActiveOrgId(orgId);
                setSwitcherOpen(false);
                notify(`Workspace selected: ${orgName(orgId)}`);
              }}
            >
              <span className="avatar">{initials(orgName(orgId)).charAt(0)}</span>
              <span className="meta">
                <b>{orgName(orgId)}</b>
                <small>{orgRoles[orgId] ?? 'member'} · workspace</small>
              </span>
              →
            </button>
          ))
        )}
        <button
          type="button"
          className="btn"
          style={{ marginTop: 20 }}
          onClick={() => {
            setSwitcherOpen(false);
            navigate('/app/settings');
          }}
        >
          + Create company
        </button>
      </Drawer>

      <Drawer open={accountOpen} onClose={() => setAccountOpen(false)}>
        <h2>Account</h2>
        <p>Your FreePA account details.</p>
        <div className="member">
          <span className="avatar">{initials(user?.email ?? '?')}</span>
          <span className="meta">
            <b>{user?.email ?? 'Signed in'}</b>
            <small>{isPlatformAdmin ? 'Platform admin' : 'Member'}</small>
          </span>
        </div>
        <div className="drawer-actions">
          <button type="button" className="btn destructive" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </Drawer>
    </>
  );
}

export default Sidebar;
