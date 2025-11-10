import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import {
  useInvoice,
  useInvoicePdfRequest,
  useInvoiceStatusMutation,
  useSaveInvoice,
} from '../../hooks/useInvoices';
import { useCreatePaymentIntent } from '../../hooks/usePayments';
import { formatMoney } from '../../utils/currency';
import { useTenant } from '../../context/AuthContext';
import type { Invoice } from '../../types/invoice';

type InvoiceEditorPageProps = {
  mode: 'create' | 'edit'
}

type LineItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
}

const defaultItems: LineItem[] = [
  { id: '1', description: 'Product design retainer', quantity: 1, unitPrice: 3500, taxRate: 5 },
];

function InvoiceEditorPage({ mode }: InvoiceEditorPageProps) {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { activeOrgId, loading: tenantLoading } = useTenant();
  const saveInvoice = useSaveInvoice(activeOrgId ?? undefined);
  const statusMutation = useInvoiceStatusMutation(activeOrgId ?? undefined);
  const pdfMutation = useInvoicePdfRequest(activeOrgId ?? undefined);
  const receiptMutation = useInvoicePdfRequest(activeOrgId ?? undefined, 'receipt');
  const paymentIntentMutation = useCreatePaymentIntent(activeOrgId ?? undefined);
  const invoiceQuery = useInvoice(activeOrgId ?? undefined, mode === 'edit' ? invoiceId : undefined);

  const [clientName, setClientName] = useState('Acme Corporation');
  const [clientEmail, setClientEmail] = useState('billing@acme.com');
  const [issueDate, setIssueDate] = useState('2025-01-01');
  const [dueDate, setDueDate] = useState('2025-01-15');
  const [lineItems, setLineItems] = useState<LineItem[]>(() => defaultItems);
  const [notes, setNotes] = useState(
    'Thank you for your business! Payment is due within 14 days via Flutterwave or Paystack.',
  );
  const [currency, setCurrency] = useState<'USD' | 'NGN'>('USD');
  const [paymentProvider, setPaymentProvider] = useState<'flutterwave' | 'paystack'>('flutterwave');
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (invoiceQuery.data) {
      setClientName(invoiceQuery.data.clientName);
      setClientEmail(
        (invoiceQuery.data.metadata?.customerEmail as string | undefined) ?? invoiceQuery.data.clientName.toLowerCase().replace(/\s+/g, '.') + '@example.com',
      );
      setIssueDate(invoiceQuery.data.issueDate.substring(0, 10));
      setDueDate(invoiceQuery.data.dueDate.substring(0, 10));
      setLineItems(
        invoiceQuery.data.lineItems.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
        })),
      );
      setNotes(invoiceQuery.data.notes ?? '');
      setCurrency(invoiceQuery.data.currency === 'NGN' ? 'NGN' : 'USD');
      setPaymentLink(invoiceQuery.data.paymentIntentUrl ?? null);
    }
  }, [invoiceQuery.data]);

  const totals = useMemo(() => {
    return lineItems.reduce(
      (acc, item) => {
        const subtotal = item.quantity * item.unitPrice;
        const tax = subtotal * (item.taxRate / 100);
        return {
          subtotal: acc.subtotal + subtotal,
          tax: acc.tax + tax,
          total: acc.total + subtotal + tax,
        };
      },
      { subtotal: 0, tax: 0, total: 0 },
    );
  }, [lineItems]);

  const handleAddLineItem = () => {
    const nextId = String(lineItems.length + 1);
    setLineItems([
      ...lineItems,
      {
        id: nextId,
        description: 'New service',
        quantity: 1,
        unitPrice: 0,
        taxRate: 0,
      },
    ]);
  };

  const handleLineItemChange = (itemId: string, field: keyof LineItem, value: string) => {
    setLineItems((items) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: field === 'description' ? value : Number(value),
            }
          : item,
      ),
    );
  };

  const handleRemoveLineItem = (itemId: string) => {
    setLineItems((items) => items.filter((item) => item.id !== itemId));
  };

  const handleStatusChange = async (nextStatus: Invoice['status']) => {
    if (!invoiceId || !activeOrgId) return;
    try {
      setFormError(null);
      await statusMutation.mutateAsync({ invoiceId, status: nextStatus });
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleGeneratePdf = async () => {
    if (!invoiceId || !activeOrgId) return;
    try {
      setFormError(null);
      await pdfMutation.mutateAsync(invoiceId);
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleGenerateReceipt = async () => {
    if (!invoiceId || !activeOrgId) return;
    try {
      setFormError(null);
      await receiptMutation.mutateAsync(invoiceId);
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleCreatePaymentIntent = async () => {
    if (!invoiceId || !invoiceQuery.data || !clientEmail) {
      setFormError('Client email required before generating payment link.');
      return;
    }
    try {
      setFormError(null);
      const link = await paymentIntentMutation.mutateAsync({
        invoice: invoiceQuery.data,
        provider: paymentProvider,
        customerEmail: clientEmail,
      });
      if (link) {
        setPaymentLink(link);
      }
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const subtotal = totals.subtotal;
    const taxTotal = totals.tax;
    const total = totals.total;

    if (!activeOrgId) {
      return;
    }

    try {
      setFormError(null);
      await saveInvoice.mutateAsync({
        id: mode === 'edit' ? invoiceId : undefined,
        organizationId: activeOrgId,
        clientName,
        clientId: `client-${clientName.toLowerCase().replace(/\s+/g, '-')}`,
        issueDate,
        dueDate,
        currency,
        metadata: {
          customerEmail: clientEmail,
        },
        lineItems: lineItems.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          total: { amount: (item.quantity * item.unitPrice * (100 + item.taxRate)) / 100, currency },
        })),
        subtotal: { amount: subtotal, currency },
        taxTotal: { amount: taxTotal, currency },
        total: { amount: total, currency },
        notes,
      });
      navigate('/app/invoices');
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  if (tenantLoading || (invoiceQuery.isLoading && mode === 'edit')) {
    return <LoadingState message="Loading invoice details…" />;
  }

  if (!activeOrgId) {
    return <ErrorState title="No organization selected" description="Choose an organization to manage invoices." />;
  }

  if (invoiceQuery.isError && mode === 'edit') {
    return <ErrorState onRetry={() => invoiceQuery.refetch()} />;
  }

  return (
    <div className="page invoice-editor">
      <header className="page__header">
        <div>
          <h1>{mode === 'create' ? 'Create invoice' : `Edit ${invoiceId}`}</h1>
          <p>Build invoices with structured line items and metadata.</p>
        </div>
        <div className="page__actions">
          {mode === 'edit' ? (
            <>
              {invoiceQuery.data?.status !== 'sent' && invoiceQuery.data?.status !== 'paid' ? (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void handleStatusChange('sent')}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? 'Updating…' : 'Mark as sent'}
                </button>
              ) : null}
              {invoiceQuery.data?.status !== 'void' ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void handleStatusChange('void')}
                  disabled={statusMutation.isPending}
                >
                  Void invoice
                </button>
              ) : null}
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void handleGeneratePdf()}
                disabled={pdfMutation.isPending}
              >
                {pdfMutation.isPending ? 'Preparing PDF…' : 'Generate PDF'}
              </button>
              {invoiceQuery.data?.status === 'paid' ? (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void handleGenerateReceipt()}
                  disabled={receiptMutation.isPending}
                >
                  {receiptMutation.isPending
                    ? 'Preparing receipt…'
                    : invoiceQuery.data?.receiptPdfUrl
                    ? 'Regenerate receipt'
                    : 'Generate receipt'}
                </button>
              ) : null}
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void handleCreatePaymentIntent()}
                disabled={
                  paymentIntentMutation.isPending ||
                  !invoiceId ||
                  !invoiceQuery.data
                }
              >
                {paymentIntentMutation.isPending ? 'Creating payment link…' : 'Create payment link'}
              </button>
            </>
          ) : null}
          <button type="button" className="button button--ghost" onClick={() => navigate(-1)}>
            Back
          </button>
          <button type="submit" form="invoice-form" className="button button--primary">
            {saveInvoice.isPending ? 'Saving…' : mode === 'create' ? 'Save draft' : 'Update invoice'}
          </button>
        </div>
      </header>

      <form id="invoice-form" className="panel invoice-form" onSubmit={handleSubmit}>
        <section className="invoice-form__section">
          <h2>Client</h2>
          <label className="field">
            <span>Client name</span>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} />
          </label>
          <label className="field">
            <span>Billing email</span>
            <input
              type="email"
              value={clientEmail}
              onChange={(event) => setClientEmail(event.target.value)}
              placeholder="client@example.com"
            />
          </label>
        </section>

        <section className="invoice-form__section">
          <h2>Schedule</h2>
          <div className="invoice-form__grid">
            <label className="field">
              <span>Issue date</span>
              <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
            </label>
            <label className="field">
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)}>
              <option value="USD">USD</option>
              <option value="NGN">NGN</option>
            </select>
          </label>
          <label className="field">
            <span>Preferred payment provider</span>
            <select
              value={paymentProvider}
              onChange={(event) => setPaymentProvider(event.target.value as typeof paymentProvider)}
            >
              <option value="flutterwave">Flutterwave</option>
              <option value="paystack">Paystack</option>
            </select>
          </label>
        </section>

        <section className="invoice-form__section">
          <h2>Line items</h2>
          <div className="line-items">
            <div className="line-items__header">
              <span>Description</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span>Tax %</span>
              <span>Total</span>
              <span />
            </div>

            {lineItems.map((item) => {
              const subtotal = item.quantity * item.unitPrice
              const tax = subtotal * (item.taxRate / 100)
              const total = subtotal + tax

              return (
                <div key={item.id} className="line-items__row">
                  <input
                    value={item.description}
                    onChange={(event) => handleLineItemChange(item.id, 'description', event.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(event) => handleLineItemChange(item.id, 'quantity', event.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.unitPrice}
                    onChange={(event) => handleLineItemChange(item.id, 'unitPrice', event.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.taxRate}
                    onChange={(event) => handleLineItemChange(item.id, 'taxRate', event.target.value)}
                  />
                  <span>{formatMoney({ amount: total, currency })}</span>
                  <button type="button" className="button button--ghost" onClick={() => handleRemoveLineItem(item.id)}>
                    Remove
                  </button>
                </div>
              )
            })}

            <button type="button" className="button button--secondary" onClick={handleAddLineItem}>
              Add line item
            </button>
          </div>
        </section>

        <section className="invoice-form__section">
          <h2>Notes & attachments</h2>
          <label className="field">
            <span>Internal notes</span>
            <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {formError ? <p className="auth-error">{formError}</p> : null}
        </section>

        <aside className="invoice-summary">
          <h2>Summary</h2>
          {invoiceQuery.data ? (
            <div className="invoice-summary__meta">
              <p>
                <span className="invoice-summary__meta-label">Status</span>
                <span
                  className={`badge ${
                    invoiceQuery.data.status === 'paid'
                      ? 'badge--success'
                      : invoiceQuery.data.status === 'void'
                      ? 'badge--danger'
                      : invoiceQuery.data.status === 'overdue'
                      ? 'badge--warning'
                      : 'badge--info'
                  }`}
                >
                  {invoiceQuery.data.status}
                </span>
              </p>
              <p>
                <span className="invoice-summary__meta-label">PDF</span>
                {invoiceQuery.data.pdfUrl ? (
                  <a href={invoiceQuery.data.pdfUrl} target="_blank" rel="noreferrer">
                    View invoice PDF
                  </a>
                ) : (
                  invoiceQuery.data.pdfStatus ?? 'Not generated'
                )}
              </p>
              <p>
                <span className="invoice-summary__meta-label">Receipt</span>
                {invoiceQuery.data.receiptPdfUrl ? (
                  <a href={invoiceQuery.data.receiptPdfUrl} target="_blank" rel="noreferrer">
                    View receipt PDF
                  </a>
                ) : invoiceQuery.data.status === 'paid' ? (
                  invoiceQuery.data.receiptPdfStatus ?? 'Not generated'
                ) : (
                  'Available after payment'
                )}
              </p>
              <p>
                <span className="invoice-summary__meta-label">Payment link</span>
                {paymentLink ? (
                  <a href={paymentLink} target="_blank" rel="noreferrer">
                    Open payment link
                  </a>
                ) : (
                  'Not generated'
                )}
              </p>
            </div>
          ) : null}
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney({ amount: totals.subtotal, currency })}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{formatMoney({ amount: totals.tax, currency })}</dd>
            </div>
            <div className="invoice-summary__total">
              <dt>Total due</dt>
              <dd>{formatMoney({ amount: totals.total, currency })}</dd>
            </div>
          </dl>
          <p className="invoice-summary__hint">Payment links will be generated via Flutterwave or Paystack.</p>
        </aside>
      </form>
    </div>
  )
}

export default InvoiceEditorPage

