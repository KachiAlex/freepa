import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from '../lib/firebase';
import { verifyWebhookSignature } from '../services/paymentProviders';

const db = getFirestore();

export const handleFlutterwaveWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const isValid = verifyWebhookSignature('flutterwave', req.rawBody.toString(), req.header('verif-hash'));
  if (!isValid) {
    res.status(400).send('Invalid signature');
    return;
  }

  const event = req.body;
  const organizationId = event?.data?.meta?.organizationId as string | undefined;
  const invoiceId = event?.data?.meta?.invoiceId as string | undefined;

  if (!organizationId || !invoiceId) {
    res.status(400).send('Missing metadata');
    return;
  }

  const invoiceRef = db.collection('organizations').doc(organizationId).collection('invoices').doc(invoiceId);
  await invoiceRef.set(
    {
      status: event.data.status === 'successful' ? 'paid' : 'payment_pending',
      payment: {
        provider: 'flutterwave',
        reference: event.data.id,
        raw: event,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );

  res.status(200).send('ok');
});

export const handlePaystackWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const isValid = verifyWebhookSignature('paystack', req.rawBody.toString(), req.header('x-paystack-signature'));
  if (!isValid) {
    res.status(400).send('Invalid signature');
    return;
  }

  const event = req.body;
  const organizationId = event?.data?.metadata?.organizationId as string | undefined;
  const invoiceId = event?.data?.metadata?.invoiceId as string | undefined;

  if (!organizationId || !invoiceId) {
    res.status(400).send('Missing metadata');
    return;
  }

  const invoiceRef = db.collection('organizations').doc(organizationId).collection('invoices').doc(invoiceId);
  await invoiceRef.set(
    {
      status: event.event === 'charge.success' ? 'paid' : 'payment_pending',
      payment: {
        provider: 'paystack',
        reference: event.data.reference,
        raw: event,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );

  res.status(200).send('ok');
});

