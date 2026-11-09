import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '../ui/Drawer';
import { StatusPill } from '../ui/StatusPill';
import { formatMoney } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { useToast } from '../../context/ToastContext';
import { useInvoiceStatusMutation } from '../../hooks/useInvoices';
import { useCreatePaymentIntent } from '../../hooks/usePayments';
import type { Invoice } from '../../types/invoice';

function InvoiceDrawer({
  invoice,
  organizationId,
  onClose,
}: {
  invoice: Invoice | null;
  organizationId?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { notify } = useToast();
  const statusMutation = useInvoiceStatusMutation(organizationId);
  const paymentIntentMutation = useCreatePaymentIntent(organizationId);
  const [provider, setProvider] = useState<'flutterwave' | 'paystack'>('paystack');

  const customerEmail = invoice?.metadata?.customerEmail as string | undefined;
  const busy = statusMutation.isPending || paymentIntentMutation.isPending;

  const changeStatus = async (status: Invoice['status']) => {
    if (!invoice) return;
    try {
      await statusMutation.mutateAsync({ invoiceId: invoice.id, status });
      notify(`${invoice.number} marked as ${status}.`);
    } catch (error) {
      notify((error as Error).message);
    }
  };

  const createPaymentLink = async () => {
    if (!invoice) return;
    if (!customerEmail) {
      notify('Add a billing email on the invoice before creating a payment link.');
      return;
    }
    try {
      const link = await paymentIntentMutation.mutateAsync({ invoice, provider, customerEmail });
      notify(link ? 'Payment link created.' : 'Provider did not return a link.');
    } catch (error) {
      notify((error as Error).message);
    }
  };

  return (
    <Drawer open={Boolean(invoice)} onClose={onClose}>
      {invoice ? (
        <>
          <p className="eyebrow">Invoice details</p>
          <h2>{invoice.number}</h2>
          <p>
            Issued to {invoice.clientName} · {formatDate(invoice.issueDate)}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
            <StatusPill status={invoice.status} />
            <b style={{ font: '800 23px Manrope' }}>{formatMoney(invoice.total)}</b>
          </div>

          <div className="info">
            {invoice.pdfUrl ? (
              <>
                <b>PDF ready:</b>{' '}
                <a href={invoice.pdfUrl} target="_blank" rel="noreferrer">
                  Open document
                </a>
              </>
            ) : (
              <>PDF generation is a placeholder in this build — receipts unlock after payment.</>
            )}
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <label>Payment provider</label>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as 'flutterwave' | 'paystack')}
            >
              <option value="paystack">Paystack</option>
              <option value="flutterwave">Flutterwave</option>
            </select>
          </div>

          <div className="drawer-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || invoice.status === 'paid' || invoice.status === 'void'}
              onClick={createPaymentLink}
            >
              {paymentIntentMutation.isPending ? 'Creating…' : 'Create payment link'}
            </button>
            <button type="button" className="btn" onClick={() => navigate(`/app/invoices/${invoice.id}`)}>
              View invoice
            </button>
          </div>
          <div className="drawer-actions" style={{ marginTop: 12 }}>
            {invoice.status !== 'sent' && invoice.status !== 'paid' && invoice.status !== 'void' ? (
              <button type="button" className="btn" disabled={busy} onClick={() => changeStatus('sent')}>
                Mark as sent
              </button>
            ) : null}
            {invoice.status !== 'paid' && invoice.status !== 'void' ? (
              <button type="button" className="btn" disabled={busy} onClick={() => changeStatus('paid')}>
                Mark as paid
              </button>
            ) : null}
            {invoice.status !== 'void' && invoice.status !== 'paid' ? (
              <button type="button" className="btn destructive" disabled={busy} onClick={() => changeStatus('void')}>
                Void invoice
              </button>
            ) : null}
          </div>
          {invoice.paymentIntentUrl ? (
            <p className="mini-note" style={{ marginTop: 18 }}>
              Payment link:{' '}
              <a href={invoice.paymentIntentUrl} target="_blank" rel="noreferrer">
                {invoice.paymentIntentUrl}
              </a>
            </p>
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}

export default InvoiceDrawer;
