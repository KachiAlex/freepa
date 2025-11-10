import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { useAdminPayments } from '../../hooks/useAdminData';
import { formatMoney } from '../../utils/currency';

function AdminPaymentsPage() {
  const paymentsQuery = useAdminPayments(50);

  if (paymentsQuery.isLoading) {
    return <LoadingState message="Loading payments…" />;
  }

  if (paymentsQuery.isError) {
    return <ErrorState onRetry={() => paymentsQuery.refetch()} />;
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Payments</h1>
          <p>Monitor settlements and reconciliation across all invoices.</p>
        </div>
      </header>
      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Invoice</th>
              <th>Organization</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {paymentsQuery.data?.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.reference}</td>
                <td>{payment.invoiceNumber}</td>
                <td>{payment.organizationId}</td>
                <td>{payment.provider}</td>
                <td>
                  <span className={`badge ${payment.status === 'settled' ? 'badge--success' : 'badge--warning'}`}>
                    {payment.status}
                  </span>
                </td>
                <td>{formatMoney(payment.amount)}</td>
                <td>{payment.updatedAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default AdminPaymentsPage;

