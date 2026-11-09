import { useState } from 'react';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { PageHeading } from '../../components/ui/PageHeading';
import { Panel } from '../../components/ui/Panel';
import { ClientDot, DataTable } from '../../components/ui/DataTable';
import { Drawer } from '../../components/ui/Drawer';
import { useAdminOrganizations, useAdminUsers } from '../../hooks/useAdminData';
import UserMembershipManager from '../../components/admin/UserMembershipManager';
import type { AdminUser } from '../../services/admin';
import { formatDate } from '../../utils/date';

function AdminUsersPage() {
  const usersQuery = useAdminUsers();
  const organizationsQuery = useAdminOrganizations();
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (usersQuery.isLoading || organizationsQuery.isLoading) {
    return <LoadingState message="Loading users…" />;
  }

  if (usersQuery.isError || organizationsQuery.isError) {
    return (
      <ErrorState
        onRetry={() => {
          usersQuery.refetch();
          organizationsQuery.refetch();
        }}
      />
    );
  }

  const users = usersQuery.data ?? [];
  const organizations = organizationsQuery.data ?? [];

  return (
    <div>
      <PageHeading eyebrow="Platform / Role management" title="Users & access" />

      <div className="info" style={{ marginBottom: 18 }}>
        <b>Privileged access:</b> platform administrator actions are enforced server-side and
        recorded in the audit log for every change.
      </div>

      {message ? <p className="form-message">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <Panel title="Registered users" description="Every account across all tenants">
        <DataTable
          columns={['User', 'Organizations', 'Roles', 'Platform admin', 'Created', '']}
          empty={
            users.length === 0 ? (
              <div className="empty">
                <div className="big">♧</div>
                <h3>No users</h3>
                <p>Accounts appear here once users sign up.</p>
              </div>
            ) : undefined
          }
        >
          {users.map((platformUser) => (
            <tr key={platformUser.uid}>
              <td>
                <ClientDot name={platformUser.email ?? platformUser.uid} />
                <b>{platformUser.email ?? platformUser.uid}</b>
              </td>
              <td>{platformUser.organizations.length || '—'}</td>
              <td>
                {Object.entries(platformUser.roles).length
                  ? Object.entries(platformUser.roles)
                      .map(([, role]) => role)
                      .join(' • ')
                  : '—'}
              </td>
              <td>
                <span className={platformUser.platformAdmin ? 'pill sent' : 'pill draft'}>
                  {platformUser.platformAdmin ? 'Admin' : 'User'}
                </span>
              </td>
              <td>{formatDate(platformUser.createdAt)}</td>
              <td>
                <button
                  type="button"
                  className="rowaction"
                  title="Manage user"
                  onClick={() => {
                    setSelectedUser(platformUser);
                    setMessage(null);
                    setError(null);
                  }}
                >
                  ···
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>

      <Drawer open={Boolean(selectedUser)} onClose={() => setSelectedUser(null)}>
        {selectedUser ? (
          <UserMembershipManager
            user={selectedUser}
            organizations={organizations}
            onRefresh={() => usersQuery.refetch()}
            onFeedback={(feedback) => {
              setMessage(feedback);
              setError(null);
            }}
            onError={(feedbackError) => {
              setError(feedbackError);
              setMessage(null);
            }}
            canManageMemberships
            canManagePlatformAccess
          />
        ) : null}
      </Drawer>
    </div>
  );
}

export default AdminUsersPage;
