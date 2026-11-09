import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import InvoiceDrawer from '../../components/invoices/InvoiceDrawer'
import { PageHeading } from '../../components/ui/PageHeading'
import { Panel } from '../../components/ui/Panel'
import { StatusPill } from '../../components/ui/StatusPill'
import { ClientDot, DataTable } from '../../components/ui/DataTable'
import { useToast } from '../../context/ToastContext'
import { useTenant } from '../../context/AuthContext'
import { useInvoices } from '../../hooks/useInvoices'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import type { Invoice } from '../../types/invoice'

const TABS = ['All', 'Draft', 'Sent', 'Paid', 'Overdue'] as const
type Tab = (typeof TABS)[number]

const TAB_STATUS: Record<Exclude<Tab, 'All'>, string> = {
  Draft: 'draft',
  Sent: 'sent',
  Paid: 'paid',
  Overdue: 'overdue',
}

function exportCsv(invoices: Invoice[]) {
  const header = 'number,client,status,issue_date,due_date,total,currency\n'
  const rows = invoices
    .map((invoice) =>
      [
        invoice.number,
        `"${invoice.clientName.replace(/"/g, '""')}"`,
        invoice.status,
        invoice.issueDate,
        invoice.dueDate,
        invoice.total.amount,
        invoice.currency,
      ].join(','),
    )
    .join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'invoices.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

function InvoiceListPage() {
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const { notify } = useToast()
  const invoicesQuery = useInvoices(activeOrgId ?? undefined)
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('All')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const search = searchParams.get('search') ?? ''

  const filtered = useMemo(() => {
    const invoices = invoicesQuery.data ?? []
    const byTab =
      tab === 'All' ? invoices : invoices.filter((invoice) => invoice.status === TAB_STATUS[tab])
    if (!search.trim()) return byTab
    const query = search.trim().toLowerCase()
    return byTab.filter((invoice) =>
      [invoice.number, invoice.clientName, invoice.status].some((field) =>
        field.toLowerCase().includes(query),
      ),
    )
  }, [invoicesQuery.data, tab, search])

  if (tenantLoading || invoicesQuery.isLoading) {
    return <LoadingState message="Fetching invoices…" />
  }

  if (!activeOrgId) {
    return (
      <ErrorState
        title="No organization selected"
        description="Choose an organization to view invoices."
      />
    )
  }

  if (invoicesQuery.isError) {
    return <ErrorState onRetry={() => invoicesQuery.refetch()} />
  }

  return (
    <div>
      <PageHeading
        eyebrow="Manage your billing"
        title="Invoices"
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                exportCsv(filtered)
                notify(`Exported ${filtered.length} invoice(s) to CSV.`)
              }}
            >
              ↓ &nbsp; Export
            </button>
            <Link to="/app/invoices/new" className="btn primary">
              + &nbsp; Create invoice
            </Link>
          </>
        }
      />

      <Panel
        title="All invoices"
        description="Review, send and track payments across every invoice"
        action={
          <input
            className="filter"
            placeholder="⌕ Search invoices"
            value={search}
            onChange={(event) =>
              setSearchParams(event.target.value ? { search: event.target.value } : {}, {
                replace: true,
              })
            }
          />
        }
      >
        <div className="table-tools">
          <div className="tabs">
            {TABS.map((option) => (
              <button
                key={option}
                type="button"
                className={`tab ${tab === option ? 'active' : ''}`}
                onClick={() => setTab(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <button type="button" className="filter" onClick={() => notify('Advanced filters are not wired yet.')}>
            ☷ Filters
          </button>
        </div>

        <DataTable
          columns={['Invoice', 'Client', 'Issued', 'Due date', 'Amount', 'Status', '']}
          empty={
            filtered.length === 0 ? (
              <div className="empty">
                <div className="big">▤</div>
                <h3>No invoices found</h3>
                <p>Try a different filter or create a new invoice.</p>
              </div>
            ) : undefined
          }
        >
          {filtered.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <b
                  style={{ color: '#365ddb', cursor: 'pointer' }}
                  onClick={() => setSelectedInvoice(invoice)}
                >
                  {invoice.number}
                </b>
              </td>
              <td>
                <ClientDot name={invoice.clientName} />
                <b>{invoice.clientName}</b>
              </td>
              <td>{formatDate(invoice.issueDate)}</td>
              <td>{formatDate(invoice.dueDate)}</td>
              <td>
                <b>{formatMoney(invoice.total)}</b>
              </td>
              <td>
                <StatusPill status={invoice.status} />
              </td>
              <td>
                <button
                  type="button"
                  className="rowaction"
                  title="Invoice details"
                  onClick={() => setSelectedInvoice(invoice)}
                >
                  ···
                </button>
              </td>
            </tr>
          ))}
        </DataTable>

        <div className="foot">
          <span>{filtered.length} invoices shown</span>
          <div className="pager">
            <button type="button">‹</button>
            <button type="button" className="current">
              1
            </button>
            <button type="button">›</button>
          </div>
        </div>
      </Panel>

      <InvoiceDrawer
        invoice={selectedInvoice}
        organizationId={activeOrgId ?? undefined}
        onClose={() => setSelectedInvoice(null)}
      />
    </div>
  )
}

export default InvoiceListPage
