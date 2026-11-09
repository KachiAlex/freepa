import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { PageHeading } from '../../components/ui/PageHeading';
import { Panel } from '../../components/ui/Panel';
import { StatusPill } from '../../components/ui/StatusPill';
import { DataTable } from '../../components/ui/DataTable';
import { useAdminPayments } from '../../hooks/useAdminData';
import { formatMoney } from '../../utils/currency';
import { formatDate } from '../../utils/date';

function AdminPaymentsPage() {
  const paymentsQuery = useAdminPayments(50);

  if (paymentsQuery.isLoading) {
    return <LoadingState message="Loading platform payments…" />;
  }

  if (paymentsQuery.isError) {
    return <ErrorState onRetry={() => paymentsQuery.refetch()} />;
  }

  const payments = paymentsQuery.data ?? [];

  return (
    <div>
      <PageHeading eyebrow="Admin / Payments" title="Payment monitoring" />

      <Panel title="Provider transactions" description="Latest payment events across every tenant">
        <DataTable
          columns={['Transaction', 'Invoice', 'Provider', 'Date', 'Amount', 'Status']}
          empty={
            payments.length === 0 ? (
              <div className="empty">
                <div className="big">◈</div>
                <h3>No payments</h3>
                <p>Provider confirmations will appear here.</p>
              </div>
            ) : undefined
          }
        >
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                <b>{payment.reference}</b>
              </td>
              <td>{payment.invoiceNumber}</td>
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
  );
}

export default AdminPaymentsPage;
