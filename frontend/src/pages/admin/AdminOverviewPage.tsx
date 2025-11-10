import type { FormEvent } from 'react';
import { useState } from 'react';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import {
  useAdminInvoices,
  useAdminOrganizations,
  useAdminPayments,
  useAdminStats,
  useAdminUsers,
} from '../../hooks/useAdminData';
import { formatMoney } from '../../utils/currency';
import { useAuth } from '../../context/AuthContext';
import { grantPlatformAdminUser } from '../../services/admin';

function AdminOverviewPage() {
  const organizationsQuery = useAdminOrganizations();
  const usersQuery = useAdminUsers();
  const statsQuery = useAdminStats();
  const invoicesQuery = useAdminInvoices(10);
  const paymentsQuery = useAdminPayments(10);
  const { isPlatformAdmin } = useAuth();
  const [grantEmail, setGrantEmail] = useState('');
  const [grantStatus, setGrantStatus] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantLoading, setGrantLoading] = useState(false);

  if (
    organizationsQuery.isLoading ||
    usersQuery.isLoading ||
    statsQuery.isLoading ||
    invoicesQuery.isLoading ||
    paymentsQuery.isLoading
  ) {
    return <LoadingState message="Loading platform overview…" />;
  }

  if (
    organizationsQuery.isError ||
    usersQuery.isError ||
    statsQuery.isError ||
    invoicesQuery.isError ||
    paymentsQuery.isError
  ) {
    return (
      <ErrorState
        onRetry={() => {
          organizationsQuery.refetch();
          usersQuery.refetch();
          statsQuery.refetch();
          invoicesQuery.refetch();
          paymentsQuery.refetch();
        }}
      />
    );
  }

  const organizations = organizationsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const stats = statsQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];

  const handleGrantAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGrantStatus(null);
    setGrantError(null);
    setGrantLoading(true);
    try {
      const result = await grantPlatformAdminUser(grantEmail);
      setGrantStatus(`Granted platform admin to ${result.email ?? result.uid}`);
      setGrantEmail('');
      await usersQuery.refetch();
      await statsQuery.refetch();
    } catch (error) {
      setGrantError((error as Error).message);
    } finally {
      setGrantLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Platform overview</h1>
          <p>Monitor health across organizations, accounts, and cash flow.</p>
        </div>
      </header>

      <section className="panel-grid">
        <article className="panel">
          <p className="panel__label">Organizations</p>
          <p className="panel__value">{stats?.totalOrganizations ?? organizations.length}</p>
          <p className="panel__trend">Active tenants</p>
        </article>
        <article className="panel">
          <p className="panel__label">Users</p>
          <p className="panel__value">{stats?.totalUsers ?? users.length}</p>
          <p className="panel__trend">
            Platform admins: {stats?.platformAdmins ?? users.filter((u) => u.platformAdmin).length}
          </p>
        </article>
        <article className="panel">
          <p className="panel__label">Invoices tracked</p>
          <p className="panel__value">{stats?.totalInvoices ?? invoices.length}</p>
          <p className="panel__trend">
            Paid: {stats?.paidInvoices ?? invoices.filter((invoice) => invoice.status === 'paid').length} • Pending:{' '}
            {stats?.pendingInvoices ?? invoices.filter((invoice) => invoice.status !== 'paid').length}
          </p>
        </article>
        <article className="panel">
          <p className="panel__label">Payments recent</p>
          <p className="panel__value">{payments.length}</p>
          <p className="panel__trend">Recent settlement</p>
        </article>
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2>Recent invoices</h2>
        </header>
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Organization</th>
              <th>Client</th>
              <th>Status</th>
              <th>Total</th>
              <th>Issued</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={`${invoice.organizationId}-${invoice.id}`}>
                <td>{invoice.number}</td>
                <td>{invoice.organizationId}</td>
                <td>{invoice.clientName}</td>
                <td>
                  <span className={`badge ${invoice.status === 'paid' ? 'badge--success' : 'badge--info'}`}>
                    {invoice.status}
                  </span>
                </td>
                <td>{formatMoney(invoice.total)}</td>
                <td>{invoice.issueDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2>Recent payments</h2>
        </header>
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Invoice</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.reference}</td>
                <td>{payment.invoiceNumber}</td>
                <td>{payment.provider}</td>
                <td>
                  <span className={`badge ${payment.status === 'settled' ? 'badge--success' : 'badge--warning'}`}>
                    {payment.status}
                  </span>
                </td>
                <td>{formatMoney(payment.amount)}</td>
                <td>{payment.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isPlatformAdmin ? (
        <section className="panel">
          <header className="panel__header">
            <h2>Admin tools</h2>
            <p>Grant platform admin access to another user.</p>
          </header>
          <form className="admin-grant-form" onSubmit={handleGrantAdmin}>
            <label className="field">
              <span>User email</span>
              <input
                type="email"
                value={grantEmail}
                onChange={(event) => setGrantEmail(event.target.value)}
                required
              />
            </label>
            {grantError ? <p className="auth-error">{grantError}</p> : null}
            {grantStatus ? <p className="auth-message">{grantStatus}</p> : null}
            <button type="submit" className="button button--primary" disabled={grantLoading}>
              {grantLoading ? 'Granting…' : 'Grant admin access'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export default AdminOverviewPage;

