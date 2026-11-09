import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

const CRUMBS: Array<{ match: RegExp; label: string }> = [
  { match: /^\/app\/invoices\/new/, label: 'New invoice' },
  { match: /^\/app\/invoices\/.+/, label: 'Edit invoice' },
  { match: /^\/app\/invoices/, label: 'Invoices' },
  { match: /^\/app\/payments/, label: 'Payments' },
  { match: /^\/app\/clients/, label: 'Clients' },
  { match: /^\/app\/reports/, label: 'Reports' },
  { match: /^\/app\/settings/, label: 'Settings' },
  { match: /^\/app/, label: 'Overview' },
  { match: /^\/admin\/organizations/, label: 'Organizations' },
  { match: /^\/admin\/users/, label: 'Users & access' },
  { match: /^\/admin\/invoices/, label: 'All invoices' },
  { match: /^\/admin\/payments/, label: 'Payment monitoring' },
  { match: /^\/admin/, label: 'Platform overview' },
]

function initials(email?: string | null): string {
  if (!email) return '?'
  const name = email.split('@')[0]
  const parts = name.split(/[.\-_]+/)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? '')
}

function TopBar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  const section = location.pathname.startsWith('/admin') ? 'Platform' : 'Workspace'
  const crumb = CRUMBS.find((entry) => entry.match.test(location.pathname))?.label ?? 'Overview'

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <button type="button" className="mobile-toggle" onClick={onMenuToggle} aria-label="Toggle menu">
          ☰
        </button>
        <div className="breadcrumb">
          {section} <span style={{ padding: '0 8px' }}>/</span> <b>{crumb}</b>
        </div>
      </div>
      <div className="right-actions">
        <div className="search">
          ⌕
          <input
            placeholder="Search invoices, clients..."
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const value = event.currentTarget.value.trim()
                if (value) {
                  navigate(`/app/invoices?search=${encodeURIComponent(value)}`)
                }
              }
            }}
          />
          <span>⌘ K</span>
        </div>
        <button
          type="button"
          className="iconbtn"
          title="Notifications"
          onClick={() => notify('You are all caught up!')}
        >
          ♧
        </button>
        <div className="userpic" title={user?.email ?? 'Account'}>
          {initials(user?.email)}
        </div>
      </div>
    </header>
  )
}

export default TopBar
