import { useMemo } from 'react'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { PageHeading } from '../../components/ui/PageHeading'
import { Panel, PanelLink } from '../../components/ui/Panel'
import { StatGrid } from '../../components/ui/StatGrid'
import { StatusPill } from '../../components/ui/StatusPill'
import { DataTable } from '../../components/ui/DataTable'
import { useTenant } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { usePayments } from '../../hooks/usePayments'
import { useInvoices } from '../../hooks/useInvoices'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import type { CurrencyCode } from '../../types/core'

function PaymentsPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const { notify } = useToast()
  const paymentsQuery = usePayments(activeOrgId ?? undefined)
  const invoicesQuery = useInvoices(activeOrgId ?? undefined)

  const payments = useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data])
  const clientByInvoice = useMemo(() => {
    const map = new Map<string, string>()
    ;(invoicesQuery.data ?? []).forEach((invoice) => map.set(invoice.id, invoice.clientName))
    return map
  }, [invoicesQuery.data])

  const currency: CurrencyCode = payments[0]?.amount.currency ?? 'USD'
  const settled = payments.filter((payment) => payment.status === 'settled')
  const successfulTotal = settled.reduce((acc, payment) => acc + payment.amount.amount, 0)
  const pendingTotal = payments
    .filter((payment) => payment.status !== 'settled')
    .reduce((acc, payment) => acc + payment.amount.amount, 0)
  const pendingCount = payments.length - settled.length
  const average = settled.length ? successfulTotal / settled.length : 0

  if (tenantLoading || paymentsQuery.isLoading) {
    return <LoadingState message="Loading payments…" />
  }

  if (!activeOrgId) {
    return <ErrorState title="No organization selected" description="Choose an organization to view payments." />
  }

  if (paymentsQuery.isError) {
    return <ErrorState onRetry={() => paymentsQuery.refetch()} />
  }

  return (
    <div>
      <PageHeading
        eyebrow="Track settlements and transactions"
        title="Payments"
        actions={
          <button type="button" className="btn" onClick={() => notify('Transaction export is not wired yet.')}>
            ↓ &nbsp; Export transactions
          </button>
        }
      />

      <StatGrid
        stats={[
          {
            label: 'Successful payments',
            value: formatMoney({ amount: successfulTotal, currency }),
            icon: '✓',
            iconBg: '#e8f8f2',
            iconColor: '#139974',
          },
          {
            label: 'Pending verification',
            value: formatMoney({ amount: pendingTotal, currency }),
            icon: '◷',
            iconBg: '#f1ebff',
            iconColor: '#8162c0',
            change: `${pendingCount} transaction${pendingCount === 1 ? '' : 's'} to verify`,
            changeMuted: true,
          },
          {
            label: 'Total transactions',
            value: String(payments.length),
            icon: '↗',
            iconBg: '#eaf0ff',
            iconColor: '#4d6ae7',
            change: 'This billing period',
            changeMuted: true,
          },
          {
            label: 'Average payment',
            value: formatMoney({ amount: Math.round(average), currency }),
            icon: '◎',
            iconBg: '#fff3e7',
            iconColor: '#df9b48',
            change: 'Across completed payments',
            changeMuted: true,
          },
        ]}
      />

      <div className="quick">
        <span className="chip">◉ Flutterwave connected</span>
        <span className="chip">◉ Paystack connected</span>
      </div>

      <Panel
        title="Transaction activity"
        description="Provider confirmations and reconciliation status"
        action={
          <PanelLink onClick={() => notify('Reconciliation runs automatically every 6 hours on the server.')}>
            ↻ Reconcile
          </PanelLink>
        }
      >
        <DataTable
          columns={['Transaction', 'Client', 'Provider', 'Date', 'Amount', 'Status']}
          empty={
            payments.length === 0 ? (
              <div className="empty">
                <div className="big">◈</div>
                <h3>No transactions yet</h3>
                <p>Payment links you create will appear here once providers confirm them.</p>
              </div>
            ) : undefined
          }
        >
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                <b>{payment.reference}</b>
              </td>
              <td>{clientByInvoice.get(payment.invoiceId) ?? payment.invoiceNumber}</td>
              <td style={{ textTransform: 'capitalize' }}>{payment.provider}</td>
              <td>{formatDate(payment.createdAt)}</td>
              <td>
                <b>{formatMoney(payment.amount)}</b>
              </td>
              <td>
                <StatusPill status={payment.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  )
}

export default PaymentsPage
