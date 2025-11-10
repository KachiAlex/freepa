import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from '../lib/firebase';
import { verifyPayment } from '../services/paymentProviders';

const db = getFirestore();

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
    const status =
      data.payment.provider === 'flutterwave'
        ? (response as any)?.data?.status
        : (response as any)?.data?.status;

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

