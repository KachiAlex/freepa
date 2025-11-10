import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { useClients } from '../../hooks/useClients'
import { useTenant } from '../../context/AuthContext'

function ClientsPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const clientsQuery = useClients(activeOrgId ?? undefined)

  if (tenantLoading || clientsQuery.isLoading) {
    return <LoadingState message="Loading clients…" />
  }

  if (!activeOrgId) {
    return <ErrorState title="No organization selected" description="Choose an organization to view clients." />
  }

  if (clientsQuery.isError) {
    return <ErrorState onRetry={() => clientsQuery.refetch()} />
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Clients</h1>
          <p>Manage billing contacts and view outstanding balances.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="button button--primary">
            Add client
          </button>
        </div>
      </header>

      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Tags</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {clientsQuery.data?.map((client) => (
              <tr key={client.id}>
                <td>{client.name}</td>
                <td>{client.email}</td>
                <td>{client.tags?.join(', ') ?? '—'}</td>
                <td>${client.outstandingBalance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default ClientsPage

