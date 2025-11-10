import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminOrganization, AdminUser, OrgRole } from '../../services/admin';
import { ORG_ROLES, removeMemberAdmin, setMemberRoleAdmin, grantPlatformAdminUser, revokePlatformAdminUser } from '../../services/admin';

type Props = {
  user: AdminUser;
  organizations: AdminOrganization[];
  onRefresh?: () => void;
  onFeedback?: (message: string) => void;
  onError?: (message: string) => void;
  canManageMemberships: boolean;
  canManagePlatformAccess: boolean;
};

type RoleMap = Record<string, OrgRole>;

function toRoleMap(user: AdminUser): RoleMap {
  const entries = Object.entries(user.roles) as Array<[string, OrgRole]>;
  return entries.reduce<RoleMap>((acc, [orgId, role]) => {
    acc[orgId] = role;
    return acc;
  }, {});
}

function UserMembershipManager({
  user,
  organizations,
  onRefresh,
  onFeedback,
  onError,
  canManageMemberships,
  canManagePlatformAccess,
}: Props) {
  const queryClient = useQueryClient();
  const [draftRoles, setDraftRoles] = useState<RoleMap>(() => toRoleMap(user));
  const [newOrgId, setNewOrgId] = useState<string>('');
  const [newRole, setNewRole] = useState<OrgRole>('viewer');

  const memberOrgIds = useMemo(() => new Set(user.organizations), [user.organizations]);
  const availableOrganizations = useMemo(
    () => organizations.filter((org) => !memberOrgIds.has(org.id)),
    [organizations, memberOrgIds],
  );

  useEffect(() => {
    setDraftRoles(toRoleMap(user));
  }, [user]);

  useEffect(() => {
    if (!newOrgId && availableOrganizations.length > 0) {
      setNewOrgId(availableOrganizations[0].id);
    }
  }, [availableOrganizations, newOrgId]);

  const invalidateAdminData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] }),
    ]);
    onRefresh?.();
  };

  const roleMutation = useMutation({
    mutationFn: ({ organizationId, role }: { organizationId: string; role: OrgRole }) =>
      setMemberRoleAdmin({ organizationId, targetUid: user.uid, role }),
    onSuccess: async () => {
      await invalidateAdminData();
      onFeedback?.('Role updated successfully.');
    },
    onError: (error: unknown) => {
      onError?.((error as Error).message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (organizationId: string) => removeMemberAdmin({ organizationId, targetUid: user.uid }),
    onSuccess: async () => {
      await invalidateAdminData();
      onFeedback?.('Member removed from organization.');
    },
    onError: (error: unknown) => {
      onError?.((error as Error).message);
    },
  });

  const adminToggleMutation = useMutation({
    mutationFn: async (nextState: 'grant' | 'revoke') => {
      if (nextState === 'grant') {
        if (!user.email) {
          throw new Error('Cannot grant admin privileges. User email is not available.');
        }
        return grantPlatformAdminUser(user.email);
      }
      return revokePlatformAdminUser({ targetUid: user.uid });
    },
    onSuccess: async (result, action) => {
      await invalidateAdminData();
      if (action === 'grant') {
        onFeedback?.(`Granted platform admin to ${result.email ?? user.uid}.`);
      } else {
        onFeedback?.(`Revoked platform admin from ${user.email ?? user.uid}.`);
      }
    },
    onError: (error: unknown) => {
      onError?.((error as Error).message);
    },
  });

  const handleRoleChange = (organizationId: string, role: OrgRole) => {
    setDraftRoles((prev) => ({
      ...prev,
      [organizationId]: role,
    }));
  };

  const handleSaveRole = async (organizationId: string) => {
    if (!canManageMemberships) return;
    const selectedRole = draftRoles[organizationId];
    if (!selectedRole) {
      onError?.('Select a role before saving.');
      return;
    }
    await roleMutation.mutateAsync({ organizationId, role: selectedRole });
  };

  const handleRemoveMember = async (organizationId: string) => {
    if (!canManageMemberships) return;
    await removeMutation.mutateAsync(organizationId);
  };

  const handleAddMembership = async () => {
    if (!canManageMemberships) return;
    if (!newOrgId) {
      onError?.('Select an organization to add.');
      return;
    }
    await roleMutation.mutateAsync({ organizationId: newOrgId, role: newRole });
    setNewRole('viewer');
  };

  const handleToggleAdmin = async () => {
    if (!canManagePlatformAccess) return;
    const action = user.platformAdmin ? 'revoke' : 'grant';
    await adminToggleMutation.mutateAsync(action);
  };

  const isProcessing = roleMutation.isPending || removeMutation.isPending || adminToggleMutation.isPending;

  return (
    <div className="admin-user-manager">
      <header className="admin-user-manager__header">
        <div>
          <h3>{user.email ?? user.uid}</h3>
          <p>Manage organization membership and platform access.</p>
        </div>
        {canManagePlatformAccess ? (
          <button
            type="button"
            className={user.platformAdmin ? 'button button--ghost' : 'button button--secondary'}
            onClick={handleToggleAdmin}
            disabled={adminToggleMutation.isPending || (!user.email && !user.platformAdmin)}
          >
            {adminToggleMutation.isPending
              ? user.platformAdmin
                ? 'Revoking…'
                : 'Granting…'
              : user.platformAdmin
                ? 'Revoke platform admin'
                : 'Grant platform admin'}
          </button>
        ) : null}
      </header>

      <section className="admin-user-manager__section">
        <h4>Organization memberships</h4>
        {user.organizations.length === 0 ? (
          <p className="admin-user-manager__empty">No organizations assigned.</p>
        ) : (
          <ul className="admin-user-manager__list">
            {user.organizations.map((orgId) => {
              const organization = organizations.find((item) => item.id === orgId);
              const role = draftRoles[orgId] ?? 'viewer';
              return (
                <li key={orgId} className="admin-user-manager__item">
                  <div className="admin-user-manager__item-details">
                    <p className="admin-user-manager__item-name">{organization?.name ?? orgId}</p>
                    <span className="admin-user-manager__item-id">{orgId}</span>
                  </div>
                  <div className="admin-user-manager__actions">
                    <label>
                      <span className="sr-only">Role</span>
                      <select
                        value={role}
                        onChange={(event) => handleRoleChange(orgId, event.target.value as OrgRole)}
                        disabled={isProcessing || !canManageMemberships}
                      >
                        {ORG_ROLES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => handleSaveRole(orgId)}
                      disabled={roleMutation.isPending || !canManageMemberships}
                    >
                      {roleMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => handleRemoveMember(orgId)}
                      disabled={removeMutation.isPending || !canManageMemberships}
                    >
                      {removeMutation.isPending ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="admin-user-manager__section">
        <h4>Add to organization</h4>
        {availableOrganizations.length === 0 ? (
          <p className="admin-user-manager__empty">All organizations already assigned.</p>
        ) : (
          <div className="admin-user-manager__add">
            <label>
              <span className="admin-user-manager__label">Organization</span>
              <select
                value={newOrgId}
                onChange={(event) => setNewOrgId(event.target.value)}
                disabled={isProcessing || !canManageMemberships}
              >
                {availableOrganizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name ?? org.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="admin-user-manager__label">Role</span>
              <select
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as OrgRole)}
                disabled={isProcessing || !canManageMemberships}
              >
                {ORG_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button--primary"
              onClick={handleAddMembership}
              disabled={roleMutation.isPending || !newOrgId || !canManageMemberships}
            >
              {roleMutation.isPending ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default UserMembershipManager;

