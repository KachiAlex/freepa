import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { PageHeading } from '../../components/ui/PageHeading'
import { Panel, PanelLink } from '../../components/ui/Panel'
import { StatGrid } from '../../components/ui/StatGrid'
import { ClientDot, DataTable } from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { useTenant } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useClients } from '../../hooks/useClients'
import { useInvoices } from '../../hooks/useInvoices'
import { createClient } from '../../services/clients'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import type { Client } from '../../types/client'
import type { CurrencyCode } from '../../types/core'

function ClientsPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const clientsQuery = useClients(activeOrgId ?? undefined)
  const invoicesQuery = useInvoices(activeOrgId ?? undefined)

  const [addOpen, setAddOpen] = useState(false)
  const [detailClient, setDetailClient] = useState<Client | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' })
  const [formError, setFormError] = useState<string | null>(null)

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data])
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data])

  const currency: CurrencyCode = invoices[0]?.currency ?? 'USD'

  const billedByClient = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    invoices.forEach((invoice) => {
      const entry = map.get(invoice.clientName) ?? { count: 0, total: 0 }
      entry.count += 1
      entry.total += invoice.total.amount
      map.set(invoice.clientName, entry)
    })
    return map
  }, [invoices])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const newThisMonth = clients.filter(
    (client) => client.createdAt && new Date(client.createdAt).getTime() >= startOfMonth,
  ).length
  const activeThisMonth = clients.filter(
    (client) => client.lastInvoiceDate && new Date(client.lastInvoiceDate).getTime() >= startOfMonth,
  ).length
  const unpaidCount = invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status)).length

  const createMutation = useMutation({
    mutationFn: () =>
      createClient(activeOrgId!, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients', activeOrgId] })
      notify('Client saved.')
      setAddOpen(false)
      setForm({ name: '', email: '', phone: '', address: '' })
    },
    onError: (error) => setFormError((error as Error).message),
  })

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
    <div>
      <PageHeading
        eyebrow="People and businesses you bill"
        title="Clients"
        actions={
          <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
            + &nbsp; Add client
          </button>
        }
      />

      <StatGrid
        stats={[
          {
            label: 'Total clients',
            value: String(clients.length),
            icon: '♙',
            iconBg: '#eaf0ff',
            iconColor: '#4d6ae7',
            change: 'Across your workspace',
            changeMuted: true,
          },
          {
            label: 'Active this month',
            value: String(activeThisMonth),
            icon: '↗',
            iconBg: '#e8f8f2',
            iconColor: '#139974',
            change: 'Invoiced recently',
            changeMuted: true,
          },
          {
            label: 'Unpaid invoices',
            value: String(unpaidCount),
            icon: '◷',
            iconBg: '#fff3e7',
            iconColor: '#df9b48',
            change: 'Across all clients',
            changeMuted: true,
          },
          {
            label: 'New this month',
            value: String(newThisMonth),
            icon: '✦',
            iconBg: '#f1ebff',
            iconColor: '#8162c0',
            change: 'Recently onboarded',
            changeMuted: true,
          },
        ]}
      />

      <Panel
        title="Client directory"
        description="Contacts, companies and billing relationships"
        action={<PanelLink onClick={() => setAddOpen(true)}>Add new →</PanelLink>}
      >
        <DataTable
          columns={['Client', 'Email', 'Invoices', 'Total billed', '']}
          empty={
            clients.length === 0 ? (
              <div className="empty">
                <div className="big">♙</div>
                <h3>No clients yet</h3>
                <p>Add your first client to start invoicing faster.</p>
              </div>
            ) : undefined
          }
        >
          {clients.map((client) => {
            const billing = billedByClient.get(client.name) ?? { count: 0, total: 0 }
            return (
              <tr key={client.id}>
                <td>
                  <ClientDot name={client.name} />
                  <b>{client.name}</b>
                </td>
                <td>{client.email || '—'}</td>
                <td>{billing.count}</td>
                <td>
                  <b>{formatMoney({ amount: billing.total, currency })}</b>
                </td>
                <td>
                  <button type="button" className="rowaction" onClick={() => setDetailClient(client)}>
                    ···
                  </button>
                </td>
              </tr>
            )
          })}
        </DataTable>
      </Panel>

      <Drawer open={addOpen} onClose={() => setAddOpen(false)}>
        <h2>Add a client</h2>
        <p>Save a business or contact for faster invoicing.</p>
        <div className="field">
          <label>Business / client name</label>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Acme Corporation"
          />
        </div>
        <div className="field">
          <label>Email address</label>
          <input
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="billing@company.com"
          />
        </div>
        <div className="field">
          <label>Phone number</label>
          <input
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            placeholder="+234"
          />
        </div>
        <div className="field">
          <label>Billing address</label>
          <textarea
            value={form.address}
            onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
            placeholder="Client address"
          />
        </div>
        {formError ? <p className="form-error">{formError}</p> : null}
        <button
          type="button"
          className="btn primary"
          disabled={createMutation.isPending || !form.name.trim()}
          onClick={() => {
            setFormError(null)
            createMutation.mutate()
          }}
        >
          {createMutation.isPending ? 'Saving…' : 'Save client'}
        </button>
      </Drawer>

      <Drawer open={Boolean(detailClient)} onClose={() => setDetailClient(null)}>
        {detailClient ? (
          <>
            <h2>{detailClient.name}</h2>
            <p>Client details and billing summary.</p>
            <div className="member">
              <span className="avatar">{detailClient.name.charAt(0).toUpperCase()}</span>
              <span className="meta">
                <b>{detailClient.name}</b>
                <small>{detailClient.email || 'No email on file'}</small>
              </span>
            </div>
            <div className="info" style={{ marginTop: 18 }}>
              <b>Outstanding balance:</b>{' '}
              {formatMoney({ amount: detailClient.outstandingBalance ?? 0, currency })}
              <br />
              <b>Last invoice:</b> {formatDate(detailClient.lastInvoiceDate)}
              <br />
              <b>Phone:</b> {detailClient.phone || '—'}
            </div>
          </>
        ) : null}
      </Drawer>
    </div>
  )
}

export default ClientsPage
