import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminOrganization, AdminUser, OrgRole } from '../../services/admin';
import {
  ORG_ROLES,
  removeMemberAdmin,
  setMemberRoleAdmin,
  grantPlatformAdminUser,
  revokePlatformAdminUser,
} from '../../services/admin';

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

function initials(email?: string | null): string {
  if (!email) return '?';
  const parts = email.split('@')[0].split(/[.\-_]+/);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? '');
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

  const handleToggleAdmin = async () => {
    if (!canManagePlatformAccess) return;
    await adminToggleMutation.mutateAsync(user.platformAdmin ? 'revoke' : 'grant');
  };

  const isProcessing =
    roleMutation.isPending || removeMutation.isPending || adminToggleMutation.isPending;

  return (
    <div>
      <div className="member" style={{ borderBottom: 0 }}>
        <span className="avatar">{initials(user.email)}</span>
        <span className="meta">
          <b>{user.email ?? user.uid}</b>
          <small>{user.platformAdmin ? 'Platform admin' : 'Standard user'}</small>
        </span>
        {canManagePlatformAccess ? (
          <button
            type="button"
            className={user.platformAdmin ? 'btn destructive' : 'btn'}
            onClick={handleToggleAdmin}
            disabled={adminToggleMutation.isPending || (!user.email && !user.platformAdmin)}
          >
            {adminToggleMutation.isPending
              ? user.platformAdmin
                ? 'Revoking…'
                : 'Granting…'
              : user.platformAdmin
                ? 'Revoke admin'
                : 'Grant admin'}
          </button>
        ) : null}
      </div>

      <h4 style={{ font: '800 13px Manrope', margin: '22px 0 6px' }}>Organization memberships</h4>
      {user.organizations.length === 0 ? (
        <p className="mini-note">No organizations assigned.</p>
      ) : (
        user.organizations.map((orgId) => {
          const organization = organizations.find((item) => item.id === orgId);
          const role = draftRoles[orgId] ?? 'viewer';
          return (
            <div className="member" key={orgId}>
              <span className="avatar">{(organization?.name ?? orgId).charAt(0).toUpperCase()}</span>
              <span className="meta">
                <b>{organization?.name ?? orgId}</b>
                <small>{orgId}</small>
              </span>
              <select
                value={role}
                onChange={(event) =>
                  setDraftRoles((prev) => ({ ...prev, [orgId]: event.target.value as OrgRole }))
                }
                disabled={isProcessing || !canManageMemberships}
              >
                {ORG_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="member-action"
                title="Save role"
                disabled={roleMutation.isPending || !canManageMemberships}
                onClick={() => roleMutation.mutate({ organizationId: orgId, role })}
              >
                ✓
              </button>
              <button
                type="button"
                className="member-action"
                title="Remove from organization"
                disabled={removeMutation.isPending || !canManageMemberships}
                onClick={() => removeMutation.mutate(orgId)}
              >
                ✕
              </button>
            </div>
          );
        })
      )}

      <h4 style={{ font: '800 13px Manrope', margin: '22px 0 6px' }}>Add to organization</h4>
      {availableOrganizations.length === 0 ? (
        <p className="mini-note">All organizations already assigned.</p>
      ) : (
        <>
          <div className="field">
            <label>Organization</label>
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
          </div>
          <div className="field">
            <label>Role</label>
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
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => roleMutation.mutate({ organizationId: newOrgId, role: newRole })}
            disabled={roleMutation.isPending || !newOrgId || !canManageMemberships}
          >
            {roleMutation.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </>
      )}
    </div>
  );
}

export default UserMembershipManager;
