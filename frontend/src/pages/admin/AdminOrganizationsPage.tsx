import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { PageHeading } from '../../components/ui/PageHeading';
import { Panel } from '../../components/ui/Panel';
import { ClientDot, DataTable } from '../../components/ui/DataTable';
import { useAdminOrganizations } from '../../hooks/useAdminData';
import { formatDate } from '../../utils/date';

function AdminOrganizationsPage() {
  const organizationsQuery = useAdminOrganizations();

  if (organizationsQuery.isLoading) {
    return <LoadingState message="Loading organizations…" />;
  }

  if (organizationsQuery.isError) {
    return <ErrorState onRetry={() => organizationsQuery.refetch()} />;
  }

  const organizations = organizationsQuery.data ?? [];

  return (
    <div>
      <PageHeading
        eyebrow="Platform / Tenant management"
        title="Organizations"
        actions={
          <button type="button" className="btn" onClick={() => organizationsQuery.refetch()}>
            ↻ Refresh
          </button>
        }
      />

      <Panel title="All organizations" description="Manage tenants and organization memberships">
        <DataTable
          columns={['Organization', 'Owner email', 'Members', 'Invoices', 'Created', 'Status']}
          empty={
            organizations.length === 0 ? (
              <div className="empty">
                <div className="big">▣</div>
                <h3>No organizations</h3>
                <p>Tenants appear here once companies are provisioned.</p>
              </div>
            ) : undefined
          }
        >
          {organizations.map((org) => (
            <tr key={org.id}>
              <td>
                <ClientDot name={org.name ?? org.id} />
                <b>{org.name ?? org.id}</b>
              </td>
              <td>{org.ownerEmail ?? '—'}</td>
              <td>{org.memberCount}</td>
              <td>{org.invoiceCount}</td>
              <td>{formatDate(org.createdAt)}</td>
              <td>
                <span className="pill paid">Active</span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}

export default AdminOrganizationsPage;
