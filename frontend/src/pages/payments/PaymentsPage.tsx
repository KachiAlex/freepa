import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { usePayments } from '../../hooks/usePayments'
import { formatMoney } from '../../utils/currency'
import { useTenant } from '../../context/AuthContext'

function PaymentsPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const paymentsQuery = usePayments(activeOrgId ?? undefined)

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
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Payments</h1>
          <p>Monitor settlements arriving via Flutterwave and Paystack.</p>
        </div>
      </header>

      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Provider</th>
              <th>Invoice</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Created</th>
              <th>Settled</th>
            </tr>
          </thead>
          <tbody>
            {paymentsQuery.data?.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.id}</td>
                <td>{payment.provider}</td>
                <td>{payment.invoiceNumber}</td>
                <td>
                  <span className={`badge ${payment.status === 'settled' ? 'badge--success' : 'badge--warning'}`}>
                    {payment.status}
                  </span>
                </td>
                <td>{formatMoney(payment.amount)}</td>
                <td>{payment.createdAt}</td>
                <td>{payment.settledAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default PaymentsPage

