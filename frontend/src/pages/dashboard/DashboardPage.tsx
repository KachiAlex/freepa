import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import InvoiceDrawer from '../../components/invoices/InvoiceDrawer'
import { PageHeading } from '../../components/ui/PageHeading'
import { Panel, PanelLink } from '../../components/ui/Panel'
import { StatGrid } from '../../components/ui/StatGrid'
import { StatusPill } from '../../components/ui/StatusPill'
import { ClientDot, DataTable } from '../../components/ui/DataTable'
import { useAuth, useTenant } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useInvoices } from '../../hooks/useInvoices'
import { usePayments } from '../../hooks/usePayments'
import { useClients } from '../../hooks/useClients'
import { useOrganizationProfile } from '../../hooks/useOrganizationProfile'
import { formatMoney } from '../../utils/currency'
import { formatDate, timeGreeting, todayLong } from '../../utils/date'
import type { CurrencyCode } from '../../types/core'
import type { Invoice } from '../../types/invoice'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthIndex(value?: string): number | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.getFullYear() === new Date().getFullYear() ? date.getMonth() : null
}

function DashboardPage() {
  const { user } = useAuth()
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const { notify } = useToast()
  const invoicesQuery = useInvoices(activeOrgId ?? undefined)
  const paymentsQuery = usePayments(activeOrgId ?? undefined)
  const clientsQuery = useClients(activeOrgId ?? undefined)
  const profileQuery = useOrganizationProfile(activeOrgId)
  const navigate = useNavigate()
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data])
  const payments = useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data])
  const currency: CurrencyCode =
    (profileQuery.data?.defaultCurrency as CurrencyCode | undefined) ?? 'USD'

  const totalInvoiced = invoices.reduce((acc, invoice) => acc + invoice.total.amount, 0)
  const collected = payments
    .filter((payment) => payment.status === 'settled')
    .reduce((acc, payment) => acc + payment.amount.amount, 0)
  const outstanding = invoices
    .filter((invoice) => !['paid', 'void'].includes(invoice.status))
    .reduce((acc, invoice) => acc + invoice.total.amount, 0)

  const monthly = useMemo(() => {
    const invoiced = Array(12).fill(0) as number[]
    const received = Array(12).fill(0) as number[]
    invoices.forEach((invoice) => {
      const index = monthIndex(invoice.issueDate ?? invoice.createdAt)
      if (index !== null) invoiced[index] += invoice.total.amount
    })
    payments
      .filter((payment) => payment.status === 'settled')
      .forEach((payment) => {
        const index = monthIndex(payment.settledAt ?? payment.createdAt)
        if (index !== null) received[index] += payment.amount.amount
      })
    const max = Math.max(1, ...invoiced, ...received)
    return { invoiced, received, max }
  }, [invoices, payments])

  const breakdown = useMemo(() => {
    const counts = { paid: 0, sent: 0, draft: 0, overdue: 0 }
    invoices.forEach((invoice) => {
      if (invoice.status === 'paid') counts.paid += 1
      else if (invoice.status === 'sent' || invoice.status === 'payment_pending') counts.sent += 1
      else if (invoice.status === 'overdue') counts.overdue += 1
      else counts.draft += 1
    })
    const total = Math.max(1, invoices.length)
    const paidPct = (counts.paid / total) * 100
    const sentPct = (counts.sent / total) * 100
    const overduePct = (counts.overdue / total) * 100
    const gradient = `conic-gradient(#4967e8 0 ${paidPct}%, #f1ab58 ${paidPct}% ${paidPct + sentPct}%, #e07373 ${paidPct + sentPct}% ${paidPct + sentPct + overduePct}%, #e7edf9 ${paidPct + sentPct + overduePct}%)`
    return { ...counts, total: invoices.length, gradient }
  }, [invoices])

  const overdueCount = useMemo(() => {
    const now = Date.now()
    return invoices.filter(
      (invoice) =>
        !['paid', 'void'].includes(invoice.status) &&
        invoice.dueDate &&
        new Date(invoice.dueDate).getTime() < now,
    ).length
  }, [invoices])

  const recent = invoices.slice(0, 5)
  const firstName = user?.email?.split('@')[0] ?? 'there'

  if (tenantLoading || invoicesQuery.isLoading || paymentsQuery.isLoading || clientsQuery.isLoading) {
    return <LoadingState message="Preparing your invoicing overview…" />
  }

  if (!activeOrgId) {
    return (
      <ErrorState
        title="No organization selected"
        description="Create or choose a company from the workspace switcher to get started."
      />
    )
  }

  if (invoicesQuery.isError) {
    return <ErrorState onRetry={() => invoicesQuery.refetch()} />
  }

  return (
    <div>
      <PageHeading
        eyebrow={todayLong()}
        title={`${timeGreeting()}, ${firstName} 👋`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => notify('Report export is not wired yet.')}>
              ↗ &nbsp; Export report
            </button>
            <Link to="/app/invoices/new" className="btn primary">
              + &nbsp; New invoice
            </Link>
          </>
        }
      />

      <StatGrid
        stats={[
          {
            label: 'Total invoiced',
            value: formatMoney({ amount: totalInvoiced, currency }),
            icon: '▤',
            iconBg: '#eaf0ff',
            iconColor: '#4d6ae7',
          },
          {
            label: 'Payments collected',
            value: formatMoney({ amount: collected, currency }),
            icon: '↗',
            iconBg: '#e8f8f2',
            iconColor: '#139974',
          },
          {
            label: 'Outstanding',
            value: formatMoney({ amount: outstanding, currency }),
            icon: '◷',
            iconBg: '#fff3e7',
            iconColor: '#e39c43',
          },
          {
            label: 'Active clients',
            value: String(clientsQuery.data?.length ?? 0),
            icon: '♙',
            iconBg: '#eeeafe',
            iconColor: '#8465c3',
            change: `${clientsQuery.data?.length ?? 0} in directory`,
            changeMuted: true,
          },
        ]}
      />

      <div className="middle">
        <Panel
          title="Revenue performance"
          description={`Payments received versus invoiced · ${new Date().getFullYear()}`}
          action={
            <div className="legend">
              <span>
                <i className="dot" />
                Collected
              </span>
              <span>
                <i className="dot pale" />
                Invoiced
              </span>
            </div>
          }
        >
          <div className="chart">
            <div className="bars">
              {MONTHS.map((month, index) => (
                <div className="bar-unit" key={month}>
                  <span
                    className="bar dark"
                    style={{ '--h': `${Math.round((monthly.received[index] / monthly.max) * 100)}%` } as CSSProperties}
                  />
                  <span
                    className="bar"
                    style={{ '--h': `${Math.round((monthly.invoiced[index] / monthly.max) * 100)}%` } as CSSProperties}
                  />
                </div>
              ))}
            </div>
            <div className="monthrow">
              {MONTHS.map((month) => (
                <span key={month}>{month}</span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Invoice breakdown"
          description="Your invoice statuses at a glance"
          action={<PanelLink onClick={() => navigate('/app/invoices')}>View invoices →</PanelLink>}
        >
          <div className="breakdown">
            <div className="donut-area">
              <div className="donut" style={{ background: breakdown.gradient }}>
                <div className="donut-core">
                  <b>{breakdown.total}</b>
                  <small>Total invoices</small>
                </div>
              </div>
              <div className="break-lines">
                <div>
                  <span>🔵 Paid</span>
                  <b>{breakdown.paid}</b>
                </div>
                <div>
                  <span>🟠 Sent</span>
                  <b>{breakdown.sent}</b>
                </div>
                <div>
                  <span>🔴 Overdue</span>
                  <b>{breakdown.overdue}</b>
                </div>
                <div>
                  <span>⚪ Draft</span>
                  <b>{breakdown.draft}</b>
                </div>
              </div>
            </div>
            <div className="info">
              💡 <b>Quick insight:</b> {overdueCount} invoice{overdueCount === 1 ? ' has' : 's have'} passed the
              due date. Follow up to improve cash flow.
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Recent invoices"
        description="Stay on top of your latest billing activity"
        action={<PanelLink onClick={() => navigate('/app/invoices')}>View all →</PanelLink>}
      >
        <DataTable columns={['Invoice', 'Client', 'Issued', 'Due date', 'Amount', 'Status', '']}>
          {recent.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                No invoices yet — create your first one.
              </td>
            </tr>
          ) : (
            recent.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <b
                    style={{ color: '#365ddb', cursor: 'pointer' }}
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    {invoice.number}
                  </b>
                </td>
                <td>
                  <ClientDot name={invoice.clientName} />
                  <b>{invoice.clientName}</b>
                </td>
                <td>{formatDate(invoice.issueDate)}</td>
                <td>{formatDate(invoice.dueDate)}</td>
                <td>
                  <b>{formatMoney(invoice.total)}</b>
                </td>
                <td>
                  <StatusPill status={invoice.status} />
                </td>
                <td>
                  <button
                    type="button"
                    className="rowaction"
                    title="Invoice details"
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    ···
                  </button>
                </td>
              </tr>
            ))
          )}
        </DataTable>
      </Panel>

      <InvoiceDrawer
        invoice={selectedInvoice}
        organizationId={activeOrgId ?? undefined}
        onClose={() => setSelectedInvoice(null)}
      />
    </div>
  )
}

export default DashboardPage
