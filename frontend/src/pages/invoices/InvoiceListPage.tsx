import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useInvoices, useInvoiceStatusMutation, useInvoicePdfRequest } from '../../hooks/useInvoices'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { formatMoney } from '../../utils/currency'
import { useTenant } from '../../context/AuthContext'

const statusToBadge: Record<string, string> = {
  paid: 'badge--success',
  overdue: 'badge--danger',
  draft: 'badge--muted',
  sent: 'badge--info',
  payment_pending: 'badge--warning',
  void: 'badge--danger',
}

function InvoiceListPage() {
  const [actionError, setActionError] = useState<string | null>(null)
  const [markingInvoiceId, setMarkingInvoiceId] = useState<string | null>(null)
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null)
  const { activeOrgId, loading: tenantLoading } = useTenant()
  const invoicesQuery = useInvoices(activeOrgId ?? undefined)
  const statusMutation = useInvoiceStatusMutation(activeOrgId ?? undefined)
  const receiptMutation = useInvoicePdfRequest(activeOrgId ?? undefined, 'receipt')

  if (tenantLoading || invoicesQuery.isLoading) {
    return <LoadingState message="Fetching invoices…" />
  }

  if (!activeOrgId) {
    return <ErrorState title="No organization selected" description="Choose an organization to view invoices." />
  }

  if (invoicesQuery.isError) {
    return <ErrorState onRetry={() => invoicesQuery.refetch()} />
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Invoices</h1>
          <p>Track and manage invoices across tenants.</p>
        </div>
        <div className="page__actions">
          <Link to="/app/invoices/new" className="button button--primary">
            Create invoice
          </Link>
        </div>
      </header>

      <section className="panel list-panel">
        <div className="list-panel__filters">
          <label className="field">
            <span>Status</span>
            <select defaultValue="all">
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
          <label className="field">
            <span>Client</span>
            <input type="search" placeholder="Search clients" />
          </label>
          <label className="field">
            <span>Date range</span>
            <input type="date" />
          </label>
        </div>
        {actionError ? <p className="auth-error">{actionError}</p> : null}

        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Status</th>
              <th>Issued</th>
              <th>Due</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoicesQuery.data?.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.number}</td>
                <td>{invoice.clientName}</td>
                <td>
                  <span className={`badge ${statusToBadge[invoice.status] ?? ''}`}>
                    {invoice.status === 'paid'
                      ? invoice.receiptPdfUrl
                        ? 'Paid • Receipt ready'
                        : 'Paid • Awaiting receipt'
                      : invoice.status}
                  </span>
                </td>
                <td>{invoice.issueDate}</td>
                <td>{invoice.dueDate}</td>
                <td>{formatMoney(invoice.total)}</td>
                <td className="table__actions">
                  <Link to={`/app/invoices/${invoice.id}`} className="button button--ghost">
                    {invoice.status === 'paid' ? 'View receipt' : 'View invoice'}
                  </Link>
                  {invoice.status !== 'paid' ? (
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => {
                        if (statusMutation.isPending) {
                          return
                        }
                        setActionError(null)
                        setMarkingInvoiceId(invoice.id)
                        statusMutation
                          .mutateAsync({ invoiceId: invoice.id, status: 'paid' })
                          .catch((err: Error) => {
                            setActionError(err.message)
                          })
                          .finally(() => {
                            setMarkingInvoiceId(null)
                          })
                      }}
                      disabled={statusMutation.isPending && markingInvoiceId === invoice.id}
                    >
                      {statusMutation.isPending && markingInvoiceId === invoice.id ? 'Marking…' : 'Mark as paid'}
                    </button>
                  ) : invoice.receiptPdfUrl ? (
                    <a
                      href={invoice.receiptPdfUrl}
                      className="button button--secondary"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download receipt
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => {
                        if (receiptMutation.isPending) {
                          return
                        }
                        setActionError(null)
                        setReceiptInvoiceId(invoice.id)
                        receiptMutation
                          .mutateAsync(invoice.id)
                          .catch((err: Error) => {
                            setActionError(err.message)
                          })
                          .finally(() => {
                            setReceiptInvoiceId(null)
                          })
                      }}
                      disabled={receiptMutation.isPending && receiptInvoiceId === invoice.id}
                    >
                      {receiptMutation.isPending && receiptInvoiceId === invoice.id
                        ? 'Generating…'
                        : 'Generate receipt'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default InvoiceListPage

