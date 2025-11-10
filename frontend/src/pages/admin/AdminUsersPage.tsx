import { Fragment, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { useAdminOrganizations, useAdminUsers } from '../../hooks/useAdminData';
import { grantPlatformAdminUser, revokePlatformAdminUser } from '../../services/admin';
import UserMembershipManager from '../../components/admin/UserMembershipManager';
import { useAuth } from '../../context/AuthContext';

function AdminUsersPage() {
  const usersQuery = useAdminUsers();
  const organizationsQuery = useAdminOrganizations();
  const queryClient = useQueryClient();
  const { isPlatformAdmin, user } = useAuth();

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidateAdminData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] }),
    ]);
  };

  const grantMutation = useMutation({
    mutationFn: grantPlatformAdminUser,
    onSuccess: async (result) => {
      await invalidateAdminData();
      setMessage(`Granted platform admin to ${result.email ?? result.uid}.`);
    },
    onError: (err: unknown) => {
      setError((err as Error).message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (payload: { targetUid: string; targetEmail?: string }) => revokePlatformAdminUser(payload),
    onSuccess: async (result) => {
      await invalidateAdminData();
      setMessage(`Revoked platform admin from ${result.email ?? result.uid}.`);
    },
    onError: (err: unknown) => {
      setError((err as Error).message);
    },
  });

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
  const adminActionPending = grantMutation.isPending || revokeMutation.isPending;

  const handleGrantAdmin = async (email: string | null | undefined) => {
    if (!email) {
      setError('Cannot grant platform admin without a user email.');
      return;
    }
    setError(null);
    setMessage(null);
    await grantMutation.mutateAsync(email);
  };

  const handleRevokeAdmin = async (uid: string, email?: string | null) => {
    setError(null);
    setMessage(null);
    await revokeMutation.mutateAsync({ targetUid: uid, targetEmail: email ?? undefined });
  };

  const toggleUserExpansion = (uid: string) => {
    setExpandedUserId((current) => (current === uid ? null : uid));
    setMessage(null);
    setError(null);
  };

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Users</h1>
          <p>Manage platform accounts and tenant assignments.</p>
        </div>
      </header>
      {message ? <p className="auth-message">{message}</p> : null}
      {error ? <p className="auth-error">{error}</p> : null}
      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Organizations</th>
              <th>Roles</th>
              <th>Platform admin</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((platformUser) => {
              const isExpanded = expandedUserId === platformUser.uid;
              return (
                <Fragment key={platformUser.uid}>
                  <tr className={isExpanded ? 'table__row--expanded' : undefined}>
                    <td>
                      <div className="admin-user-cell">
                        <span className="admin-user-cell__name">{platformUser.email ?? platformUser.uid}</span>
                        {platformUser.email === user?.email ? (
                          <span className="admin-user-cell__badge">You</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{platformUser.organizations.join(', ') || '—'}</td>
                    <td>
                      {Object.entries(platformUser.roles).length
                        ? Object.entries(platformUser.roles)
                            .map(([orgId, role]) => `${orgId}: ${role}`)
                            .join(' • ')
                        : '—'}
                    </td>
                    <td>
                      <span className={platformUser.platformAdmin ? 'badge badge--info' : 'badge badge--muted'}>
                        {platformUser.platformAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td>{platformUser.createdAt ?? '—'}</td>
                    <td>{platformUser.updatedAt ?? '—'}</td>
                    <td className="table__actions">
                      {isPlatformAdmin ? (
                        <div className="admin-user-actions">
                          <button
                            type="button"
                            className="button button--ghost"
                            onClick={() =>
                              platformUser.platformAdmin
                                ? handleRevokeAdmin(platformUser.uid, platformUser.email)
                                : handleGrantAdmin(platformUser.email)
                            }
                            disabled={adminActionPending}
                          >
                            {adminActionPending
                              ? platformUser.platformAdmin
                                ? 'Revoking…'
                                : 'Granting…'
                              : platformUser.platformAdmin
                                ? 'Revoke admin'
                                : 'Grant admin'}
                          </button>
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => toggleUserExpansion(platformUser.uid)}
                          >
                            {isExpanded ? 'Hide tools' : 'Manage'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => toggleUserExpansion(platformUser.uid)}
                        >
                          {isExpanded ? 'Hide details' : 'View'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="admin-users__manager-row">
                      <td colSpan={7}>
                        <UserMembershipManager
                          user={platformUser}
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
                          canManageMemberships={isPlatformAdmin}
                          canManagePlatformAccess={isPlatformAdmin}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default AdminUsersPage;

