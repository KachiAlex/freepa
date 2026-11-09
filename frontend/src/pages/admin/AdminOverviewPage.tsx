import { useNavigate } from 'react-router-dom';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { PageHeading } from '../../components/ui/PageHeading';
import { Panel, PanelLink } from '../../components/ui/Panel';
import { StatGrid } from '../../components/ui/StatGrid';
import { ClientDot, DataTable } from '../../components/ui/DataTable';
import { useAdminOrganizations, useAdminStats } from '../../hooks/useAdminData';

function AdminOverviewPage() {
  const navigate = useNavigate();
  const statsQuery = useAdminStats();
  const organizationsQuery = useAdminOrganizations();

  if (statsQuery.isLoading || organizationsQuery.isLoading) {
    return <LoadingState message="Loading platform overview…" />;
  }

  if (statsQuery.isError || organizationsQuery.isError) {
    return (
      <ErrorState
        onRetry={() => {
          statsQuery.refetch();
          organizationsQuery.refetch();
        }}
      />
    );
  }

  const stats = statsQuery.data;
  const organizations = (organizationsQuery.data ?? []).slice(0, 5);

  return (
    <div>
      <PageHeading
        eyebrow="FreePA / Super admin"
        title="Platform overview"
        actions={
          <button type="button" className="btn" onClick={() => navigate('/admin/users')}>
            Manage access
          </button>
        }
      />

      <div className="banner">
        <div>
          <h2>Platform control center</h2>
          <p>
            Monitor organization growth, payment operations and user access — without crossing
            tenant boundaries.
          </p>
        </div>
        <button type="button" onClick={() => navigate('/admin/organizations')}>
          Manage organizations →
        </button>
      </div>

      <StatGrid
        stats={[
          {
            label: 'Organizations',
            value: String(stats?.totalOrganizations ?? 0),
            icon: '▣',
            iconBg: '#eaf0ff',
            iconColor: '#4d6ae7',
            change: 'Total tenants',
            changeMuted: true,
          },
          {
            label: 'Registered users',
            value: String(stats?.totalUsers ?? 0),
            icon: '♙',
            iconBg: '#eeeafe',
            iconColor: '#8162c0',
            change: `${stats?.platformAdmins ?? 0} platform admins`,
            changeMuted: true,
          },
          {
            label: 'Invoices issued',
            value: String(stats?.totalInvoices ?? 0),
            icon: '▤',
            iconBg: '#e8f8f2',
            iconColor: '#139974',
            change: `${stats?.paidInvoices ?? 0} paid`,
            changeMuted: true,
          },
          {
            label: 'Pending verification',
            value: String(stats?.pendingInvoices ?? 0),
            icon: '◷',
            iconBg: '#fff3e7',
            iconColor: '#df9b48',
            change: 'Across all tenants',
            changeMuted: true,
          },
        ]}
      />

      <Panel
        title="Recently onboarded organizations"
        description="Platform-wide overview · admin-only"
        action={<PanelLink onClick={() => navigate('/admin/organizations')}>View all →</PanelLink>}
      >
        <DataTable columns={['Organization', 'Owner email', 'Members', 'Status', '']}>
          {organizations.map((org) => (
            <tr key={org.id}>
              <td>
                <ClientDot name={org.name ?? org.id} />
                <b>{org.name ?? org.id}</b>
              </td>
              <td>{org.ownerEmail ?? '—'}</td>
              <td>{org.memberCount}</td>
              <td>
                <span className="pill paid">Active</span>
              </td>
              <td>
                <button
                  type="button"
                  className="rowaction"
                  onClick={() => navigate('/admin/organizations')}
                >
                  ···
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}

export default AdminOverviewPage;
