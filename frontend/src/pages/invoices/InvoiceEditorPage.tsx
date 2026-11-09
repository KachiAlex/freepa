import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { PageHeading } from '../../components/ui/PageHeading';
import { Panel } from '../../components/ui/Panel';
import { StatusPill } from '../../components/ui/StatusPill';
import {
  useInvoice,
  useInvoicePdfRequest,
  useInvoiceStatusMutation,
  useSaveInvoice,
} from '../../hooks/useInvoices';
import { useCreatePaymentIntent } from '../../hooks/usePayments';
import { useClients } from '../../hooks/useClients';
import { formatMoney } from '../../utils/currency';
import { useToast } from '../../context/ToastContext';
import { useTenant } from '../../context/AuthContext';
import type { CurrencyCode } from '../../types/core';

type InvoiceEditorPageProps = {
  mode: 'create' | 'edit';
};

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

const CURRENCY_OPTIONS: CurrencyCode[] = ['NGN', 'USD', 'GHS', 'KES', 'GBP', 'EUR'];

function InvoiceEditorPage({ mode }: InvoiceEditorPageProps) {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { activeOrgId, loading: tenantLoading } = useTenant();
  const saveInvoice = useSaveInvoice(activeOrgId ?? undefined);
  const statusMutation = useInvoiceStatusMutation(activeOrgId ?? undefined);
  const pdfMutation = useInvoicePdfRequest(activeOrgId ?? undefined);
  const receiptMutation = useInvoicePdfRequest(activeOrgId ?? undefined, 'receipt');
  const paymentIntentMutation = useCreatePaymentIntent(activeOrgId ?? undefined);
  const invoiceQuery = useInvoice(activeOrgId ?? undefined, mode === 'edit' ? invoiceId : undefined);
  const clientsQuery = useClients(activeOrgId ?? undefined);

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().substring(0, 10);
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(7.5);
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('NGN');
  const [paymentProvider, setPaymentProvider] = useState<'flutterwave' | 'paystack'>('paystack');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (invoiceQuery.data) {
      const invoice = invoiceQuery.data;
      setClientName(invoice.clientName);
      setClientEmail(
        (invoice.metadata?.customerEmail as string | undefined) ??
          invoice.clientName.toLowerCase().replace(/\s+/g, '.') + '@example.com',
      );
      setIssueDate(invoice.issueDate.substring(0, 10));
      setDueDate(invoice.dueDate.substring(0, 10));
      setLineItems(
        invoice.lineItems.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      );
      setTaxRate(invoice.lineItems[0]?.taxRate ?? 0);
      setNotes(invoice.notes ?? '');
      setCurrency((invoice.currency as CurrencyCode) ?? 'NGN');
    }
  }, [invoiceQuery.data]);

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
    const tax = (subtotal * taxRate) / 100;
    return { subtotal, tax, total: subtotal + tax };
  }, [lineItems, taxRate]);

  const handleLineItemChange = (itemId: string, field: keyof LineItem, value: string) => {
    setLineItems((items) =>
      items.map((item) =>
        item.id === itemId
          ? { ...item, [field]: field === 'description' ? value : Number(value) }
          : item,
      ),
    );
  };

  const handleStatusChange = async (status: 'sent' | 'void' | 'paid') => {
    if (!invoiceId || !activeOrgId) return;
    try {
      setFormError(null);
      await statusMutation.mutateAsync({ invoiceId, status });
      notify(`Invoice marked as ${status}.`);
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleGeneratePdf = async (type: 'invoice' | 'receipt') => {
    if (!invoiceId || !activeOrgId) return;
    try {
      setFormError(null);
      await (type === 'receipt' ? receiptMutation : pdfMutation).mutateAsync(invoiceId);
      notify(`${type === 'receipt' ? 'Receipt' : 'Invoice'} PDF requested.`);
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleCreatePaymentIntent = async () => {
    if (!invoiceId || !invoiceQuery.data || !clientEmail) {
      setFormError('Client email required before generating a payment link.');
      return;
    }
    try {
      setFormError(null);
      const link = await paymentIntentMutation.mutateAsync({
        invoice: invoiceQuery.data,
        provider: paymentProvider,
        customerEmail: clientEmail,
      });
      notify(link ? 'Payment link created.' : 'Provider did not return a link.');
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeOrgId) return;
    if (!clientName.trim()) {
      setFormError('Bill to is required.');
      return;
    }

    try {
      setFormError(null);
      await saveInvoice.mutateAsync({
        id: mode === 'edit' ? invoiceId : undefined,
        organizationId: activeOrgId,
        clientName: clientName.trim(),
        clientId: `client-${clientName.trim().toLowerCase().replace(/\s+/g, '-')}`,
        issueDate,
        dueDate,
        currency,
        metadata: { customerEmail: clientEmail },
        lineItems: lineItems.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate,
          total: {
            amount: (item.quantity * item.unitPrice * (100 + taxRate)) / 100,
            currency,
          },
        })),
        subtotal: { amount: totals.subtotal, currency },
        taxTotal: { amount: totals.tax, currency },
        total: { amount: totals.total, currency },
        notes,
      });
      notify(mode === 'create' ? 'Invoice created.' : 'Invoice updated.');
      navigate('/app/invoices');
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  if (tenantLoading || (invoiceQuery.isLoading && mode === 'edit')) {
    return <LoadingState message="Loading invoice details…" />;
  }

  if (!activeOrgId) {
    return (
      <ErrorState title="No organization selected" description="Choose an organization to manage invoices." />
    );
  }

  if (invoiceQuery.isError && mode === 'edit') {
    return <ErrorState onRetry={() => invoiceQuery.refetch()} />;
  }

  const invoice = invoiceQuery.data;
  const status = invoice?.status ?? 'draft';

  return (
    <div>
      <PageHeading
        eyebrow={mode === 'create' ? 'Invoices / New invoice' : `Invoices / ${invoice?.number ?? invoiceId}`}
        title={mode === 'create' ? 'Create invoice' : `Edit ${invoice?.number ?? invoiceId}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              ← &nbsp; Back
            </button>
            <button type="submit" form="invoice-form" className="btn primary" disabled={saveInvoice.isPending}>
              {saveInvoice.isPending ? 'Saving…' : mode === 'create' ? 'Save invoice' : 'Save changes'}
            </button>
          </>
        }
      />

      <form id="invoice-form" onSubmit={handleSubmit}>
        <div className="section-grid">
          <Panel
            title="Invoice details"
            action={<StatusPill status={mode === 'create' ? 'draft' : status} />}
          >
            <div className="form-inner">
              <div className="fieldgrid">
                <div className="field">
                  <label>Bill to</label>
                  <input
                    list="clients-list"
                    value={clientName}
                    onChange={(event) => {
                      setClientName(event.target.value);
                      const match = clientsQuery.data?.find(
                        (client) => client.name === event.target.value,
                      );
                      if (match?.email) setClientEmail(match.email);
                    }}
                    placeholder="Acme Corporation"
                    required
                  />
                  <datalist id="clients-list">
                    {(clientsQuery.data ?? []).map((client) => (
                      <option key={client.id} value={client.name} />
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label>Billing email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                    placeholder="client@example.com"
                  />
                </div>
                <div className="field">
                  <label>Currency</label>
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                  >
                    {CURRENCY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Tax rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={taxRate}
                    onChange={(event) => setTaxRate(Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Issue date</label>
                  <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                </div>
                <div className="field">
                  <label>Due date</label>
                  <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </div>
              </div>

              <div style={{ marginTop: 15 }}>
                <b style={{ fontSize: 14 }}>Line items</b>
                <p className="mini-note">Add the goods or services you are billing for.</p>
              </div>

              <table className="lineitems">
                <thead>
                  <tr>
                    <th style={{ width: '48%' }}>Description</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => {
                    const amount = item.quantity * item.unitPrice;
                    return (
                      <tr key={item.id}>
                        <td>
                          <input
                            placeholder="e.g. Website design"
                            value={item.description}
                            onChange={(event) =>
                              handleLineItemChange(item.id, 'description', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            style={{ width: 54 }}
                            value={item.quantity}
                            onChange={(event) =>
                              handleLineItemChange(item.id, 'quantity', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            style={{ width: 110 }}
                            value={item.unitPrice}
                            onChange={(event) =>
                              handleLineItemChange(item.id, 'unitPrice', event.target.value)
                            }
                          />
                        </td>
                        <td>{formatMoney({ amount, currency })}</td>
                        <td>
                          {lineItems.length > 1 ? (
                            <button
                              type="button"
                              className="rowaction"
                              title="Remove"
                              onClick={() =>
                                setLineItems((items) => items.filter((row) => row.id !== item.id))
                              }
                            >
                              ✕
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <button
                type="button"
                className="btn"
                style={{ marginTop: 14 }}
                onClick={() =>
                  setLineItems((items) => [
                    ...items,
                    { id: String(Date.now()), description: '', quantity: 1, unitPrice: 0 },
                  ])
                }
              >
                + Add line item
              </button>

              <div className="totalbox">
                <div>
                  <span>Subtotal</span>
                  <b>{formatMoney({ amount: totals.subtotal, currency })}</b>
                </div>
                <div>
                  <span>Tax ({taxRate}%)</span>
                  <b>{formatMoney({ amount: totals.tax, currency })}</b>
                </div>
                <div className="grand">
                  <span>Total due</span>
                  <span>{formatMoney({ amount: totals.total, currency })}</span>
                </div>
              </div>

              <div className="field" style={{ marginTop: 26 }}>
                <label>Notes to client (optional)</label>
                <textarea
                  placeholder="Thank you for your business!"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              {formError ? <p className="form-error">{formError}</p> : null}
            </div>
          </Panel>

          <aside>
            <Panel title="Payment options">
              <div className="form-inner">
                <div className="field">
                  <label>Accepted payment provider</label>
                  <select
                    value={paymentProvider}
                    onChange={(event) =>
                      setPaymentProvider(event.target.value as 'flutterwave' | 'paystack')
                    }
                  >
                    <option value="paystack">Paystack</option>
                    <option value="flutterwave">Flutterwave</option>
                  </select>
                </div>
                <p className="mini-note">
                  Payment links are generated via your configured provider once the invoice is
                  saved.
                </p>
                <div className="info">
                  🔒 <b>Secure payments.</b> A provider-verified webhook confirms payment status —
                  never mark invoices paid from the browser alone.
                </div>
                {mode === 'edit' ? (
                  <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={paymentIntentMutation.isPending || status === 'paid' || status === 'void'}
                      onClick={handleCreatePaymentIntent}
                    >
                      {paymentIntentMutation.isPending ? 'Creating…' : 'Create payment link'}
                    </button>
                  </div>
                ) : null}
              </div>
            </Panel>

            <Panel title="Invoice preview" >
              <div className="form-inner">
                <div
                  style={{
                    background: '#f7f9fc',
                    border: '1px dashed #dbe3ef',
                    borderRadius: 10,
                    padding: 23,
                    textAlign: 'center',
                  }}
                >
                  <div className="brand-text" style={{ fontSize: 21 }}>
                    free<span>pa</span>
                  </div>
                  <p style={{ color: '#8191a7', fontSize: 12 }}>Simple, professional invoicing</p>
                  <p className="mini-note">
                    {invoice?.pdfUrl
                      ? 'Latest invoice document is ready.'
                      : 'A print-ready PDF requires the placeholder PDF endpoint to be implemented.'}
                  </p>
                </div>
                {invoice ? (
                  <div style={{ marginTop: 16 }}>
                    {invoice.paymentIntentUrl ? (
                      <p className="mini-note">
                        Payment link:{' '}
                        <a href={invoice.paymentIntentUrl} target="_blank" rel="noreferrer">
                          open
                        </a>
                      </p>
                    ) : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {status !== 'sent' && status !== 'paid' && status !== 'void' ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={statusMutation.isPending}
                          onClick={() => handleStatusChange('sent')}
                        >
                          Mark as sent
                        </button>
                      ) : null}
                      {status !== 'void' && status !== 'paid' ? (
                        <button
                          type="button"
                          className="btn destructive"
                          disabled={statusMutation.isPending}
                          onClick={() => handleStatusChange('void')}
                        >
                          Void
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn"
                        disabled={pdfMutation.isPending}
                        onClick={() => handleGeneratePdf('invoice')}
                      >
                        {pdfMutation.isPending ? 'Preparing…' : 'Generate PDF'}
                      </button>
                      {status === 'paid' ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={receiptMutation.isPending}
                          onClick={() => handleGeneratePdf('receipt')}
                        >
                          {receiptMutation.isPending ? 'Preparing…' : 'Receipt'}
                        </button>
                      ) : null}
                    </div>
                    {invoice.pdfUrl ? (
                      <p className="mini-note" style={{ marginTop: 10 }}>
                        <a href={invoice.pdfUrl} target="_blank" rel="noreferrer">
                          View invoice PDF ↗
                        </a>
                      </p>
                    ) : null}
                    {invoice.receiptPdfUrl ? (
                      <p className="mini-note">
                        <a href={invoice.receiptPdfUrl} target="_blank" rel="noreferrer">
                          View receipt PDF ↗
                        </a>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Panel>
          </aside>
        </div>
      </form>
    </div>
  );
}

export default InvoiceEditorPage;
