import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { useAdminInvoices } from '../../hooks/useAdminData';
import { formatMoney } from '../../utils/currency';

function AdminInvoicesPage() {
  const invoicesQuery = useAdminInvoices(50);

  if (invoicesQuery.isLoading) {
    return <LoadingState message="Loading invoices…" />;
  }

  if (invoicesQuery.isError) {
    return <ErrorState onRetry={() => invoicesQuery.refetch()} />;
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Invoices</h1>
          <p>Review all invoices generated across the platform.</p>
        </div>
      </header>
      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Organization</th>
              <th>Client</th>
              <th>Status</th>
              <th>Total</th>
              <th>Issued</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {invoicesQuery.data?.map((invoice) => (
              <tr key={`${invoice.organizationId}-${invoice.id}`}>
                <td>{invoice.number}</td>
                <td>{invoice.organizationId}</td>
                <td>{invoice.clientName}</td>
                <td>
                  <span className={`badge ${invoice.status === 'paid' ? 'badge--success' : 'badge--info'}`}>
                    {invoice.status}
                  </span>
                </td>
                <td>{formatMoney(invoice.total)}</td>
                <td>{invoice.issueDate}</td>
                <td>{invoice.dueDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default AdminInvoicesPage;

