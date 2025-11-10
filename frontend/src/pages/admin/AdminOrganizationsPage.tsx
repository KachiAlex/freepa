import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { useAdminOrganizations } from '../../hooks/useAdminData';

function AdminOrganizationsPage() {
  const organizationsQuery = useAdminOrganizations();

  if (organizationsQuery.isLoading) {
    return <LoadingState message="Loading organizations…" />;
  }

  if (organizationsQuery.isError) {
    return <ErrorState onRetry={() => organizationsQuery.refetch()} />;
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Organizations</h1>
          <p>Audit all tenants operating on FREEPA.</p>
        </div>
      </header>

      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Owner</th>
              <th>Slug</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Members</th>
              <th>Invoices</th>
            </tr>
          </thead>
          <tbody>
            {organizationsQuery.data?.map((org) => (
              <tr key={org.id}>
                <td>{org.id}</td>
                <td>{org.name ?? '—'}</td>
                <td>{org.ownerEmail ?? '—'}</td>
                <td>{org.slug ?? '—'}</td>
                <td>{org.createdAt ?? '—'}</td>
                <td>{org.updatedAt ?? '—'}</td>
                <td>{org.memberCount}</td>
                <td>{org.invoiceCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default AdminOrganizationsPage;

