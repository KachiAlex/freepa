import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { PageHeading } from '../../components/ui/PageHeading';
import { Panel } from '../../components/ui/Panel';
import { StatusPill } from '../../components/ui/StatusPill';
import { ClientDot, DataTable } from '../../components/ui/DataTable';
import { useAdminInvoices } from '../../hooks/useAdminData';
import { formatMoney } from '../../utils/currency';
import { formatDate } from '../../utils/date';

function AdminInvoicesPage() {
  const invoicesQuery = useAdminInvoices(50);

  if (invoicesQuery.isLoading) {
    return <LoadingState message="Loading platform invoices…" />;
  }

  if (invoicesQuery.isError) {
    return <ErrorState onRetry={() => invoicesQuery.refetch()} />;
  }

  const invoices = invoicesQuery.data ?? [];

  return (
    <div>
      <PageHeading eyebrow="Admin / Invoices" title="All platform invoices" />

      <div className="info" style={{ marginBottom: 18 }}>
        This screen is available only to users with <b>platform admin</b> access. Every row crosses
        tenant boundaries — treat as privileged data.
      </div>

      <Panel title="Recent tenant invoices">
        <DataTable
          columns={['Invoice', 'Client', 'Organization', 'Issued', 'Due date', 'Amount', 'Status']}
          empty={
            invoices.length === 0 ? (
              <div className="empty">
                <div className="big">▤</div>
                <h3>No invoices</h3>
                <p>Platform invoices appear here as tenants create them.</p>
              </div>
            ) : undefined
          }
        >
          {invoices.map((invoice) => (
            <tr key={`${invoice.organizationId}-${invoice.id}`}>
              <td>
                <b>{invoice.number}</b>
              </td>
              <td>
                <ClientDot name={invoice.clientName} />
                <b>{invoice.clientName}</b>
              </td>
              <td>{invoice.organizationId}</td>
              <td>{formatDate(invoice.issueDate)}</td>
              <td>{formatDate(invoice.dueDate)}</td>
              <td>
                <b>{formatMoney(invoice.total)}</b>
              </td>
              <td>
                <StatusPill status={invoice.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}

export default AdminInvoicesPage;
