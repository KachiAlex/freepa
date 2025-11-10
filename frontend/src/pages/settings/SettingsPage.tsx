import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { useTenant } from '../../context/AuthContext';
import { useMembers, useAssignMemberRole, useRemoveMember } from '../../hooks/useMembers';

const ROLES = ['owner', 'admin', 'manager', 'editor', 'finance', 'viewer'] as const;

function SettingsPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant();
  const membersQuery = useMembers(activeOrgId ?? undefined);
  const assignRole = useAssignMemberRole(activeOrgId ?? undefined);
  const removeMember = useRemoveMember(activeOrgId ?? undefined);

  if (tenantLoading) {
    return <LoadingState message="Loading organization settings…" />;
  }

  if (!activeOrgId) {
    return <ErrorState title="No organization selected" description="Choose an organization to manage settings." />;
  }

  return (
    <div className="page settings-page">
      <header className="page__header">
        <div>
          <h1>Settings</h1>
          <p>Configure organization defaults, branding, and payment providers.</p>
        </div>
      </header>

      <section className="panel settings-section">
        <h2>Organization profile</h2>
        <div className="settings-grid">
          <label className="field">
            <span>Business name</span>
            <input defaultValue="Acme LLC" />
          </label>
          <label className="field">
            <span>Support email</span>
            <input defaultValue="support@acme.com" />
          </label>
          <label className="field">
            <span>Default currency</span>
            <select defaultValue="USD">
              <option value="USD">USD</option>
              <option value="NGN">NGN</option>
              <option value="GHS">GHS</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
          <label className="field">
            <span>Locale</span>
            <select defaultValue="en-US">
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="fr-FR">French (France)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel settings-section">
        <h2>Payment providers</h2>
        <div className="settings-grid">
          <label className="field">
            <span>Flutterwave live secret</span>
            <input type="password" placeholder="FLWSECK-..." />
          </label>
          <label className="field">
            <span>Paystack live secret</span>
            <input type="password" placeholder="sk_live_..." />
          </label>
          <label className="field">
            <span>Webhook URL</span>
            <input readOnly value="https://<region>-<project>.cloudfunctions.net/payments" />
          </label>
          <label className="field">
            <span>Dunning cadence</span>
            <select defaultValue="NET_14">
              <option value="NET_7">7 days</option>
              <option value="NET_14">14 days</option>
              <option value="NET_30">30 days</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel settings-section">
        <h2>Team access</h2>
        {membersQuery.isLoading ? (
          <LoadingState message="Loading members…" />
        ) : membersQuery.isError ? (
          <ErrorState onRetry={() => membersQuery.refetch()} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {membersQuery.data?.map((member) => (
                <tr key={member.uid}>
                  <td>{member.email ?? member.uid}</td>
                  <td>
                    <select
                      value={member.role}
                      onChange={(event) =>
                        assignRole.mutate({
                          targetUid: member.uid,
                          role: event.target.value,
                        })
                      }
                      disabled={assignRole.isPending}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{member.updatedAt ? new Date(member.updatedAt).toLocaleString() : '—'}</td>
                  <td className="table__actions">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => removeMember.mutate(member.uid)}
                      disabled={removeMember.isPending}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {membersQuery.data?.length === 0 ? (
                <tr>
                  <td colSpan={4}>No members added yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default SettingsPage;
