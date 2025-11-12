import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from '../lib/firebase';
import { verifyPayment } from '../services/paymentProviders';

const db = getFirestore();

function resolveProviderStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directStatus = typeof record.status === 'string' ? record.status : null;
  const nestedStatus =
    record.data && typeof record.data === 'object'
      ? (() => {
          const nested = record.data as Record<string, unknown>;
          return typeof nested.status === 'string' ? nested.status : null;
        })()
      : null;

  return nestedStatus ?? directStatus;
}

export const reconcilePayments = functions.pubsub.schedule('every 6 hours').onRun(async () => {
  const pendingPayments = await db
    .collectionGroup('invoices')
    .where('status', '==', 'payment_pending')
    .limit(50)
    .get();

  const tasks = pendingPayments.docs.map(async (doc) => {
    const data = doc.data() as { organizationId: string; payment?: { provider: 'flutterwave' | 'paystack'; reference: string } };
    if (!data.payment?.provider || !data.payment.reference || !data.organizationId) {
      return;
    }

    const response = await verifyPayment(data.payment.provider, data.payment.reference);
    const status = resolveProviderStatus(response);

    if (status && ['successful', 'success'].includes(status)) {
      await doc.ref.set(
        {
          status: 'paid',
          payment: {
            ...data.payment,
            reconciliation: response,
            reconciledAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
    }
  });

  await Promise.all(tasks);
});

