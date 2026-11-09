import { query } from '../db/pool';
import { verifyPayment, type PaymentProvider } from '../services/paymentProviders';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function resolveProviderStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directStatus = typeof record.status === 'string' ? record.status : null;
  const nested =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>).status
      : null;

  return (typeof nested === 'string' ? nested : null) ?? directStatus;
}

export async function reconcilePendingPayments(): Promise<void> {
  const pending = await query<{
    id: string;
    organization_id: string;
    payment: { provider?: PaymentProvider; reference?: string } | null;
  }>(
    `SELECT id, organization_id, payment
     FROM invoices
     WHERE status = 'payment_pending'
     ORDER BY updated_at ASC
     LIMIT 50`,
  );

  const tasks = pending.rows.map(async (row) => {
    const provider = row.payment?.provider;
    const reference = row.payment?.reference;
    if (!provider || !reference) {
      return;
    }

    try {
      const response = await verifyPayment(provider, String(reference));
      const status = resolveProviderStatus(response);

      if (status && ['successful', 'success'].includes(status)) {
        await query(
          `UPDATE invoices
           SET status = 'paid',
               payment = payment || jsonb_build_object(
                 'reconciliation', $3::jsonb,
                 'reconciledAt', to_jsonb(now())
               ),
               updated_at = now()
           WHERE id = $1 AND organization_id = $2`,
          [row.id, row.organization_id, JSON.stringify(response)],
        );
      }
    } catch (error) {
      console.error(`Failed to reconcile invoice ${row.id}`, error);
    }
  });

  await Promise.all(tasks);
}

export function startReconcileJob(): void {
  const run = () => {
    reconcilePendingPayments().catch((error) => {
      console.error('Payment reconciliation run failed', error);
    });
  };

  // Run shortly after boot, then on the 6-hour cadence.
  setTimeout(run, 30_000).unref();
  setInterval(run, SIX_HOURS_MS).unref();
}
