import { useMemo } from 'react'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { PageHeading } from '../../components/ui/PageHeading'
import { Panel } from '../../components/ui/Panel'
import { StatGrid } from '../../components/ui/StatGrid'
import { useTenant } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useInvoices } from '../../hooks/useInvoices'
import { usePayments } from '../../hooks/usePayments'
import { formatMoney } from '../../utils/currency'
import type { CurrencyCode } from '../../types/core'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ReportsPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const { notify } = useToast()
  const invoicesQuery = useInvoices(activeOrgId ?? undefined)
  const paymentsQuery = usePayments(activeOrgId ?? undefined)

  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data])
  const payments = useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data])
  const currency: CurrencyCode = invoices[0]?.currency ?? 'USD'

  const metrics = useMemo(() => {
    const now = new Date()
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime()

    const settled = payments.filter((payment) => payment.status === 'settled')
    const collectedThisQuarter = settled
      .filter((payment) => new Date(payment.settledAt ?? payment.createdAt).getTime() >= quarterStart)
      .reduce((acc, payment) => acc + payment.amount.amount, 0)

    const collectionRate = invoices.length
      ? (invoices.filter((invoice) => invoice.status === 'paid').length / invoices.length) * 100
      : 0

    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
    const paymentDurations = settled
      .map((payment) => {
        const invoice = invoiceById.get(payment.invoiceId)
        if (!invoice) return null
        const start = new Date(invoice.issueDate).getTime()
        const end = new Date(payment.settledAt ?? payment.createdAt).getTime()
        const days = Math.round((end - start) / 86_400_000)
        return Number.isFinite(days) && days >= 0 ? days : null
      })
      .filter((days): days is number => days !== null)
    const avgDays =
      paymentDurations.length > 0
        ? Math.round(paymentDurations.reduce((a, b) => a + b, 0) / paymentDurations.length)
        : 0

    const overdueCount = invoices.filter(
      (invoice) => invoice.status === 'overdue' || invoice.status === 'payment_pending',
    ).length
    const overdueRatio = invoices.length ? (overdueCount / invoices.length) * 100 : 0

    const monthly = Array(12).fill(0) as number[]
    settled.forEach((payment) => {
      const date = new Date(payment.settledAt ?? payment.createdAt)
      if (date.getFullYear() === now.getFullYear()) {
        monthly[date.getMonth()] += payment.amount.amount
      }
    })
    const monthlyMax = Math.max(1, ...monthly)

    const collectedTotal = settled.reduce((acc, payment) => acc + payment.amount.amount, 0)
    const pendingTotal = invoices
      .filter((invoice) => ['sent', 'payment_pending'].includes(invoice.status))
      .reduce((acc, invoice) => acc + invoice.total.amount, 0)
    const overdueTotal = invoices
      .filter((invoice) => invoice.status === 'overdue')
      .reduce((acc, invoice) => acc + invoice.total.amount, 0)
    const healthTotal = Math.max(1, collectedTotal + pendingTotal + overdueTotal)

    return {
      collectedThisQuarter,
      collectionRate,
      avgDays,
      overdueRatio,
      monthly,
      monthlyMax,
      health: [
        { label: 'Payments collected', pct: Math.round((collectedTotal / healthTotal) * 100), color: '#4e69e8' },
        { label: 'Pending payments', pct: Math.round((pendingTotal / healthTotal) * 100), color: '#eeaf60' },
        { label: 'Overdue invoices', pct: Math.round((overdueTotal / healthTotal) * 100), color: '#e07373' },
      ],
    }
  }, [invoices, payments])

  if (tenantLoading || invoicesQuery.isLoading || paymentsQuery.isLoading) {
    return <LoadingState message="Building reports…" />
  }

  if (!activeOrgId) {
    return <ErrorState title="No organization selected" description="Choose an organization to view reports." />
  }

  return (
    <div>
      <PageHeading
        eyebrow="Understand how your business is performing"
        title="Reports & insights"
        actions={
          <button type="button" className="btn" onClick={() => notify('Report download is not wired yet.')}>
            ↓ &nbsp; Download report
          </button>
        }
      />

      <div className="banner">
        <div>
          <h2>Get a clearer view of your cash flow</h2>
          <p>
            Monitor unpaid invoices, revenue by period and payment collection efficiency in one
            place.
          </p>
        </div>
        <button type="button" onClick={() => notify('Custom reports are planned for a later release.')}>
          Customize report →
        </button>
      </div>

      <StatGrid
        stats={[
          {
            label: 'Collected this quarter',
            value: formatMoney({ amount: metrics.collectedThisQuarter, currency }),
            icon: '↗',
            iconBg: '#eaf0ff',
            iconColor: '#4d6ae7',
          },
          {
            label: 'Collection rate',
            value: `${metrics.collectionRate.toFixed(1)}%`,
            icon: '✓',
            iconBg: '#e8f8f2',
            iconColor: '#139974',
          },
          {
            label: 'Average days to pay',
            value: `${metrics.avgDays} days`,
            icon: '◷',
            iconBg: '#fff3e7',
            iconColor: '#df9b48',
            change: 'Issue date → settlement',
            changeMuted: true,
          },
          {
            label: 'Overdue ratio',
            value: `${metrics.overdueRatio.toFixed(1)}%`,
            icon: '▥',
            iconBg: '#f1ebff',
            iconColor: '#8162c0',
            change: 'Based on count of invoices',
            changeMuted: true,
          },
        ]}
      />

      <div className="middle">
        <Panel title="Collections trend" description={`Settled payments by month · ${new Date().getFullYear()}`}>
          <div className="chart">
            <div className="bars">
              {MONTHS.map((month, index) => (
                <div className="bar-unit" key={month}>
                  <span
                    className="bar dark"
                    style={{
                      width: '100%',
                      ['--h' as string]: `${Math.round((metrics.monthly[index] / metrics.monthlyMax) * 100)}%`,
                    }}
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

        <Panel title="Collection health">
          <div className="form-inner">
            <div className="info">
              Metrics reflect settled provider payments and invoice statuses for this workspace.
            </div>
            {metrics.health.map((row) => (
              <div key={row.label} style={{ padding: '24px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <b>{row.label}</b>
                  <span>{row.pct}%</span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: '#edf1f8',
                    borderRadius: 6,
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${row.pct}%`,
                      background: row.color,
                      borderRadius: 6,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

export default ReportsPage
