import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { useInvoices } from '../../hooks/useInvoices'
import { usePayments } from '../../hooks/usePayments'
import { useClients } from '../../hooks/useClients'
import { formatMoney } from '../../utils/currency'
import { useTenant } from '../../context/AuthContext'

function DashboardPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const invoicesQuery = useInvoices(activeOrgId ?? undefined)
  const paymentsQuery = usePayments(activeOrgId ?? undefined)
  const clientsQuery = useClients(activeOrgId ?? undefined)

  const totalOutstanding = useMemo(() => {
    if (!invoicesQuery.data) return 0
    return invoicesQuery.data
      .filter((invoice) => ['draft', 'sent', 'overdue'].includes(invoice.status))
      .reduce((acc, invoice) => acc + invoice.total.amount, 0)
  }, [invoicesQuery.data])

  const totalPayments = useMemo(() => {
    if (!paymentsQuery.data) return 0
    return paymentsQuery.data.reduce((acc, payment) => acc + payment.amount.amount, 0)
  }, [paymentsQuery.data])

  const metrics = useMemo(
    () => [
      {
        label: 'Outstanding invoices',
        value: invoicesQuery.data
          ? formatMoney({ amount: totalOutstanding, currency: 'USD' })
          : '$0.00',
        trend: '+8.5%',
      },
      {
        label: 'Payments collected (mock)',
        value: paymentsQuery.data
          ? formatMoney({ amount: totalPayments, currency: 'USD' })
          : '$0.00',
        trend: '+4.2%',
      },
      {
        label: 'Invoices in pipeline',
        value: invoicesQuery.data ? String(invoicesQuery.data.length) : '0',
        trend: '+12%',
      },
      {
        label: 'Active clients',
        value: clientsQuery.data ? String(clientsQuery.data.length) : '0',
        trend: '+5.0%',
      },
    ],
    [clientsQuery.data, invoicesQuery.data, paymentsQuery.data, totalOutstanding, totalPayments],
  )

  if (tenantLoading || invoicesQuery.isLoading || paymentsQuery.isLoading || clientsQuery.isLoading) {
    return <LoadingState message="Preparing your invoicing overview…" />
  }

  if (!activeOrgId) {
    return <ErrorState title="No organization selected" description="Choose an organization to view metrics." />
  }

  if (invoicesQuery.isError || paymentsQuery.isError || clientsQuery.isError) {
    return (
      <ErrorState
        onRetry={() => {
          invoicesQuery.refetch()
          paymentsQuery.refetch()
          clientsQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="page dashboard-page">
      <section className="panel-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="panel">
            <header>
              <p className="panel__label">{metric.label}</p>
              <p className="panel__value">{metric.value}</p>
              <p className="panel__trend">{metric.trend} vs last period</p>
            </header>
          </article>
        ))}
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2>Recent invoices</h2>
          <Link to="/app/invoices/new" className="button button--secondary">
            New invoice
          </Link>
        </header>
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Issue date</th>
              <th>Due date</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((row) => (
              <tr key={row}>
                <td>INV-00{row}</td>
                <td>Acme Corp</td>
                <td>2025-01-0{row}</td>
                <td>2025-01-1{row}</td>
                <td>
                  <span className="badge badge--success">Paid</span>
                </td>
                <td>$3,500</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default DashboardPage

